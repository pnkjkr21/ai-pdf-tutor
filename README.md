# AI PDF Tutor

Turn an uploaded PDF into an interactive, human-in-the-loop lesson with MCQs grounded only in the PDF.

This repo is built **incrementally**. Step 1 is project foundation only (no upload UI, LangGraph, CopilotKit, or quiz yet).

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js App Router + TypeScript |
| UI | React + Tailwind CSS |
| Agents | LangChain.js + LangGraph.js (later steps) |
| LLM | DeepSeek API (server-side only) |
| Agent UI | CopilotKit (selective; later) |
| DB | PostgreSQL + Prisma |
| Validation | Zod |
| PDF | Local filesystem storage (interface ready for S3/R2 later) |

## Architecture (folders)

```
src/
  app/                 # Next.js pages + route handlers + server actions
  components/          # React UI
  agents/
    graph/             # LangGraph workflow
    llm/               # DeepSeek integration
    prompts/           # Prompt templates
    schemas/           # Zod structured-output schemas
  domain/              # Deterministic quiz/progress services
  db/
    prisma.ts          # Prisma client
    repositories/      # DB access
  lib/
    pdf/               # PdfStorage interface + LocalPdfStorage
    env.ts             # Server env helpers
prisma/
  schema.prisma        # Lesson, PdfAsset, plan, objectives, questions, attempts, progress
storage/pdfs/          # Local PDF bytes (gitignored contents)
```

## Prerequisites

- Node.js 20+
- **PostgreSQL 14+ must be running** and reachable via `DATABASE_URL` before `prisma migrate` / `db:deploy` or any route that touches the DB. Step 1’s home page and `/api/health` do not need the DB; later steps will.

### Start Postgres (pick one)

**Docker** (matches `.env.example` credentials):

```bash
# Start Docker Desktop first, then:
docker run -d --name ai-pdf-tutor-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ai_pdf_tutor \
  -p 5432:5432 \
  postgres:16-alpine

# Wait until ready:
docker exec ai-pdf-tutor-pg pg_isready -U postgres
```

**Homebrew** (macOS):

```bash
brew install postgresql@16
brew services start postgresql@16
createdb ai_pdf_tutor
# Set DATABASE_URL in .env / .env.local to your local user (often no password on localhost).
```

Confirm connectivity before migrating: `pg_isready` or `psql "$DATABASE_URL" -c 'select 1'`.

## Environment files (easy footgun)

| Tool | Reads |
| --- | --- |
| Next.js (`npm run dev`) | `.env.local` (and `.env`) |
| Prisma CLI (`migrate`, `studio`, …) | **`.env` only** — not `.env.local` |

Keep them in sync:

```bash
cp .env.example .env
cp .env .env.local
# Edit DATABASE_URL / DEEPSEEK_API_KEY / PDF_STORAGE_PATH in both, or symlink:
# ln -sf .env .env.local
```

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (see above — Prisma needs .env)
cp .env.example .env
cp .env .env.local
# Edit:
#   DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ai_pdf_tutor?schema=public
#   DEEPSEEK_API_KEY=sk-...
#   PDF_STORAGE_PATH=./storage/pdfs

# 3. Postgres must already be running (see Prerequisites). With Docker above, the DB
#    ai_pdf_tutor is created automatically. Otherwise:
# createdb ai_pdf_tutor

# 4. Generate Prisma client + apply the committed init migration
npm run db:generate
npm run db:deploy
# (npm run db:migrate runs prisma migrate dev — also applies committed migrations;
#  prefer db:deploy for applying the checked-in init without creating a new one.)

# 5. Start the app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Health check: [http://localhost:3000/api/health](http://localhost:3000/api/health).

## Step 2 — PDF upload & parse

1. Ensure Postgres is up and `npm run db:deploy` has been applied.
2. Set `MAX_PDF_BYTES` / `MAX_PDF_PAGES` in `.env` and `.env.local` (see `.env.example`).
3. `npm run dev` → open the home page → choose a text-based PDF → **Upload & parse**.
4. On success you should see `status: PARSED`, a lesson id, page count, and a short text preview.
5. Bytes land under `storage/pdfs/<lessonId>/…`; `Lesson` + `PdfAsset` rows are in Postgres.

API: `POST /api/upload` with multipart field `file`.

- Invalid / oversized / non-PDF → `400` (no lesson created).
- Unreadable or empty extractable text → `422` with `status: FAILED` and `errorMessage` (lesson + file kept for debugging).

## Step 3 — Lesson plan + HITL approval

1. Set a real `DEEPSEEK_API_KEY` in `.env` and `.env.local` (never `NEXT_PUBLIC_*`).
2. Optional: `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `MAX_PLAN_SOURCE_CHARS` (default 60000).
3. Upload/parse a PDF (Step 2) → open `/lessons/<lessonId>` (link shown after parse).
4. **Generate lesson plan** → review title, difficulty, objectives.
5. Edit / reorder / regenerate as needed → **Approve plan**.
6. After approve: status `PLAN_APPROVED`, `approvedAt` set, **zero** `Question` rows. Quiz generation is Step 4.

APIs (Postgres is source of truth; approve does not call MCQ generation):

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/lessons/:id` | Lesson + plan + objectives |
| `POST` | `/api/lessons/:id/plan/generate` | From `PARSED` → pending plan |
| `PATCH` | `/api/lessons/:id/plan` | Save edits while pending |
| `POST` | `/api/lessons/:id/plan/regenerate` | Replace pending plan |
| `POST` | `/api/lessons/:id/plan/approve` | → `PLAN_APPROVED` only |

On DeepSeek/API failure during **generate**, lesson stays `PARSED` (recoverable). On **regenerate** failure, the existing pending plan is kept. Invalid LLM JSON is retried once; still-invalid output is not persisted.

## Step 4 — MCQ generation (post-approval)

1. Lesson must be `PLAN_APPROVED` with `approvedAt` set.
2. On `/lessons/<id>`, click **Generate quiz**.
3. DeepSeek writes 1–2 MCQs per objective (max 12 total) from truncated `PdfAsset.extractedText` only — **no embeddings / vector DB**.
4. Result: `Question` rows + `LessonProgress` (zeros) + status `QUIZ_READY`.
5. Client responses omit `correctIndex` and `explanation`. Interactive quiz UI is Step 5.

API: `POST /api/lessons/:id/quiz/generate`

| Rule | Behavior |
| --- | --- |
| Idempotency | One-shot. If questions already exist → `409 ALREADY_GENERATED` (checked before status; also blocks `QUIZ_READY` re-calls). Wrong status with no questions → `409 INVALID_STATUS`. |
| Wrong status | `409` unless `PLAN_APPROVED` |
| LLM failure | `502`; status stays `PLAN_APPROVED`; no partial questions (transaction) |
| Truncation | `MAX_QUIZ_SOURCE_CHARS` (default 60000; falls back to `MAX_PLAN_SOURCE_CHARS`) |

## Security notes (MVP)

- `DEEPSEEK_API_KEY` is **server-only**. Never use `NEXT_PUBLIC_*` for secrets.
- Correct MCQ answers stay server-side until the user answers correctly (enforced in later quiz steps).
- Treat uploads and model outputs as untrusted; validate LLM JSON with Zod before persist.
- Local PDF storage rejects path traversal (`..`, absolute paths).

## What is intentionally not in Step 4 yet

- Full quiz UI (radios, Submit, green/red, hints, retry)
- Answer grading / attempts / completion report
- CopilotKit
- Auth
- Embeddings / vector databases

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run db:generate` | `prisma generate` |
| `npm run db:deploy` | `prisma migrate deploy` (apply committed migrations; preferred) |
| `npm run db:migrate` | `prisma migrate dev` (dev workflow; applies existing migrations, can create new ones) |
| `npm run db:studio` | Prisma Studio |
| `npm run typecheck` | `tsc --noEmit` |

## Assumptions (v1)

- Single-user MVP; no auth
- Text-extractable English PDFs
- One lesson flow per upload
- Sensible upload limits enforced (`MAX_PDF_BYTES`, `MAX_PDF_PAGES`)

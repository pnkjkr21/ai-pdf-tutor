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

## Security notes (MVP)

- `DEEPSEEK_API_KEY` is **server-only**. Never use `NEXT_PUBLIC_*` for secrets.
- Correct MCQ answers stay server-side until the user answers correctly (enforced in later quiz steps).
- Treat uploads and model outputs as untrusted; validate LLM JSON with Zod before persist.
- Local PDF storage rejects path traversal (`..`, absolute paths).

## What is intentionally not in Step 1

- PDF upload / parse UI
- LangGraph plan + HITL interrupt
- MCQ generation
- Quiz UI / hints / completion report
- CopilotKit

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

## Assumptions (v1)

- Single-user MVP; no auth
- Text-extractable English PDFs
- One lesson flow per upload
- Sensible upload limits enforced in a later step

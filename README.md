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

# 4. Apply migrations, then regenerate the Prisma client
npm run db:deploy
npm run db:generate
# Always re-run db:generate after schema/migration changes, then restart the dev server.

# 5. Start the app
npm run dev
```

After pulling new migrations: `npm run db:deploy` → `npm run db:generate` → restart `npm run dev` (stale Prisma clients cause runtime errors).

Open [http://localhost:3000](http://localhost:3000). Health check: [http://localhost:3000/api/health](http://localhost:3000/api/health).

## Step 2 — PDF upload & parse

1. Ensure Postgres is up and `npm run db:deploy` has been applied.
2. Set `MAX_PDF_BYTES` / `MAX_PDF_PAGES` in `.env` and `.env.local` (see `.env.example`).
3. `npm run dev` → open the home page → choose a text-based PDF → **Upload & parse**.
4. On success you should see `status: PARSED`, a lesson id, page count, and a short text preview.
5. Bytes land under `storage/pdfs/<lessonId>/…`; `Lesson` + `PdfAsset` rows are in Postgres.

API: `POST /api/upload` with multipart field `file`.

- Invalid / oversized / non-PDF → `400` (no lesson created).
- Byte-identical to a PDF you already analyzed → `409` (see Step 10; no lesson created).
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

## Step 5 — Quiz play + deterministic grading

1. Open a `QUIZ_READY` lesson on `/lessons/<id>`.
2. Answer with radios + **Submit**. First submit → `IN_PROGRESS`.
3. Incorrect → red highlight, DeepSeek hint, **Retry** (no answer leak).
4. Correct → green highlight, explanation, **Next**.
5. Finish all questions → `COMPLETED`; the completion report (Step 7) loads on the lesson page.

APIs:

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/lessons/:id/quiz/current` | Safe current question + progress |
| `POST` | `/api/lessons/:id/quiz/answer` | Grade in app code; hint on miss |
| `POST` | `/api/lessons/:id/quiz/next` | Advance after correct |
| `POST` | `/api/lessons/:id/quiz/hint` | Another hint (same rules) |

Grading is never done by the LLM. `correctIndex` is never returned; `explanation` only after a correct answer for that question.

## Step 6 — Learn more (guide back to quiz)

After an incorrect answer, **Learn more** requests a short PDF-grounded mini-lesson for the current question’s topic.

- Does **not** reveal which choice is correct (prompt rules + verbatim correct-choice filter).
- Does **not** advance the quiz; UI keeps the same question with Retry / **Back to question**.
- API: `POST /api/lessons/:id/quiz/learn-more`
- Optional persistence: `Attempt.learnMoreRequested` for later reporting.

## Step 7 — Completion report

When the quiz finishes (`COMPLETED` / all questions answered correctly):

1. **Metrics in app code** (not the LLM): objectives/questions completed, first-attempt accuracy, retries, strong areas (high first-try success), weak areas (misses/retries).
2. **Study tips via DeepSeek**, grounded in truncated PDF text + strong/weak objectives; Zod-validated before persist.
3. Payload stored in `LessonProgress.reportJson`.
4. UI: `CompletionReport` on `/lessons/<id>` when the quiz phase is finished (metrics + tips; optional regenerate).

APIs:

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/lessons/:id/report` | Return persisted report, or generate once if missing (idempotent) |
| `POST` | `/api/lessons/:id/report` | Recompute metrics + regenerate tips (`COMPLETED` only) |

| Rule | Behavior |
| --- | --- |
| Wrong status | `409 NOT_COMPLETED` unless `COMPLETED` |
| Idempotency | `GET` reuses `reportJson` when present; does not reset quiz state |
| Answer secrecy | Report responses never include `correctIndex` / answer keys |
| LLM failure | `502`; lesson stays `COMPLETED`; existing report (if any) unchanged |

No embeddings / vector DB — PDF text truncation only (same pattern as plan/MCQ/hints).

## Step 8 — PDF library side panel

Every page renders a left rail (`LessonSidebar` inside `AppShell`) listing every PDF analysed so far, so you can switch lessons mid-analysis without losing state — progress lives in Postgres per lesson.

- Most recently updated first, with status badge, `questionsCompleted/questionCount`, and relative timestamp.
- Active lesson is highlighted (`aria-current="page"`); **+ Upload a new PDF** returns to the home page.
- A name filter appears once there are more than five lessons.
- Collapsed behind a **Browse PDF library** toggle below the `lg` breakpoint.

API: `GET /api/lessons?limit=<1–50>` (default and hard cap 50; invalid values fall back to the default).

The payload is metadata only — it never selects `PdfAsset.extractedText` or any `Question` column.

## Step 9 — Review previously answered questions

While a quiz is running, **Review previous questions** opens a read-only trail of everything already answered correctly, with ← Previous / Next → and **Back to current question**.

- Each reviewed question shows every choice tried, the correct choice, the explanation, and whether a hint / learn more was used.
- Purely read-only: it never advances the cursor, records an attempt, or changes lesson status.
- Available mid-quiz and after completion; the live question and completion report are hidden while the panel is open.

API: `GET /api/lessons/:id/quiz/history`

| Rule | Behavior |
| --- | --- |
| Answer secrecy | Only questions with a `CORRECT` attempt are returned. Unsolved questions — including the current one — are omitted entirely, so their `prompt`, `correctIndex`, and `explanation` never reach the client. |
| Fail closed | The route re-asserts the invariant per item before responding and `500`s rather than serve an unsolved question's key. |
| Wrong status | `409 INVALID_STATUS` unless `QUIZ_READY` / `IN_PROGRESS` / `COMPLETED`; `404` for an unknown lesson. |

## Step 10 — Duplicate PDF detection & lesson delete

### Re-upload detection

`PdfAsset.sha256` holds a sha256 of the **raw uploaded bytes**. It is computed in `uploadAndParsePdf` after validation but **before** the `Lesson` row or the file exist, so a detected duplicate writes nothing at all.

- Match → `409` with `code: "DUPLICATE_PDF"` and a `duplicate` object naming the existing lesson (title, status, `questionsCompleted/questionCount`, upload date).
- The UI offers **Open existing lesson** or **Upload a fresh copy anyway**. The override re-sends the same file with form field `allowDuplicate=true`; nothing is replaced — you get a second, independent lesson.
- The hash is recorded on the override path too, so a third upload still sees both copies.

| Rule | Behavior |
| --- | --- |
| Blocking statuses | `PARSED`, `PLAN_PENDING_APPROVAL`, `PLAN_APPROVED`, `QUIZ_READY`, `IN_PROGRESS`, `COMPLETED` |
| `FAILED` never blocks | Re-uploading is the fix for a failed parse — blocking would wedge every scanned PDF permanently |
| `UPLOADED` never blocks | Means a crashed mid-flight upload; also stops a double-submit from colliding with its own in-flight row |
| Validation wins | A non-PDF still gets its specific `400` (`INVALID_MAGIC`, `TOO_LARGE`, …), never a `409` |
| Index is not unique | The override deliberately creates a second row with the same hash |
| Ordering | Most recently updated match, matching the sidebar's top-to-bottom order |

Only exact byte matches are detected. The same document re-exported to different bytes is not — `Lesson.sourceTextHash` would catch that, but it is only available after parsing (i.e. after the lesson and file already exist), so it stays write-only.

**Backfill** — rows uploaded before this step have `sha256: null` and never match. Populate them once:

```bash
node scripts/backfill-pdf-hashes.mjs
```

Idempotent (only touches `sha256 IS NULL`). A missing file is reported, not fatal — that row keeps `sha256: null` and simply never blocks.

### Delete a lesson

Hover a row in the sidebar (always visible on touch) → confirm inline. This is what keeps duplicate-blocking recoverable: delete the old copy and the same PDF uploads cleanly again.

API: `DELETE /api/lessons/:id` → `{ ok: true, lessonId }`, or `404 NOT_FOUND`.

| Rule | Behavior |
| --- | --- |
| Cascade | All child rows (`PdfAsset`, plan, objectives, questions, attempts, progress) are `onDelete: Cascade` |
| Disk | `PdfStorage.deleteLessonFiles(lessonId)` removes `storage/pdfs/<lessonId>/` **and** the directory itself |
| Order | DB first, disk second, **not** in a transaction — Prisma cannot roll back an `unlink`. A failed disk cleanup leaves an invisible orphan directory; the reverse would leave a visibly broken lesson whose hash still blocks re-upload |
| Deleting the open lesson | Redirects to `/` |

## Security notes (MVP)

- `DEEPSEEK_API_KEY` is **server-only**. Never use `NEXT_PUBLIC_*` for secrets.
- Correct MCQ answers stay server-side until the user answers correctly.
- Treat uploads and model outputs as untrusted; validate LLM JSON with Zod before persist.
- Local PDF storage rejects path traversal (`..`, absolute paths). `deleteLessonFiles` is a recursive delete, so it additionally requires the lesson id to match `^[A-Za-z0-9_-]+$` and refuses to resolve to the storage root.
- The duplicate `409` exposes lesson metadata. Fine for a single-user MVP, but any multi-tenant version **must** scope `findDuplicateByPdfHash` by owner, or uploading a file becomes a hash oracle for other users' documents.

## Intentionally out of scope (MVP)

- CopilotKit, auth, embeddings / vector DB

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

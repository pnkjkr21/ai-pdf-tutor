# AI PDF Tutor

Turn any PDF into an interactive lesson with:

1. **Plan** – LangGraph analyzes the PDF and drafts learning objectives + difficulty  
2. **HITL approval** – you review/approve the plan before quizzing starts  
3. **Quiz loop** – generative MCQ widget (radio + submit) per objective  
4. **Feedback** – green explanation on correct, red hint + retry on incorrect  
5. **Summary** – score, weak/strong areas, personalized study tips  
6. **CopilotKit tutor chat** – ask for hints / learn more (never reveals answers)

Built with **TypeScript**, **Next.js**, **LangGraph**, and **CopilotKit**.

## Quick start

```bash
cd ai-pdf-tutor
cp .env.example .env.local
# add DEEPSEEK_API_KEY=sk-...  (from https://platform.deepseek.com)

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Upload `public/samples/photosynthesis.pdf` (or any text-based PDF).

> Without an API key the app still runs a **demo lesson** so you can walk the full HITL + MCQ UX.

## Demo flow (for Loom)

1. Upload the sample photosynthesis PDF  
2. Wait for the drafted plan (objectives + difficulty)  
3. Click **Approve plan & start quiz** (HITL interrupt)  
4. Answer MCQs — try a wrong answer to see red hint + retry  
5. Answer correctly to see green explanation, then continue  
6. Open the **Tutor chat** sidebar and ask for a hint (it must not spoil the answer)  
7. Finish all objectives and review the progress summary  

## Architecture

```text
Browser
  ├─ Lesson UI (plan card, MCQ widget, summary)
  ├─ CopilotKit sidebar (hints / learn more)
  └─ API
       ├─ POST /api/upload     → pdf-parse → session store
       ├─ POST /api/lesson     → LangGraph start (plan → interrupt)
       ├─ PUT  /api/lesson     → LangGraph resume (Command)
       └─ POST /api/copilotkit → DeepSeek tutor via CopilotKit runtime
```

### LangGraph nodes

`draft_plan` → `await_plan_approval` (interrupt) → `prepare_questions` → `await_answer` (interrupt loop) → `next_objective` / `summarize` → `present_summary`

Checkpointer: SQLite (`data/langgraph.sqlite`) so HITL state survives refresh/restart.

PDF text extraction uses `unpdf`. Lesson rows sync into `data/ai-pdf-tutor.sqlite` via Drizzle.

### Database (SQLite + Drizzle)

Persistent lesson schema lives in `src/db/`:

- `lessons`, `objectives`, `quizzes`, `student_progress`, `attempts`
- Typed client: `import { db } from "@/db"`
- Migrations in `/drizzle`

```bash
npm run db:generate   # after schema changes
npm run db:migrate    # apply migrations
npm run db:studio     # Drizzle Studio
```

Default file: `./data/ai-pdf-tutor.sqlite` (override with `DATABASE_URL`).

## Scripts

```bash
npm run sample:pdf   # regenerate public/samples/photosynthesis.pdf
npm run dev
npm run build
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | Recommended | Enables real plan/MCQ/summary + tutor chat |
| `DEEPSEEK_MODEL` | No | Default `deepseek-v4-flash` |
| `DATABASE_URL` | No | SQLite path (default `./data/ai-pdf-tutor.sqlite`) |



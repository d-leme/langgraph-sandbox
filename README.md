# LangGraph Sandbox — Next.js demo app

A compact set of LangGraph demos built with Next.js. Explore orchestration patterns: fan-out/fan-in, RAG, multi-agent via MCP, and stateful rollback.

## Demos
- Demo 1 — Fan-in/Fan-out: Three models run in parallel, an aggregator selects the best response. Route: `/demo1` → API: `POST /api/ai-chat`
- Demo 2 — RAG: Upload text, vectorize, and retrieve relevant chunks for grounded answers. Route: `/demo2` → API: `POST /api/rag`
- Demo 3 — Agentic (MCP): Orchestrator routes to Web agent (Playwright MCP) to scrape, then FS agent (filesystem MCP) to save a Markdown summary. Route: `/demo3` → API: `POST /api/multi-agent`
- Demo 4 — Rollback: In-memory versioning per thread enables undo/time-travel of conversations. Route: `/demo4` → APIs: `POST /api/rollback-chat`, `POST /api/rollback`

## Quick start
Prereqs: Node 18+ and an OpenAI API key.

1) Set env
```bash
export OPENAI_API_KEY="your-key-here"
```

2) Install deps
```bash
npm install
```

3) Run dev server
```bash
npm run dev
```

Open http://localhost:3000 and try the demo pages.

## Tech stack
- Next.js 15 (App Router), TypeScript
- Tailwind CSS + shadcn/ui
- LangGraph + LangChain, OpenAI (chat + embeddings)
- TanStack Query for data fetching/state

## API endpoints
- `POST /api/ai-chat` — Fan-out to multiple models, aggregate best
- `POST /api/rag` — Load md files from `ai-context/`, split, embed (in-memory), retrieve, answer
- `POST /api/multi-agent` — Orchestrator routes Web/FS agents via MCP
- `POST /api/rollback-chat` — Chat turn + snapshot versioning
- `POST /api/rollback` — Roll back a thread to a prior version

Note (Demo 3): The Web/FS agents spawn MCP servers via `npx`. On Linux, Playwright may require a display. If needed, run under a desktop session or a virtual display (e.g., Xvfb).

## Project structure
```
src/
  app/
    demo1/
    demo2/
    demo3/
    demo4/
    api/
      ai-chat/
      rag/
      multi-agent/
      rollback/
      rollback-chat/
    layout.tsx
    page.tsx
  components/
    ai-chat.tsx
    app-sidebar.tsx
    providers/
    ui/
  hooks/
  lib/
  styles/
ai-context/           # Local context for the RAG demo
public/
```

## Scripts
- `npm run dev` — Start dev server
- `npm run build` — Build production bundle
- `npm run start` — Start production server
- `npm run lint` / `npm run lint:fix` — Lint code
- `npm run typecheck` — TypeScript checks
- `npm run preview` — Build then start

## Troubleshooting
- Missing key: Ensure `OPENAI_API_KEY` is set in your shell (or a `.env` loaded by your tooling).
- Playwright MCP issues (Demo 3): Make sure Node can run `npx @playwright/mcp`; some systems need browser dependencies or a display.

—
See `langgraph-presentation.md` for a short talk track to accompany these demos.

# DevReview

A terminal-style AI code review tool. Paste a function, file, or GitHub PR URL — get structured, categorised feedback streamed back line by line, the way a CLI would print it.

Built as a portfolio piece to explore AI integration, streaming UIs, and developer-tooling UX.

---

## Status

This repository is under active development. The UI shell and streaming plumbing are in place; Claude wiring and GitHub PR ingestion are next.

| Area | State |
|---|---|
| Split-pane terminal UI | Shipped |
| Language detection (TS/JS/Python/Rust/Go) | Shipped |
| Simulated streaming output | Shipped |
| `POST /api/review` SSE route | Stubbed — returns a fixed event sequence |
| Anthropic Claude streaming | Planned |
| GitHub PR diff fetch | Planned (input UI only) |
| Live deploy | Not yet |

A screenshot of the current UI lives at `docs/screenshot.png` (add yours here).

---

## What it does

Two ways to feed it code:

1. **Paste** — drop in a function, file, or diff. Language is auto-detected from a lightweight regex heuristic and reflected in a coloured pill.
2. **GitHub PR URL** — paste a PR link, the unified diff is fetched, hunks are split by file, and each touched file is reviewed in sequence.

Output streams back as categorised lines:

- `[SECURITY]` — red — vulnerabilities, unsafe patterns, missing auth
- `[PERF]` — amber — N+1s, sync-in-loop, obvious hot paths
- `[STYLE]` — gray — readability, decomposition, naming
- `[GOOD]` — green — what the code is doing right

A summary line closes out with issue / suggestion / positive counts.

Keyboard-first: `⌘ Enter` runs a review, `Esc` clears.

---

## Why this project

It's a deliberate counterpoint to a warmer companion project of mine. Same designer, opposite palette and audience:

- **Dark terminal aesthetic** — sharp 1px borders, no rounded corners on the main panes, monospace throughout (JetBrains Mono)
- **Streaming over batch** — SSE chunks feel more like an LLM and less like a form submission
- **Developer-tool UX** — keyboard shortcuts, lowercase labels, a status pulse, a footer crediting the model

The goal is something a developer would actually want to use, not a demo.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | Route handlers, RSC, native streaming |
| Language | TypeScript | |
| Styling | Tailwind CSS v4 | `@theme` in CSS, no config file needed |
| Font | JetBrains Mono via `next/font/google` | Self-hosted, zero layout shift |
| AI | Anthropic Claude (SDK installed; wiring next) | Strong at code reasoning |
| Streaming | Server-Sent Events from a Route Handler | Simpler than WebSockets for one-way streams |
| GitHub | REST API via personal access token | Public + authorised private repos |
| Deployment | Vercel (planned) | |

---

## Architecture

```
┌─────────────────────────────┐    POST /api/review     ┌──────────────────────┐
│ Client (app/page.tsx)       │ ──────────────────────▶ │ Route handler        │
│  - textarea + gutter        │   { code, language }    │  app/api/review/     │
│  - language detection       │                         │    route.ts          │
│  - SSE event consumer       │ ◀────────────────────── │                      │
│  - categorised renderer     │   text/event-stream     │  Anthropic.messages  │
└─────────────────────────────┘                         │    .stream({ ... })  │
                                                        └──────────────────────┘
```

Events the route emits (and the client renders):

```
event: status   data: { "state": "reviewing" }
event: chunk    data: { "kind": "header", "file": "UserAuthService.ts" }
event: chunk    data: { "kind": "item", "tag": "security", "line": 14, "body": "…" }
event: chunk    data: { "kind": "summary", "issues": 2, "suggestions": 1, "positives": 1 }
event: status   data: { "state": "idle" }
event: done     data: { "ok": true }
```

The contract is stable; only the source of the `chunk` events changes when Claude is wired in.

---

## Run locally

Requires Node 20+ (developed against 22.11).

```bash
git clone git@github.com:shaandre96/dev-review.git
cd dev-review
npm install
cp .env.example .env.local        # then fill in the keys below
npm run dev                       # http://localhost:3000
```

Environment variables (`.env.local`):

```
ANTHROPIC_API_KEY=     # https://console.anthropic.com/
GITHUB_TOKEN=          # https://github.com/settings/tokens (repo scope for private PRs)
```

`ANTHROPIC_API_KEY` is required once the Claude wiring lands. `GITHUB_TOKEN` is only needed for the PR-URL flow against private repos.

---

## Project structure

```
app/
  layout.tsx              # JetBrains Mono + global shell
  globals.css             # Tailwind v4 import, @theme overrides --font-mono
  page.tsx                # Full terminal UI (single client component)
  api/
    review/
      route.ts            # POST handler, returns text/event-stream
.env.example              # Required env var template
next.config.ts            # turbopack.root pinned to project
```

The UI is intentionally a single client component — it makes the streaming state machine easier to read end-to-end. As the surface grows (settings, history, auth), pieces will split out into `app/_components/`.

---

## Roadmap

- [ ] Wire `Anthropic.messages.stream()` into `/api/review` and replace the stub events
- [ ] Prompt engineering for reliable categorised output (system prompt + JSON schema or structured tool use)
- [ ] GitHub PR URL → diff fetch → per-file review loop
- [ ] Shiki syntax highlighting in the left pane
- [ ] Deploy to Vercel and add a public demo link
- [ ] Optional: persist reviews so re-running shows a diff between this run and the last

---

## Credits

Design originated as a Claude Design prototype, then ported to React/Tailwind. Built with Claude Code.

## Licence

MIT — see [LICENSE](LICENSE) once added.

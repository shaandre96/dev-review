# DevReview

A terminal-style AI code review tool. Paste a function, file, or GitHub PR URL — get structured, categorised feedback streamed back line by line, the way a CLI would print it.

Built as a portfolio piece to explore AI integration, streaming UIs, and developer-tooling UX.

---

## Status

The core review flow works end to end: paste code or a GitHub PR URL and get a live, categorised review streamed from Claude. Deploy is the remaining step.

| Area | State |
|---|---|
| Split-pane terminal UI | Shipped |
| Language detection (TS/JS/Python/Rust/Go) | Shipped |
| `POST /api/review` SSE route | Shipped |
| Anthropic Claude streaming | Shipped |
| GitHub PR diff fetch + review | Shipped |
| Privacy policy (`/privacy`) | Shipped |
| Biome lint / format | Shipped |
| Live deploy | Shipped |
| Roadmap item improvements| Not yet |

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

It seems LLMs and vibe coding is taking over the world. I've personally witnessed juniors submitting PRs for code they don't
understand and I'm a little tired of the hand-holding. I'm not an AI pessimist, but rather believe it can be leveraged to
speed up development and expedite personal development and growth if used in the "right" way. Just like reading and contributing to
open source projects in the past, it's a great tool for juniors or inexperienced developers to learn the syntax, systems and design patterns.

Yes, this project is developed with the assistance of agentic coding tools like Claude Code, Claude Design, v0, Cursor, etc. I strongly believe that any developer or engineer that cannot adapt to the changing landscape will be left behind. But every single line is reviewed, every single suggestion is considered. I believe AI is a great learning tool, great for research and scaffolding ideas (if communicated clearly); it certainly beats the countless hours trudging through outdated StackOverflow threads without answers and reading poor developer documentation.

The goal is something a developer would actually want to use, not just a portfolio demo. The idea is a single-focus tool to assist
developers in understanding where their code might be improved, or explain why a diff offered by their LLM of choice isn't
up to scratch. How you use this tool is up to you.

Secondarily, this is a highlight piece of my portfolio to support my job search in this incredibly saturated market.

It's a deliberate counterpoint to a warmer companion project of mine. Same designer, opposite palette and audience:

- **Dark terminal aesthetic** — sharp 1px borders, no rounded corners on the main panes, monospace throughout (JetBrains Mono)
- **Streaming over batch** — SSE chunks feel more like an LLM and less like a form submission
- **Developer-tool UX** — keyboard shortcuts, lowercase labels, a status pulse, a footer crediting the model

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | Route handlers, RSC, native streaming |
| Language | TypeScript | |
| Styling | Tailwind CSS v4 | `@theme` in CSS, no config file needed |
| Font | JetBrains Mono via `next/font/google` | Self-hosted, zero layout shift |
| AI | Anthropic Claude (Opus 4.7, streaming, structured tool use) | Strong at code reasoning |
| Streaming | Server-Sent Events from a Route Handler | Simpler than WebSockets for one-way streams |
| GitHub | REST API; user-supplied token for private repos | Public anonymous, private with the user's own token |
| Tooling | Biome (lint + format) | Single fast binary, no ESLint/Prettier split |
| Database | Neon Postgres + Drizzle ORM | Serverless Postgres; type-safe schema + SQL migrations |
| Auth | Auth.js v5 (Google + GitHub OAuth) | Database-backed sessions via the Drizzle adapter |
| Payments | Stripe (Checkout + Customer Portal + webhooks) | Hosted checkout; subscription state synced via webhook |
| Deployment | Vercel | |

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
ANTHROPIC_API_KEY=          # required — https://console.anthropic.com/
# ANTHROPIC_MODEL=          # optional, defaults to claude-opus-4-7
# ANTHROPIC_EFFORT=         # optional, defaults to high (low|medium|high|xhigh|max)
UPSTASH_REDIS_REST_URL=     # rate limiting — free DB at https://upstash.com/
UPSTASH_REDIS_REST_TOKEN=
# RATE_LIMIT_PER_MINUTE=1   # optional limit overrides (defaults shown)
# RATE_LIMIT_PER_DAY=5
# DAILY_REVIEW_CAP=20
DATABASE_URL=               # Postgres for accounts/billing/usage — https://neon.tech/
AUTH_SECRET=                # `npx auth secret` — signs the session cookie
AUTH_GITHUB_ID=             # GitHub OAuth app; callback <origin>/api/auth/callback/github
AUTH_GITHUB_SECRET=
AUTH_GOOGLE_ID=             # Google OAuth client; redirect <origin>/api/auth/callback/google
AUTH_GOOGLE_SECRET=
STRIPE_SECRET_KEY=          # Stripe test-mode secret key
STRIPE_PRICE_LITE=          # recurring monthly price ids (Stripe Dashboard)
STRIPE_PRICE_PRO=
STRIPE_WEBHOOK_SECRET=      # `stripe listen --forward-to localhost:3000/api/stripe/webhook`
```

After setting `DATABASE_URL`, apply the schema with `npm run db:migrate` (migrations are generated from `lib/db/schema.ts` via `npm run db:generate`).

Auth (accounts) needs `AUTH_SECRET` plus the Google and GitHub OAuth credentials above; without them, sign-in is disabled but anonymous reviews still work. Payments need the `STRIPE_*` vars and two recurring prices created in the Stripe Dashboard; for local webhooks, run the Stripe CLI listener shown above.

`ANTHROPIC_API_KEY` is the only strictly required variable. There is **no** server-side GitHub token: public PRs are fetched anonymously, and a private-repo review uses a token the user pastes into the UI for that single request (never stored, logged, or sent to the model).

The `UPSTASH_*` vars enable rate limiting (per-IP limits + a global daily cap) across serverless instances. Without them the app falls back to an in-memory limiter that works locally but is **not** enforceable in production. The global cap smooths spend under your **Anthropic Console monthly limit** — set that limit too; it is the hard ceiling.

---

## Project structure

```
app/
  layout.tsx              # JetBrains Mono + SessionProvider + global shell
  page.tsx                # Landing page + pricing cards (Free/Lite/Pro)
  review/page.tsx         # Terminal review UI (single client component)
  signin/page.tsx         # Styled Google + GitHub sign-in
  account/page.tsx        # Account info + deletion
  privacy/page.tsx        # Privacy policy
  providers.tsx           # SessionProvider wrapper
  _components/            # Shared client components (auth control, …)
  api/
    review/route.ts       # Review SSE handler
    auth/[...nextauth]/route.ts   # Auth.js handlers
    account/route.ts      # DELETE — account deletion
    checkout/route.ts     # Stripe Checkout redirect
    portal/route.ts       # Stripe Customer Portal redirect
    stripe/webhook/route.ts       # Stripe webhook → subscription sync
auth.ts                   # Auth.js v5 config (providers, adapter, session)
lib/
  db/                     # Drizzle schema + Neon client
  tiers.ts                # pricing model: tiers, model access, credit math
  entitlements.ts         # tier resolution from the subscription table
  stripe.ts               # Stripe client + price↔tier mapping
drizzle/                  # generated SQL migrations
```

The terminal lives at `/review` (one client component, so the streaming state machine reads end-to-end); `/` is the marketing + pricing landing.

---

## Roadmap

- [x] Wire `Anthropic.messages.stream()` into `/api/review` and replace the stub events
- [x] Prompt engineering for reliable categorised output (structured tool use)
- [x] GitHub PR URL → diff fetch → review with per-file attribution
- [ ] Shiki syntax highlighting in the left pane
- [x] Deploy to Vercel and add a public demo link
- [ ] Optional: persist reviews so re-running shows a diff between this run and the last

---

## Changelog

### 2026-05-30 — Model selection + cost-aware metering

**Added**
- Tier-gated model + effort picker in the terminal (Free: Haiku/medium, locked; Lite: + Sonnet; Pro: + Opus with effort choice).
- `/api/review` resolves the caller's tier, validates the requested model/effort server-side (never trusting the client), and meters: paid tiers enforce a monthly credit budget (pre-flight estimate, then actual-token deduction) tracked in Redis with a `usage_event` audit row; free stays on IP rate limits. `streamReview` now takes model/effort and reports real token usage (`lib/usage.ts`).

### 2026-05-30 — Stripe billing

**Added**
- Stripe Checkout for Lite/Pro (`/api/checkout`), Customer Portal (`/api/portal`), and a signature-verified webhook (`/api/stripe/webhook`) that syncs `subscription` tier/status/period from Stripe events.
- `lib/stripe.ts` — lazy client + price↔tier mapping (unit-tested). Pricing-card CTAs start checkout (sign-in first if needed); the account page gains a Billing section.
- Stripe env vars (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_LITE/PRO`, `STRIPE_WEBHOOK_SECRET`).

**Changed**
- The `/review` logo now links back to the landing page.

### 2026-05-29 — Landing page + pricing, terminal moved to /review

**Added**
- Marketing landing page at `/` with Free / Lite / Pro pricing cards (prices pulled from the tier config). Free → `/review`; Lite/Pro → sign-in (checkout lands with billing).

**Changed**
- The terminal review UI moved from `/` to `/review`; post-sign-in now lands there.

### 2026-05-29 — Sign-in UI, accounts & privacy

**Added**
- Styled `/signin` page (Google + GitHub) and a session-aware header control (tier badge, email, sign out).
- Effective tier resolved from the `subscription` table and exposed on the session — a signed-in user with no active plan is treated as free (`lib/tiers.ts` `tierFromSubscription`, `lib/entitlements.ts`).
- `/account` page with permanent **account deletion** (`DELETE /api/account`): removes profile, login connections, session, and subscription; usage rows are anonymised.

**Changed**
- Privacy policy rewritten for accounts: what's stored on sign-in, the session cookie, processors (Google / GitHub / Neon / Upstash / Stripe), cookieless analytics, and how to delete your data.

### 2026-05-29 — Auth.js (Google + GitHub)

**Added**
- Auth.js v5 wired with Google and GitHub OAuth, persisted to Neon via the Drizzle adapter using database-backed sessions (`auth.ts`, `app/api/auth/[...nextauth]/route.ts`).
- Auth env vars (`AUTH_SECRET`, `AUTH_GITHUB_ID/SECRET`, `AUTH_GOOGLE_ID/SECRET`). Sign-in is optional — anonymous reviews still work without it.

### 2026-05-29 — Pricing model + database foundation

**Added**
- Pricing/tier model (`lib/tiers.ts`): Free / Lite / Pro, model→tier access (Haiku / Sonnet / Opus), per-tier effort, and cost-aware credit math (each review deducts its real token cost). Unit-tested.
- Database foundation: Neon Postgres + Drizzle ORM. Schema covers the auth-adapter tables (`user` / `account` / `session` / `verificationToken`) plus `subscription` and `usage_event`, with the first generated SQL migration. Scripts: `db:generate`, `db:migrate`, `db:studio`.

### 2026-05-29 — License

**Added**
- MIT `LICENSE.md`.

### 2026-05-29 — Analytics

**Added**
- Vercel Analytics (`@vercel/analytics`) mounted in the root layout for privacy-friendly traffic insights.

### 2026-05-29 — Rate limiting

**Added**
- Rate limiting on `POST /api/review` to protect Anthropic spend: per-IP limits (default 1/min, 5/day) plus a **global daily cap** that refuses requests once the day's budget is hit, without calling the model.
- Backed by Upstash Redis so counters are shared across serverless instances; falls back to an in-memory limiter (dev only) when Upstash isn't configured.
- Throttled requests return `429` (`rate_limited`) or `503` (`daily_capacity_reached`) with a `Retry-After` header; limits are env-tunable (`RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY`, `DAILY_REVIEW_CAP`).

### 2026-05-29 — GitHub PR review + tooling

**Added**
- **GitHub PR review.** Paste a PR URL and DevReview fetches the unified diff from the GitHub API, budgets it by file, and streams a categorised review with each finding attributed to its file.
- **User-supplied tokens for private repos.** Public PRs are fetched anonymously; a private repo is reviewed by pasting a personal access token into the UI. The token is used only to fetch that one diff and is never stored, logged, written to the browser, or sent to the model.
- **Privacy policy** at `/privacy`, describing exactly what the app does with submitted code, diffs, and tokens.
- **In-app disclosures**: a privacy note on the token field, and a "nothing is cached — reviews run fresh" performance notice.
- **Biome** for lint/format, with `npm run lint` and `npm run format` scripts and a config matched to the project's style.

**Changed**
- Environment: `ANTHROPIC_API_KEY` is the only required variable (plus optional `ANTHROPIC_MODEL` / `ANTHROPIC_EFFORT`). Removed the server-side `GITHUB_TOKEN` — PR tokens are now supplied per request in the UI.
- GitHub diff fetches use `cache: no-store`; review results are never cached or persisted.

**Fixed**
- Accessibility/lint cleanup: explicit button `type`s, a valid "View source" link, an SVG `<title>`, and `role="tablist"` moved off the `<nav>` landmark.

### Earlier

- **Claude streaming** wired into `POST /api/review` via structured tool use (`report_finding` / `report_summary`), replacing the stubbed event sequence.
- **Terminal UI**: split-pane layout, language detection, SSE streaming renderer, keyboard-first controls.

---

## Credits

Design originated as a Claude Design prototype, then ported to React/Tailwind. Built with Claude Code.

## Licence

MIT — see [LICENSE](LICENSE.md).

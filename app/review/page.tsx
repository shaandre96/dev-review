"use client";

/**
 * DevReview — terminal-style AI code review tool.
 *
 * Palette + font live in `app/globals.css` (Tailwind v4 `@theme`), exposed as
 * `bg-bg`, `text-fg`, `border-line`, `text-dv-{red,amber,green,…}` etc. — see
 * that file for the full token list.
 */

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { detectLang, type LangKey } from "@/lib/lang";
import { parseSseFrame } from "@/lib/sse";
import { type Effort, MODEL_PRICING, type ModelId, TIERS } from "@/lib/tiers";
import { AuthControl } from "../_components/auth-control";
import { SiteFooter } from "../_components/site-footer";
import {
  ChunkView,
  ErrorBanner,
  GhostBtn,
  Kbd,
  PaneFoot,
  PaneHead,
  type ReviewChunk,
  type ReviewError,
  StatusDot,
  TabButton,
} from "./_components/bits";

/* ---------------------------------------------------------------- types ---- */

type Tab = "paste" | "pr";
type Status = "idle" | "reviewing";
/* ------------------------------------------------------------- constants ---- */

const SAMPLE = `// UserAuthService.ts
import { Database } from "./db";
import type { User, Credentials, Session } from "./types";

export class UserAuthService {
  constructor(private db: Database) {}

  async findByEmail(email: string): Promise<User | null> {
    // line 14 — vulnerable: raw string interpolation into SQL
    const query = "SELECT * FROM users WHERE email = '" + email + "'";
    const rows = await this.db.raw(query);
    return rows[0] ?? null;
  }

  async login(creds: Credentials): Promise<Session> {
    const user = await this.findByEmail(creds.email);
    if (!user) throw new AuthError("no such user");
    const ok = await verify(creds.password, user.passwordHash);
    if (!ok) throw new AuthError("bad credentials");
    return this.createSession(user);
  }

  async hydrateMany(ids: string[]): Promise<User[]> {
    const out: User[] = [];
    // line 38 — sequential awaits inside a loop
    for (const id of ids) {
      const u = await this.db.users.findById(id);
      if (u) out.push(u);
    }
    return out;
  }

  // line 67 — 94-line orchestrator; should be decomposed
  async authenticateAndAuthorize(req: Request): Promise<AuthContext> {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) throw new AuthError("missing token");
    const claims = await this.verifyToken(token);
    const user = await this.db.users.findById(claims.sub);
    if (!user) throw new AuthError("orphaned token");
    const roles = await this.db.roles.forUser(user.id);
    const perms = roles.flatMap(r => r.permissions);
    const tenant = await this.db.tenants.findById(user.tenantId);
    if (!tenant?.active) throw new AuthError("tenant inactive");
    return { user, tenant, roles, perms, claims };
  }
}
`;

const REVIEW: ReviewChunk[] = [
  { kind: "header", file: "UserAuthService.ts" },
  {
    kind: "item",
    tag: "security",
    line: 14,
    body: "Raw user input concatenated into SQL query. Use parameterised queries (`db.users.where({ email })`).",
  },
  {
    kind: "item",
    tag: "perf",
    line: 38,
    body: "`await` inside `for` loop detected. Refactor with `Promise.all()` to parallelise.",
  },
  {
    kind: "item",
    tag: "style",
    line: 67,
    body: "Function is 94 lines. Consider splitting into smaller responsibilities (verify → resolve → authorise).",
  },
  {
    kind: "item",
    tag: "good",
    body: "Error boundaries are well-structured. Auth middleware applied consistently.",
  },
  { kind: "summary", issues: 2, suggestions: 1, positives: 1 },
];

const LANG_BADGE: Record<LangKey, { label: string; cls: string }> = {
  typescript: {
    label: "TypeScript",
    cls: "border-dv-blue text-dv-blue bg-[rgba(122,183,255,0.06)]",
  },
  javascript: {
    label: "JavaScript",
    cls: "border-dv-yellow text-dv-yellow bg-[rgba(241,250,140,0.05)]",
  },
  python: {
    label: "Python",
    cls: "border-dv-yellow text-dv-yellow bg-[rgba(241,250,140,0.05)]",
  },
  rust: {
    label: "Rust",
    cls: "border-dv-amber text-dv-amber bg-[rgba(255,184,108,0.05)]",
  },
  go: {
    label: "Go",
    cls: "border-dv-cyan text-dv-cyan bg-[rgba(125,211,252,0.05)]",
  },
  plaintext: {
    label: "plaintext",
    cls: "border-line text-dim bg-transparent",
  },
};

/* ------------------------------------------------------------ utilities ---- */

/** High-resolution timestamp in ms; falls back to Date.now() when
 *  `performance` is unavailable (SSR). Module-scoped so it's a stable
 *  reference and never needs to appear in a hook dependency array. */
function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/* ----------------------------------------------------------------- page ---- */

export default function Page() {
  const [tab, setTab] = useState<Tab>("paste");
  const [code, setCode] = useState<string>(SAMPLE);
  const [prUrl, setPrUrl] = useState<string>("");
  // GitHub token for private-repo PRs. Kept in component memory only — never
  // persisted to localStorage/cookies, and cleared on Clear.
  const [token, setToken] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [chunks, setChunks] = useState<ReviewChunk[]>([]);
  const [elapsed, setElapsed] = useState<string>("—");
  const [copyLabel, setCopyLabel] = useState<string>("Copy");
  const [error, setError] = useState<ReviewError | null>(null);
  const [demoMode, setDemoMode] = useState<boolean>(false);

  // Tier (anonymous → free) gates which models/effort the user may pick.
  const { data: session } = useSession();
  const tier = TIERS[session?.user?.tier ?? "free"];
  const [model, setModel] = useState<ModelId>("claude-haiku-4-5");
  const [effort, setEffort] = useState<Effort>("medium");

  // Keep the selection valid for the current tier (e.g. after sign in/out).
  useEffect(() => {
    setModel((m) =>
      tier.allowedModels.includes(m) ? m : tier.allowedModels[0],
    );
    setEffort(tier.defaultEffort);
  }, [tier]);

  const codeRef = useRef<HTMLTextAreaElement | null>(null);
  const prInputRef = useRef<HTMLInputElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef<number>(0);

  /* derived */
  const lang = useMemo<LangKey>(() => detectLang(code), [code]);
  const lineCount = useMemo(
    () => (code === "" ? 1 : (code.match(/\n/g) || []).length + 1),
    [code],
  );
  const gutterText = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1).join("\n"),
    [lineCount],
  );

  /* ---------- streaming ---------- */
  const stopStream = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus("idle");
  }, []);

  /** Pre-baked playback for `?demo=1` (screenshots, offline demos). */
  const runDemoStream = useCallback(() => {
    let i = 0;
    const tick = () => {
      if (i >= REVIEW.length) {
        setStatus("idle");
        setElapsed(
          `done in ${((nowMs() - startedAtRef.current) / 1000).toFixed(1)}s`,
        );
        return;
      }
      setChunks((prev) => [...prev, REVIEW[i]]);
      i++;
      timerRef.current = setTimeout(
        tick,
        i === 1 ? 380 : 520 + Math.random() * 220,
      );
    };
    tick();
  }, []);

  /** Real review via POST /api/review (SSE). Payload is built by the caller. */
  const runRealStream = useCallback(
    async (payload: Record<string, unknown>) => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          let payload: { error?: ReviewError } = {};
          try {
            payload = (await res.json()) as { error?: ReviewError };
          } catch {
            /* not JSON */
          }
          setError(
            payload.error ?? {
              code: "http_error",
              message: `Request failed (${res.status})`,
            },
          );
          setStatus("idle");
          return;
        }

        // SSE: frames are separated by \n\n; each frame has `event:` and `data:` lines.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let sepIdx = buf.indexOf("\n\n");
          while (sepIdx !== -1) {
            const frame = buf.slice(0, sepIdx);
            buf = buf.slice(sepIdx + 2);
            handleSseFrame(frame);
            sepIdx = buf.indexOf("\n\n");
          }
        }
        setStatus("idle");
        setElapsed(
          `done in ${((nowMs() - startedAtRef.current) / 1000).toFixed(1)}s`,
        );
      } catch (err) {
        if (controller.signal.aborted) return; // user-initiated cancel — silent
        setError({
          code: "network",
          message: err instanceof Error ? err.message : "Network error",
        });
        setStatus("idle");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }

      function handleSseFrame(frame: string) {
        const { event, data } = parseSseFrame(frame);
        if (!data) return;
        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch {
          return;
        }
        if (event === "chunk") {
          setChunks((prev) => [...prev, payload as ReviewChunk]);
        } else if (event === "error") {
          setError(payload as ReviewError);
        }
        // `status` and `done` events are handled implicitly by the loop terminator.
      }
    },
    [],
  );

  const startReview = useCallback(() => {
    if (tab === "pr") {
      if (!prUrl.trim()) {
        prInputRef.current?.focus();
        return;
      }
    } else if (!code.trim()) {
      codeRef.current?.focus();
      return;
    }
    stopStream();
    setChunks([]);
    setError(null);
    setStatus("reviewing");
    startedAtRef.current = nowMs();
    if (demoMode) {
      runDemoStream();
    } else if (tab === "pr") {
      void runRealStream({
        source: "pr",
        prUrl: prUrl.trim(),
        token: token.trim() || undefined,
        model,
        effort,
      });
    } else {
      void runRealStream({
        source: "paste",
        code,
        language: detectLang(code),
        model,
        effort,
      });
    }
  }, [
    tab,
    code,
    prUrl,
    token,
    model,
    effort,
    demoMode,
    runDemoStream,
    runRealStream,
    stopStream,
  ]);

  const onClear = useCallback(() => {
    setCode("");
    setToken(""); // drop any entered token — don't retain it across reviews
    setChunks([]);
    setElapsed("—");
    setError(null);
    stopStream();
    codeRef.current?.focus();
  }, [stopStream]);

  const onCopy = useCallback(async () => {
    const text = outputRef.current?.innerText.trim() ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel("Copied");
      setTimeout(() => setCopyLabel("Copy"), 1100);
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch + review the PR. startReview handles empty-input focus and routing.
  const onFetchPr = useCallback(() => {
    startReview();
  }, [startReview]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        startReview();
        return;
      }
      if (e.key === "Escape") {
        const target = document.activeElement;
        if (target === codeRef.current || target === prInputRef.current) {
          e.preventDefault();
          onClear();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startReview, onClear]);

  /* Detect demo mode from `?demo=1` once on mount. Real reviews must NOT
     auto-fire — every page load would burn an Anthropic request. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDemoMode(new URL(window.location.href).searchParams.get("demo") === "1");
  }, []);

  /* Auto-run only in demo mode. Keyed on demoMode alone on purpose — we don't
     want this to re-fire when startReview's identity changes. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs only when demo mode turns on, not on every startReview change
  useEffect(() => {
    if (!demoMode) return;
    const id = setTimeout(() => startReview(), 450);
    return () => clearTimeout(id);
  }, [demoMode]);

  /* Tear down any in-flight stream on unmount. */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  /* keep output scrolled to bottom while streaming */
  // biome-ignore lint/correctness/useExhaustiveDependencies: chunks is a dep on purpose so each newly streamed chunk re-triggers the scroll
  useEffect(() => {
    if (status === "reviewing" && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [chunks, status]);

  /* sync gutter scroll with editor */
  const onEditorScroll = useCallback(() => {
    if (!gutterRef.current || !codeRef.current) return;
    gutterRef.current.scrollTop = codeRef.current.scrollTop;
  }, []);

  /* focus on tab change */
  useEffect(() => {
    if (tab === "paste") codeRef.current?.focus();
    else prInputRef.current?.focus();
  }, [tab]);

  /* ---------- render ---------- */
  const langBadge = LANG_BADGE[lang];
  const charCount = code.length;
  const isReviewing = status === "reviewing";

  return (
    <div
      className="grid h-screen w-screen bg-bg text-fg font-mono text-[13px] leading-[1.55] overflow-hidden"
      style={{ gridTemplateRows: "44px 1fr 32px" }}
    >
      {/* TOP BAR */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-[14px] border-b border-line bg-bg">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-fg-strong no-underline hover:text-fg"
        >
          <span className="inline-block w-[6px] h-[6px] bg-fg" />
          dev<span className="font-normal text-dim">·</span>review
        </Link>

        <div
          role="tablist"
          aria-label="Input mode"
          className="inline-flex items-center border border-line bg-surface"
        >
          <TabButton active={tab === "paste"} onClick={() => setTab("paste")}>
            Paste code
          </TabButton>
          <span className="w-px self-stretch bg-line" aria-hidden />
          <TabButton active={tab === "pr"} onClick={() => setTab("pr")}>
            GitHub PR URL
          </TabButton>
        </div>

        <div className="justify-self-end inline-flex items-center gap-3 text-dim text-[11.5px]">
          <AuthControl />
          <span className="w-px self-stretch bg-line my-1" aria-hidden />
          <span className="inline-flex items-center gap-2">
            <StatusDot reviewing={isReviewing} />
            {isReviewing ? "reviewing…" : "idle"}
          </span>
        </div>
      </header>

      {/* MAIN */}
      <main className="grid grid-cols-2 min-h-0">
        {/* LEFT PANE */}
        <section
          className="bg-surface grid min-h-0 min-w-0 border-r border-line"
          style={{ gridTemplateRows: "36px 1fr 32px" }}
        >
          <PaneHead>
            <span className="inline-flex items-center gap-2 min-w-0">
              <span
                className={`inline-flex items-center px-2 py-[2px] rounded-[2px] text-[11px] tracking-[0.02em] border ${langBadge.cls}`}
              >
                {langBadge.label}
              </span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ModelId)}
                disabled={tier.allowedModels.length <= 1}
                title="Model"
                className="bg-bg border border-line text-fg-soft text-[11px] px-1 py-[2px] outline-none disabled:opacity-60"
              >
                {tier.allowedModels.map((m) => (
                  <option key={m} value={m}>
                    {MODEL_PRICING[m].label}
                  </option>
                ))}
              </select>
              {tier.effortChoice ? (
                <select
                  value={effort}
                  onChange={(e) => setEffort(e.target.value as Effort)}
                  title="Effort"
                  className="bg-bg border border-line text-fg-soft text-[11px] px-1 py-[2px] outline-none"
                >
                  {(["low", "medium", "high", "xhigh"] as const).map((ef) => (
                    <option key={ef} value={ef}>
                      {ef}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-dimmer text-[11px]">{effort}</span>
              )}
            </span>
            <span className="text-dim text-[11.5px] whitespace-nowrap">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
              <span className="ml-1">to review</span>
            </span>
          </PaneHead>

          {tab === "paste" ? (
            <div
              className="grid min-h-0 overflow-hidden"
              style={{ gridTemplateColumns: "48px 1fr" }}
            >
              <div
                ref={gutterRef}
                className="bg-surface border-r border-line-soft text-[#3F4148] text-[12px] text-right pr-2 pt-[10px] select-none overflow-hidden whitespace-pre leading-[1.55]"
              >
                {gutterText}
              </div>
              <textarea
                ref={codeRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onScroll={onEditorScroll}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="// Paste a function, file, or diff…"
                className="w-full h-full bg-transparent text-fg font-mono text-[13px] leading-[1.55] resize-none border-0 outline-none whitespace-pre overflow-auto px-3 pt-[10px] pb-6 placeholder-faint"
                style={{ tabSize: 2, caretColor: "#50FA7B" }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-[14px] p-6 overflow-auto">
              <div>
                <div className="text-dim text-[11.5px] mb-[6px]">
                  github pull request url
                </div>
                <div className="grid grid-cols-[1fr_auto] border border-line bg-bg">
                  <input
                    ref={prInputRef}
                    value={prUrl}
                    onChange={(e) => setPrUrl(e.target.value)}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter") onFetchPr();
                    }}
                    placeholder="https://github.com/org/repo/pull/1234"
                    className="px-3 py-[10px] bg-transparent text-fg text-[13px] outline-none placeholder-faint"
                  />
                  <button
                    type="button"
                    onClick={onFetchPr}
                    className="px-[14px] border-l border-line bg-control hover:bg-control-hover text-fg text-[12px]"
                  >
                    Fetch diff
                  </button>
                </div>
              </div>

              <div>
                <div className="text-dim text-[11.5px] mb-[6px]">
                  github token{" "}
                  <span className="text-dimmer">
                    — optional, only for private repos
                  </span>
                </div>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") onFetchPr();
                  }}
                  placeholder="ghp_…  (leave blank for public repos)"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-3 py-[10px] border border-line bg-bg text-fg text-[13px] outline-none placeholder-faint"
                />
              </div>

              {/* Privacy: token handling. */}
              <div className="border-l-2 border-dv-amber pl-[10px] text-[11.5px] leading-[1.7] text-muted">
                <div className="text-dv-amber font-semibold mb-[2px]">
                  privacy
                </div>
                Your token is sent to our server only to fetch this diff from
                GitHub, then discarded. It is never stored, logged, written to
                your browser, or sent to the model. Prefer a fine-grained,
                read-only, short-lived token.{" "}
                <a
                  href="/privacy"
                  className="text-fg-faded underline hover:text-fg"
                >
                  Privacy policy →
                </a>
              </div>

              {/* No-caching disclosure. */}
              <div className="border-l-2 border-line pl-[10px] text-[11.5px] leading-[1.7] text-dim">
                <div className="text-muted font-semibold mb-[2px]">
                  heads up
                </div>
                Nothing is cached. Every run fetches a fresh diff and recomputes
                the review from scratch, so it may take a few seconds and
                repeating the same request won&apos;t return instantly.
              </div>

              <div className="text-dim text-[11.5px] leading-[1.7]">
                DevReview fetches the PR&apos;s unified diff and reviews the
                changed files, attributing each finding to its file.
              </div>
            </div>
          )}

          <PaneFoot>
            <span className="text-dimmer text-[11px]">
              {lineCount} line{lineCount === 1 ? "" : "s"} · {charCount} char
              {charCount === 1 ? "" : "s"}
            </span>
            <GhostBtn onClick={onClear}>Clear</GhostBtn>
          </PaneFoot>
        </section>

        {/* RIGHT PANE */}
        <section
          className="bg-surface grid min-h-0 min-w-0"
          style={{ gridTemplateRows: "36px 1fr 32px" }}
        >
          <PaneHead>
            <span className="text-muted text-[11.5px] tracking-[0.02em] lowercase">
              review output
            </span>
            <GhostBtn onClick={onCopy}>{copyLabel}</GhostBtn>
          </PaneHead>

          <div
            ref={outputRef}
            className="overflow-auto px-4 pt-[14px] pb-[18px] text-[13px] leading-[1.65] whitespace-pre-wrap break-words"
          >
            {chunks.length === 0 && !error ? (
              <div className="text-dim text-[12.5px] leading-[1.8] space-y-1">
                <div>
                  <span className="text-dv-green">→</span> Paste a file in the
                  left pane.
                </div>
                <div>
                  <span className="text-dv-green">→</span> Press{" "}
                  <span className="text-fg-soft">⌘ Enter</span> to start a
                  review.
                </div>
                <div>
                  <span className="text-dv-green">→</span> Output streams here
                  line by line.
                </div>
                <div>
                  <span className="text-dv-green">→</span> Nothing is cached —
                  each review runs fresh, so give it a few seconds.
                </div>
              </div>
            ) : (
              <>
                {chunks.map((c, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: review output is append-only and never reorders
                  <ChunkView key={i} chunk={c} />
                ))}
                {error && <ErrorBanner error={error} />}
              </>
            )}
          </div>

          <PaneFoot>
            <span className="text-dimmer text-[11px]">{elapsed}</span>
            <GhostBtn onClick={startReview}>Re-run</GhostBtn>
          </PaneFoot>
        </section>
      </main>

      <SiteFooter />

      {/* keyframes for status pulse — Tailwind doesn't ship a matching one */}
      <style jsx global>{`
        @keyframes dvPulse {
          0% { transform: scale(0.6); opacity: 0.5; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .dv-pulse::after {
          content: "";
          position: absolute;
          inset: -3px;
          border-radius: 9999px;
          background: #50FA7B;
          opacity: 0.35;
          animation: dvPulse 1.2s ease-out infinite;
        }
      `}</style>
    </div>
  );
}

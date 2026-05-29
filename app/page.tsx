"use client";

/**
 * DevReview — terminal-style AI code review tool
 * Next.js App Router · Tailwind CSS · single-file page component
 *
 * Setup notes:
 *   1. Add JetBrains Mono in app/layout.tsx:
 *
 *        import { JetBrains_Mono } from "next/font/google";
 *        const jb = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
 *        // <html className={jb.variable}>…
 *
 *   2. tailwind.config.ts — extend the theme:
 *
 *        theme: {
 *          extend: {
 *            colors: {
 *              bg:        "#0D0D0D",
 *              surface:   "#161616",
 *              surface2:  "#1A1A1A",
 *              border1:   "#2A2A2A",
 *              borderSoft:"#1F1F1F",
 *              text1:     "#F8F8F2",
 *              muted:     "#6C7280",
 *              muted2:    "#8A8F98",
 *              dvRed:     "#FF5555",
 *              dvAmber:   "#FFB86C",
 *              dvGreen:   "#50FA7B",
 *            },
 *            fontFamily: { mono: ["var(--font-mono)", "ui-monospace", "monospace"] },
 *          },
 *        }
 */

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
import { AuthControl } from "./_components/auth-control";

/* ---------------------------------------------------------------- types ---- */

type Tab = "paste" | "pr";
type Status = "idle" | "reviewing";
type Tag = "security" | "perf" | "style" | "good";

type ReviewChunk =
  | { kind: "header"; file: string }
  | { kind: "item"; tag: Tag; line?: number; body: string; file?: string }
  | { kind: "summary"; issues: number; suggestions: number; positives: number };

type ReviewError = { code: string; message: string };

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

const TAG_COLOR: Record<Tag, string> = {
  security: "text-[#FF5555]",
  perf: "text-[#FFB86C]",
  style: "text-[#6C7280]",
  good: "text-[#50FA7B]",
};

const LANG_BADGE: Record<LangKey, { label: string; cls: string }> = {
  typescript: {
    label: "TypeScript",
    cls: "border-[#7AB7FF] text-[#7AB7FF] bg-[rgba(122,183,255,0.06)]",
  },
  javascript: {
    label: "JavaScript",
    cls: "border-[#F1FA8C] text-[#F1FA8C] bg-[rgba(241,250,140,0.05)]",
  },
  python: {
    label: "Python",
    cls: "border-[#F1FA8C] text-[#F1FA8C] bg-[rgba(241,250,140,0.05)]",
  },
  rust: {
    label: "Rust",
    cls: "border-[#FFB86C] text-[#FFB86C] bg-[rgba(255,184,108,0.05)]",
  },
  go: {
    label: "Go",
    cls: "border-[#7DD3FC] text-[#7DD3FC] bg-[rgba(125,211,252,0.05)]",
  },
  plaintext: {
    label: "plaintext",
    cls: "border-[#2A2A2A] text-[#6C7280] bg-transparent",
  },
};

/* ------------------------------------------------------------ utilities ---- */

/** Render simple `code` spans inside review bodies without dangerouslySetInnerHTML. */
function renderBody(body: string) {
  const parts = body.split(/(`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("`") && p.endsWith("`") ? (
      <code
        // biome-ignore lint/suspicious/noArrayIndexKey: parts come from a stable split and never reorder
        key={i}
        className="bg-[#1E1E1E] border border-[#1F1F1F] rounded-[2px] px-[4px] text-[#C8CCD2]"
      >
        {p.slice(1, -1)}
      </code>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts come from a stable split and never reorder
      <span key={i}>{p}</span>
    ),
  );
}

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
      });
    } else {
      void runRealStream({
        source: "paste",
        code,
        language: detectLang(code),
      });
    }
  }, [
    tab,
    code,
    prUrl,
    token,
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
      className="grid h-screen w-screen bg-[#0D0D0D] text-[#F8F8F2] font-mono text-[13px] leading-[1.55] overflow-hidden"
      style={{ gridTemplateRows: "44px 1fr 32px" }}
    >
      {/* TOP BAR */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-[14px] border-b border-[#2A2A2A] bg-[#0D0D0D]">
        <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#D4D4D4]">
          <span className="inline-block w-[6px] h-[6px] bg-[#F8F8F2]" />
          dev<span className="font-normal text-[#6C7280]">·</span>review
        </div>

        <div
          role="tablist"
          aria-label="Input mode"
          className="inline-flex items-center border border-[#2A2A2A] bg-[#161616]"
        >
          <TabButton active={tab === "paste"} onClick={() => setTab("paste")}>
            Paste code
          </TabButton>
          <span className="w-px self-stretch bg-[#2A2A2A]" aria-hidden />
          <TabButton active={tab === "pr"} onClick={() => setTab("pr")}>
            GitHub PR URL
          </TabButton>
        </div>

        <div className="justify-self-end inline-flex items-center gap-3 text-[#6C7280] text-[11.5px]">
          <AuthControl />
          <span className="w-px self-stretch bg-[#2A2A2A] my-1" aria-hidden />
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
          className="bg-[#161616] grid min-h-0 min-w-0 border-r border-[#2A2A2A]"
          style={{ gridTemplateRows: "36px 1fr 32px" }}
        >
          <PaneHead>
            <span
              className={`inline-flex items-center px-2 py-[2px] rounded-[2px] text-[11px] tracking-[0.02em] border ${langBadge.cls}`}
            >
              {langBadge.label}
            </span>
            <span className="text-[#6C7280] text-[11.5px]">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
              <span className="mx-1">to review · </span>
              <Kbd>Esc</Kbd>
              <span className="ml-1">to clear</span>
            </span>
          </PaneHead>

          {tab === "paste" ? (
            <div
              className="grid min-h-0 overflow-hidden"
              style={{ gridTemplateColumns: "48px 1fr" }}
            >
              <div
                ref={gutterRef}
                className="bg-[#161616] border-r border-[#1F1F1F] text-[#3F4148] text-[12px] text-right pr-2 pt-[10px] select-none overflow-hidden whitespace-pre leading-[1.55]"
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
                className="w-full h-full bg-transparent text-[#F8F8F2] font-mono text-[13px] leading-[1.55] resize-none border-0 outline-none whitespace-pre overflow-auto px-3 pt-[10px] pb-6 placeholder-[#3D4046]"
                style={{ tabSize: 2, caretColor: "#50FA7B" }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-[14px] p-6 overflow-auto">
              <div>
                <div className="text-[#6C7280] text-[11.5px] mb-[6px]">
                  github pull request url
                </div>
                <div className="grid grid-cols-[1fr_auto] border border-[#2A2A2A] bg-[#0D0D0D]">
                  <input
                    ref={prInputRef}
                    value={prUrl}
                    onChange={(e) => setPrUrl(e.target.value)}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter") onFetchPr();
                    }}
                    placeholder="https://github.com/org/repo/pull/1234"
                    className="px-3 py-[10px] bg-transparent text-[#F8F8F2] text-[13px] outline-none placeholder-[#3D4046]"
                  />
                  <button
                    type="button"
                    onClick={onFetchPr}
                    className="px-[14px] border-l border-[#2A2A2A] bg-[#1F1F1F] hover:bg-[#232323] text-[#F8F8F2] text-[12px]"
                  >
                    Fetch diff
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[#6C7280] text-[11.5px] mb-[6px]">
                  github token{" "}
                  <span className="text-[#4A4D54]">
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
                  className="w-full px-3 py-[10px] border border-[#2A2A2A] bg-[#0D0D0D] text-[#F8F8F2] text-[13px] outline-none placeholder-[#3D4046]"
                />
              </div>

              {/* Privacy: token handling. */}
              <div className="border-l-2 border-[#FFB86C] pl-[10px] text-[11.5px] leading-[1.7] text-[#8A8F98]">
                <div className="text-[#FFB86C] font-semibold mb-[2px]">
                  privacy
                </div>
                Your token is sent to our server only to fetch this diff from
                GitHub, then discarded. It is never stored, logged, written to
                your browser, or sent to the model. Prefer a fine-grained,
                read-only, short-lived token.{" "}
                <a
                  href="/privacy"
                  className="text-[#B6BAC1] underline hover:text-[#F8F8F2]"
                >
                  Privacy policy →
                </a>
              </div>

              {/* No-caching disclosure. */}
              <div className="border-l-2 border-[#2A2A2A] pl-[10px] text-[11.5px] leading-[1.7] text-[#6C7280]">
                <div className="text-[#8A8F98] font-semibold mb-[2px]">
                  heads up
                </div>
                Nothing is cached. Every run fetches a fresh diff and recomputes
                the review from scratch, so it may take a few seconds and
                repeating the same request won&apos;t return instantly.
              </div>

              <div className="text-[#6C7280] text-[11.5px] leading-[1.7]">
                DevReview fetches the PR&apos;s unified diff and reviews the
                changed files, attributing each finding to its file.
              </div>
            </div>
          )}

          <PaneFoot>
            <span className="text-[#4A4D54] text-[11px]">
              {lineCount} line{lineCount === 1 ? "" : "s"} · {charCount} char
              {charCount === 1 ? "" : "s"}
            </span>
            <GhostBtn onClick={onClear}>Clear</GhostBtn>
          </PaneFoot>
        </section>

        {/* RIGHT PANE */}
        <section
          className="bg-[#161616] grid min-h-0 min-w-0"
          style={{ gridTemplateRows: "36px 1fr 32px" }}
        >
          <PaneHead>
            <span className="text-[#8A8F98] text-[11.5px] tracking-[0.02em] lowercase">
              review output
            </span>
            <GhostBtn onClick={onCopy}>{copyLabel}</GhostBtn>
          </PaneHead>

          <div
            ref={outputRef}
            className="overflow-auto px-4 pt-[14px] pb-[18px] text-[13px] leading-[1.65] whitespace-pre-wrap break-words"
          >
            {chunks.length === 0 && !error ? (
              <div className="text-[#6C7280] text-[12.5px] leading-[1.8] space-y-1">
                <div>
                  <span className="text-[#50FA7B]">→</span> Paste a file in the
                  left pane.
                </div>
                <div>
                  <span className="text-[#50FA7B]">→</span> Press{" "}
                  <span className="text-[#C8CCD2]">⌘ Enter</span> to start a
                  review.
                </div>
                <div>
                  <span className="text-[#50FA7B]">→</span> Output streams here
                  line by line.
                </div>
                <div>
                  <span className="text-[#50FA7B]">→</span> Nothing is cached —
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
            <span className="text-[#4A4D54] text-[11px]">{elapsed}</span>
            <GhostBtn onClick={startReview}>Re-run</GhostBtn>
          </PaneFoot>
        </section>
      </main>

      {/* BOTTOM BAR */}
      <footer className="flex justify-between items-center px-[14px] border-t border-[#2A2A2A] bg-[#0D0D0D] text-[#6C7280] text-[11px]">
        <span className="inline-flex items-center gap-[8px]">
          Powered by Claude
          <span className="text-[#2A2A2A]">·</span>
          <a
            href="/privacy"
            className="text-[#6C7280] hover:text-[#F8F8F2] transition-colors no-underline"
          >
            Privacy
          </a>
        </span>
        <a
          href="https://github.com/shaandre96/dev-review"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-[6px] text-[#6C7280] hover:text-[#F8F8F2] transition-colors no-underline"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-[12px] h-[12px] block"
            aria-hidden
          >
            <title>GitHub</title>
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.81.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82a7.66 7.66 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          View source
        </a>
      </footer>

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

/* ----------------------------------------------------------- sub-components - */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "px-[14px] py-[6px] text-[12px] transition-colors select-none " +
        (active
          ? "bg-[#1F1F1F] text-[#F8F8F2]"
          : "text-[#8A8F98] hover:text-[#C8CCD2]")
      }
    >
      {children}
    </button>
  );
}

function StatusDot({ reviewing }: { reviewing: boolean }) {
  return (
    <span
      className={
        "relative inline-block w-[7px] h-[7px] rounded-full transition-colors " +
        (reviewing ? "bg-[#50FA7B] dv-pulse" : "bg-[#3A3A3A]")
      }
    />
  );
}

function PaneHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[14px] border-b border-[#2A2A2A] text-[#6C7280] text-[11.5px]">
      {children}
    </div>
  );
}

function PaneFoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[14px] border-t border-[#2A2A2A] text-[#6C7280] text-[11.5px]">
      {children}
    </div>
  );
}

function GhostBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[#8A8F98] hover:text-[#F8F8F2] transition-colors py-1 text-[11.5px] cursor-pointer"
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-[#C8CCD2] bg-[#1F1F1F] border border-[#2A2A2A] px-[5px] py-px rounded-[2px] mx-px">
      {children}
    </kbd>
  );
}

function ChunkView({ chunk }: { chunk: ReviewChunk }) {
  if (chunk.kind === "header") {
    return (
      <div className="flex gap-[10px] items-start border-l-2 border-[#2A2A2A] pl-[10px] py-[2px] mb-[14px] text-[#8A8F98]">
        <span>analysing:</span>
        <span className="text-[#F8F8F2]">{chunk.file}</span>
      </div>
    );
  }
  if (chunk.kind === "item") {
    return (
      <div
        className="grid gap-[10px] mb-3"
        style={{ gridTemplateColumns: "92px 1fr" }}
      >
        <span
          className={`font-semibold tracking-[0.02em] ${TAG_COLOR[chunk.tag]}`}
        >
          [{chunk.tag.toUpperCase()}]
        </span>
        <span className="text-[#F8F8F2]">
          {chunk.file ? (
            <span className="text-[#8A8F98]">
              {chunk.file}
              {chunk.line !== undefined ? `:${chunk.line}` : ""} —{" "}
            </span>
          ) : chunk.line !== undefined ? (
            <span className="text-[#8A8F98]">Line {chunk.line} — </span>
          ) : null}
          {renderBody(chunk.body)}
        </span>
      </div>
    );
  }
  /* summary */
  return (
    <>
      <hr className="border-0 border-t border-[#2A2A2A] my-[18px] mb-3" />
      <div className="text-[#8A8F98] text-[12px] flex gap-[14px] items-center">
        <span>
          <Dot color="#FF5555" /> {chunk.issues} issues
        </span>
        <span>
          <Dot color="#6C7280" /> {chunk.suggestions} suggestion
        </span>
        <span>
          <Dot color="#50FA7B" /> {chunk.positives} positive
        </span>
      </div>
    </>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-[6px] h-[6px] mr-[6px] align-middle"
      style={{ background: color }}
    />
  );
}

function ErrorBanner({ error }: { error: ReviewError }) {
  return (
    <div
      className="grid gap-[10px] mb-3 mt-3 border-l-2 border-[#FF5555] pl-[10px] py-[2px]"
      style={{ gridTemplateColumns: "92px 1fr" }}
      role="alert"
    >
      <span className="font-semibold tracking-[0.02em] text-[#FF5555]">
        [ERROR]
      </span>
      <span className="text-[#F8F8F2]">
        <span className="text-[#8A8F98]">{error.code}</span> — {error.message}
      </span>
    </div>
  );
}

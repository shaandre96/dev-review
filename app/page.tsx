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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

/* ---------------------------------------------------------------- types ---- */

type Tab = "paste" | "pr";
type Status = "idle" | "reviewing";
type Tag = "security" | "perf" | "style" | "good";

type ReviewChunk =
  | { kind: "header"; file: string }
  | { kind: "item"; tag: Tag; line?: number; body: string }
  | { kind: "summary"; issues: number; suggestions: number; positives: number };

type LangKey =
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "plaintext";

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

function detectLang(t: string): LangKey {
  if (!t.trim()) return "plaintext";
  // TS/JS first — `import type {...}` is TypeScript, not Python.
  if (/:\s*\w+(\[\]|<.*>)?\s*[=;)]|interface\s+\w+|type\s+\w+\s*=|import\s+type\b/.test(t))
    return "typescript";
  if (/\bdef\s+\w+\(|^\s*from\s+\w[\w.]*\s+import\b|print\(/m.test(t))
    return "python";
  if (/\bfn\s+\w+\(|let\s+mut\s+|::\s*\w+/.test(t)) return "rust";
  if (/\bpackage\s+main\b|func\s+\w+\(/.test(t)) return "go";
  if (/\b(const|let|var)\s+\w+\s*=|=>\s*\{/.test(t)) return "javascript";
  return "plaintext";
}

/** Render simple `code` spans inside review bodies without dangerouslySetInnerHTML. */
function renderBody(body: string) {
  const parts = body.split(/(`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("`") && p.endsWith("`") ? (
      <code
        key={i}
        className="bg-[#1E1E1E] border border-[#1F1F1F] rounded-[2px] px-[4px] text-[#C8CCD2]"
      >
        {p.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

/* ----------------------------------------------------------------- page ---- */

export default function Page() {
  const [tab, setTab] = useState<Tab>("paste");
  const [code, setCode] = useState<string>(SAMPLE);
  const [prUrl, setPrUrl] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [chunks, setChunks] = useState<ReviewChunk[]>([]);
  const [elapsed, setElapsed] = useState<string>("—");
  const [copyLabel, setCopyLabel] = useState<string>("Copy");

  const codeRef = useRef<HTMLTextAreaElement | null>(null);
  const prInputRef = useRef<HTMLInputElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setStatus("idle");
  }, []);

  const startReview = useCallback(() => {
    if (!code.trim()) {
      codeRef.current?.focus();
      return;
    }
    stopStream();
    setChunks([]);
    setStatus("reviewing");
    startedAtRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    let i = 0;
    const tick = () => {
      if (i >= REVIEW.length) {
        setStatus("idle");
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const ms = Math.round(now - startedAtRef.current);
        setElapsed(`done in ${(ms / 1000).toFixed(1)}s`);
        return;
      }
      const chunk = REVIEW[i];
      setChunks((prev) => [...prev, chunk]);
      i++;
      timerRef.current = setTimeout(
        tick,
        i === 1 ? 380 : 520 + Math.random() * 220,
      );
    };
    tick();
  }, [code, stopStream]);

  const onClear = useCallback(() => {
    setCode("");
    setChunks([]);
    setElapsed("—");
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

  const onFetchPr = useCallback(() => {
    if (!prUrl.trim()) {
      prInputRef.current?.focus();
      return;
    }
    setTab("paste");
    setCode(SAMPLE);
    setTimeout(startReview, 200);
  }, [prUrl, startReview]);

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

  /* auto-run once on first mount */
  useEffect(() => {
    const id = setTimeout(startReview, 450);
    return () => {
      clearTimeout(id);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* keep output scrolled to bottom while streaming */
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

        <nav
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
        </nav>

        <div className="justify-self-end inline-flex items-center gap-2 text-[#6C7280] text-[11.5px]">
          <StatusDot reviewing={isReviewing} />
          <span>{isReviewing ? "reviewing…" : "idle"}</span>
        </div>
      </header>

      {/* MAIN */}
      <main className="grid grid-cols-2 min-h-0">
        {/* LEFT PANE */}
        <section className="bg-[#161616] grid min-h-0 min-w-0 border-r border-[#2A2A2A]"
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
            <div className="grid min-h-0 overflow-hidden" style={{ gridTemplateColumns: "48px 1fr" }}>
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
            <div className="flex flex-col gap-[14px] p-6">
              <div className="text-[#6C7280] text-[11.5px]">
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
                  onClick={onFetchPr}
                  className="px-[14px] border-l border-[#2A2A2A] bg-[#1F1F1F] hover:bg-[#232323] text-[#F8F8F2] text-[12px]"
                >
                  Fetch diff
                </button>
              </div>
              <div className="text-[#6C7280] text-[11.5px] leading-[1.7]">
                DevReview fetches the unified diff, splits hunks by file,
                <br />
                and reviews each touched file in sequence.
                <br />
                <br />
                <span className="text-[#B6BAC1]">
                  → supports public repos and authorised private repos
                </span>
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
        <section className="bg-[#161616] grid min-h-0 min-w-0"
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
            {chunks.length === 0 ? (
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
              </div>
            ) : (
              chunks.map((c, i) => <ChunkView key={i} chunk={c} />)
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
        <span>Powered by Claude</span>
        <a
          href="#"
          className="inline-flex items-center gap-[6px] text-[#6C7280] hover:text-[#F8F8F2] transition-colors no-underline"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-[12px] h-[12px] block"
            aria-hidden
          >
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
        <span className={`font-semibold tracking-[0.02em] ${TAG_COLOR[chunk.tag]}`}>
          [{chunk.tag.toUpperCase()}]
        </span>
        <span className="text-[#F8F8F2]">
          {chunk.line !== undefined && (
            <>
              <span className="text-[#8A8F98]">Line {chunk.line}</span> —{" "}
            </>
          )}
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

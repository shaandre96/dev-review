/**
 * Lightweight source-language detection for the editor pane.
 *
 * Pure and dependency-free so it can be unit-tested directly under
 * `node --test` without a DOM or bundler. The heuristics are deliberately
 * cheap regexes, not a real parser — good enough to colour a language pill.
 */

export type LangKey =
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "plaintext";

export function detectLang(t: string): LangKey {
  if (!t.trim()) return "plaintext";
  // TS/JS first — `import type {...}` is TypeScript, not Python.
  if (
    /:\s*\w+(\[\]|<.*>)?\s*[=;)]|interface\s+\w+|type\s+\w+\s*=|import\s+type\b/.test(
      t,
    )
  )
    return "typescript";
  if (/\bdef\s+\w+\(|^\s*from\s+\w[\w.]*\s+import\b|print\(/m.test(t))
    return "python";
  if (/\bfn\s+\w+\(|let\s+mut\s+|::\s*\w+/.test(t)) return "rust";
  if (/\bpackage\s+main\b|func\s+\w+\(/.test(t)) return "go";
  if (/\b(const|let|var)\s+\w+\s*=|=>\s*\{/.test(t)) return "javascript";
  return "plaintext";
}

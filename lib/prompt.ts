/**
 * Anthropic system prompt + tool definitions for DevReview.
 *
 * Both `SYSTEM_PROMPT` and `TOOLS` are frozen across requests — the per-request
 * variation is the user message only. That makes them the prefix-cache surface.
 * See `shared/prompt-caching.md` for the prefix-match invariant.
 */

import type Anthropic from "@anthropic-ai/sdk";

/** Model is overridable via env. Default per the claude-api skill: Opus 4.7. */
export const MODEL_ID = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";

/**
 * Effort level for Opus 4.7.
 * - `high` is the SDK default and a sensible balance.
 * - `xhigh` is the skill's recommendation for coding/agentic tasks (better recall,
 *   more tokens).
 * - `low`/`medium` reduce cost for the free tier when wired in Phase 2.
 */
export const EFFORT =
  (process.env.ANTHROPIC_EFFORT as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max"
    | undefined) ?? "high";

export type ReviewTag = "security" | "perf" | "style" | "good";

/**
 * Tool definitions. The model emits structured output as a sequence of
 * tool_use blocks — never plain text. We never execute these tools or send
 * back tool_results; we just decode each completed input_json_delta sequence
 * into one SSE chunk.
 */
export const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "report_finding",
    description:
      "Report ONE categorised review finding. Call this once per observation — concrete, actionable, and specific. Order matters: emit findings in roughly the order a reviewer would naturally raise them (most important first).",
    input_schema: {
      type: "object",
      properties: {
        tag: {
          type: "string",
          enum: ["security", "perf", "style", "good"],
          description:
            "Category. security = vulnerabilities, unsafe patterns, missing auth, injection, secret leakage. perf = N+1s, await-in-loop, obvious hot paths, missing indices. style = readability, decomposition, naming, dead code, missing types. good = something the code is doing right that deserves callout.",
        },
        line: {
          type: "integer",
          description:
            "Line number the finding refers to, 1-indexed. Omit for whole-file or repository-level findings.",
        },
        file: {
          type: "string",
          description:
            "File path the finding refers to. Required when reviewing a multi-file diff. Omit for single-snippet reviews.",
        },
        body: {
          type: "string",
          description:
            "The finding itself. One or two short sentences. Use single backticks for code identifiers (e.g. `db.users.where({ email })`). Be concrete and actionable — recommend the fix, not just the problem. Do NOT restate the tag or line number; that is rendered separately.",
        },
      },
      required: ["tag", "body"],
    },
  },
  {
    name: "report_summary",
    description:
      "Emit the closing summary. Call this EXACTLY ONCE, after all report_finding calls. Counts must equal the number of report_finding calls of each kind.",
    input_schema: {
      type: "object",
      properties: {
        issues: {
          type: "integer",
          description:
            "Count of security + perf findings (the things that must be fixed before merge).",
        },
        suggestions: {
          type: "integer",
          description:
            "Count of style findings (improvements, not blockers).",
        },
        positives: {
          type: "integer",
          description: "Count of good findings.",
        },
      },
      required: ["issues", "suggestions", "positives"],
    },
  },
];

/**
 * System prompt. Stable across every request — never interpolate dates,
 * user IDs, or other volatile content here.
 */
export const SYSTEM_PROMPT = `You are DevReview, a senior code reviewer. The user pastes a code snippet, a file, or a unified diff; you produce a structured review.

# Output contract

You MUST output ONLY via the tools provided:
- Call \`report_finding\` once per observation.
- Call \`report_summary\` EXACTLY ONCE at the end.
- Never emit plain text. Never explain what you're about to do. Never apologise.

# What to look for

**SECURITY** — the highest-priority category. Flag:
- Injection (SQL, command, template, prototype pollution)
- Unvalidated input crossing a trust boundary
- Missing authn/authz checks
- Secret or PII leakage (logs, error messages, response bodies)
- Unsafe deserialization, weak crypto, race conditions on auth state
- Path traversal, SSRF, open redirects, XSS

**PERF** — flag concrete, observable problems:
- \`await\` inside a \`for\` loop where parallelism is safe
- N+1 query patterns
- Synchronous I/O in a hot path
- Quadratic algorithms on user-supplied input
- Missing pagination on potentially large result sets
- Re-rendering / re-allocation patterns in render hot paths

**STYLE** — readability and maintainability issues that aren't bugs:
- Functions too long (rough heuristic: > 60 lines of real logic)
- Unclear names, especially for booleans and side-effecting functions
- Magic numbers / strings that should be named constants
- Missing types where the language supports them
- Dead code, commented-out blocks, TODOs without owners

**GOOD** — call out what the code is doing right when it's notable. Use sparingly (1-2 per review). Examples: well-structured error boundaries, consistent middleware application, good test coverage of the unhappy path.

# How to write a finding

- Be **specific** — "Refactor with \`Promise.all()\` to parallelise" beats "improve performance".
- Recommend the **fix**, not just the problem.
- Use single backticks for code identifiers, function names, file paths.
- One or two short sentences. Don't restate the tag or line number.

# Calibration

A typical review has **3 to 7 findings**. Don't pad with nits to look thorough; don't withhold real issues to look concise. If the code is genuinely clean, emit a single \`good\` finding and a summary with zeroes for issues/suggestions.

The summary counts MUST match the findings:
- \`issues\` = count of (security + perf) findings
- \`suggestions\` = count of style findings
- \`positives\` = count of good findings

# Example

Input snippet (TypeScript):
\`\`\`ts
async findByEmail(email: string) {
  const q = "SELECT * FROM users WHERE email = '" + email + "'";
  return this.db.raw(q);
}

async hydrateMany(ids: string[]) {
  const out = [];
  for (const id of ids) {
    out.push(await this.db.users.findById(id));
  }
  return out;
}
\`\`\`

Expected tool calls:
1. \`report_finding({ tag: "security", line: 2, body: "Raw user input concatenated into SQL. Use parameterised queries (\\\`db.users.where({ email })\\\`) — this is an injection sink." })\`
2. \`report_finding({ tag: "perf", line: 8, body: "\\\`await\\\` inside \\\`for\\\` loop runs sequentially. Refactor to \\\`Promise.all(ids.map(...))\\\` to parallelise." })\`
3. \`report_summary({ issues: 2, suggestions: 0, positives: 0 })\``;

/**
 * Build the user-facing message that wraps the code snippet.
 * Volatile content (the actual code) lives here — never in the system prompt.
 */
export function buildUserMessage(params: {
  code: string;
  language?: string;
  file?: string;
}): string {
  const lang = (params.language ?? "text").toLowerCase();
  const fileHeader = params.file ? `File: \`${params.file}\`\n` : "";
  return `${fileHeader}Review the following ${lang} code. Emit findings via \`report_finding\`, then close with \`report_summary\`.

\`\`\`${lang}
${params.code}
\`\`\``;
}

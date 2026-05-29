/**
 * POST /api/review
 *
 * Accepts a code snippet, streams a Claude review back as Server-Sent Events.
 *
 * Wire format (line-prefixed SSE):
 *   event: status   data: { state: 'reviewing' | 'idle' }
 *   event: chunk    data: ReviewChunk
 *   event: error    data: { code, message }   // if the stream fails mid-flight
 *   event: done     data: { ok: true }
 *
 * The chunk shape matches `ReviewChunk` from `lib/anthropic.ts`, which is
 * what the client renderer already consumes.
 */

import type { NextRequest } from "next/server";
import { Anthropic, type ReviewChunk, streamReview } from "@/lib/anthropic";
import {
  fetchPrDiff,
  GitHubError,
  type PrRef,
  parsePrUrl,
  splitDiffByFile,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow long streams on Vercel. Locally this is ignored.
export const maxDuration = 300;

type ReviewRequest = {
  code?: string;
  language?: string;
  file?: string;
  source?: "paste" | "pr";
  /** GitHub PR URL, used when source === "pr". */
  prUrl?: string;
  /** Optional user-supplied GitHub token for private-repo PRs. Never stored. */
  token?: string;
};

/** Hard cap on inbound code size. Prevents accidental 5 MB pastes from
 *  hitting the model. Tier-aware caps land in Phase 2. */
const MAX_CODE_BYTES = 100_000;

/** Byte budget for a fetched PR diff. Files are included until this is hit,
 *  so a huge PR reviews its first files rather than blowing up the model call. */
const MAX_PR_BYTES = 100_000;

/**
 * Trim a unified diff to the byte budget by dropping whole files once the
 * budget is exhausted (at least one file is always kept). Returns the combined
 * patch plus a header string describing what was reviewed.
 */
function budgetPrDiff(
  diff: string,
  ref: PrRef,
): { combined: string; header: string } {
  const files = splitDiffByFile(diff);
  if (files.length === 0) {
    throw new GitHubError(
      "empty_diff",
      "This PR has no reviewable file changes.",
    );
  }

  const kept: string[] = [];
  let used = 0;
  let skipped = 0;
  for (const f of files) {
    const size = Buffer.byteLength(f.patch, "utf8");
    if (kept.length > 0 && used + size > MAX_PR_BYTES) {
      skipped++;
      continue;
    }
    kept.push(f.patch);
    used += size;
  }

  const slug = `${ref.owner}/${ref.repo} #${ref.number}`;
  const n = kept.length;
  const header =
    skipped > 0
      ? `${slug} — ${n} file${n === 1 ? "" : "s"} (${skipped} skipped, diff too large)`
      : `${slug} — ${n} file${n === 1 ? "" : "s"}`;

  return { combined: kept.join("\n\n"), header };
}

export async function POST(req: NextRequest) {
  let body: ReviewRequest;
  try {
    body = (await req.json()) as ReviewRequest;
  } catch {
    return jsonError(400, "invalid_json", "Request body is not valid JSON.");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(
      500,
      "missing_api_key",
      "ANTHROPIC_API_KEY is not configured on the server.",
    );
  }

  const source = body.source === "pr" ? "pr" : "paste";

  // Validate inputs synchronously so obvious mistakes return a plain 400
  // instead of opening an SSE stream just to emit a single error frame.
  let prRef: PrRef | null = null;
  let code = "";
  if (source === "pr") {
    const prUrl = body.prUrl?.trim();
    if (!prUrl) {
      return jsonError(
        400,
        "missing_pr_url",
        "Missing 'prUrl' in request body.",
      );
    }
    try {
      prRef = parsePrUrl(prUrl);
    } catch (err) {
      if (err instanceof GitHubError)
        return jsonError(400, err.code, err.message);
      throw err;
    }
  } else {
    code = body.code?.trim() ?? "";
    if (!code) {
      return jsonError(400, "missing_code", "Missing 'code' in request body.");
    }
    if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
      return jsonError(
        413,
        "code_too_large",
        `Code exceeds the ${MAX_CODE_BYTES / 1000} KB cap for a single review.`,
      );
    }
  }

  // Read per-request and used only to authenticate the GitHub fetch below.
  // Never logged, persisted, or forwarded to Anthropic.
  const token = body.token?.trim() || undefined;

  const encoder = new TextEncoder();
  const abort = new AbortController();
  // Forward client cancel (browser nav away, close tab) to the Anthropic call.
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller closed (client disconnected). Nothing to do.
        }
      };

      send("status", { state: "reviewing" });

      try {
        if (prRef) {
          const diff = await fetchPrDiff(prRef, {
            token,
            signal: abort.signal,
          });
          const { combined, header } = budgetPrDiff(diff, prRef);
          send("chunk", { kind: "header", file: header } satisfies ReviewChunk);
          for await (const chunk of streamReview({
            code: combined,
            language: "diff",
            signal: abort.signal,
          })) {
            send("chunk", chunk satisfies ReviewChunk);
          }
        } else {
          for await (const chunk of streamReview({
            code,
            language: body.language,
            file: body.file,
            signal: abort.signal,
          })) {
            send("chunk", chunk satisfies ReviewChunk);
          }
        }
        send("status", { state: "idle" });
        send("done", { ok: true });
      } catch (err) {
        send("error", classifyError(err));
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Disables proxy buffering (NGINX, etc.) so SSE actually streams.
      "x-accel-buffering": "no",
    },
  });
}

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function classifyError(err: unknown): { code: string; message: string } {
  // GitHub fetch failures already carry a friendly code + message.
  if (err instanceof GitHubError) {
    return { code: err.code, message: err.message };
  }
  // Aborted GitHub fetch (client disconnected before/while fetching the diff).
  if (err instanceof Error && err.name === "AbortError") {
    return { code: "aborted", message: "Review cancelled." };
  }
  // Check APIUserAbortError first (extends APIError but isn't a status error).
  if (err instanceof Anthropic.APIUserAbortError) {
    return { code: "aborted", message: "Review cancelled." };
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return {
      code: "auth_error",
      message: "The configured Anthropic API key is invalid.",
    };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return {
      code: "rate_limited",
      message: "Anthropic rate limit hit. Try again in a moment.",
    };
  }
  if (err instanceof Anthropic.APIError) {
    // Distinguish 529 (overloaded) and 413 (too large) by status, since
    // SDK 0.98.0 doesn't expose dedicated subclasses for them.
    if (err.status === 529) {
      return {
        code: "overloaded",
        message: "Claude is temporarily overloaded. Try again shortly.",
      };
    }
    if (err.status === 413) {
      return {
        code: "too_large",
        message: "Request exceeded the model's input size limit.",
      };
    }
    return {
      code: "api_error",
      message: err.message || "Anthropic API error.",
    };
  }
  return {
    code: "unknown",
    message: err instanceof Error ? err.message : String(err),
  };
}

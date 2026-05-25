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
import { Anthropic, streamReview, type ReviewChunk } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow long streams on Vercel. Locally this is ignored.
export const maxDuration = 300;

type ReviewRequest = {
  code?: string;
  language?: string;
  file?: string;
  source?: "paste" | "pr";
};

/** Hard cap on inbound code size. Prevents accidental 5 MB pastes from
 *  hitting the model. Tier-aware caps land in Phase 2. */
const MAX_CODE_BYTES = 100_000;

export async function POST(req: NextRequest) {
  let body: ReviewRequest;
  try {
    body = (await req.json()) as ReviewRequest;
  } catch {
    return jsonError(400, "invalid_json", "Request body is not valid JSON.");
  }

  const code = body.code?.trim();
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(
      500,
      "missing_api_key",
      "ANTHROPIC_API_KEY is not configured on the server.",
    );
  }

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
        for await (const chunk of streamReview({
          code,
          language: body.language,
          file: body.file,
          signal: abort.signal,
        })) {
          send("chunk", chunk satisfies ReviewChunk);
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

/**
 * Anthropic streaming helper for DevReview.
 *
 * Exposes one async generator, `streamReview`, that yields normalised review
 * chunks. The route handler turns each yielded chunk into one SSE `chunk`
 * event — the client renders them line by line. The SSE contract stays the
 * same as the original stub, so the page didn't have to change shape.
 *
 * Implementation notes:
 *  - Uses `client.messages.stream()` (SDK 0.98.0). Tool definitions are
 *    declared but never executed; the model emits findings as a sequence of
 *    tool_use blocks and we decode each block's accumulated input_json_delta.
 *  - System prompt + tools carry a `cache_control` breakpoint. The combined
 *    prefix sits under Opus 4.7's 4096-token cache minimum today, so this is
 *    a no-op until the prompt grows — but it's correct and free.
 *  - Abort signal propagates: route's `req.signal` -> our `params.signal` ->
 *    `messages.stream()` options -> SDK's internal AbortController.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  buildUserMessage,
  EFFORT,
  MODEL_ID,
  type ReviewTag,
  SYSTEM_PROMPT,
  TOOLS,
} from "./prompt";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export type ReviewChunk =
  | { kind: "header"; file: string }
  | {
      kind: "item";
      tag: ReviewTag;
      line?: number;
      body: string;
      file?: string;
    }
  | {
      kind: "summary";
      issues: number;
      suggestions: number;
      positives: number;
    };

export interface StreamReviewParams {
  code: string;
  language?: string;
  /** File path for single-file reviews; emitted as a header chunk. */
  file?: string;
  /** Model + effort; default to the env-configured values when omitted. */
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  signal?: AbortSignal;
  /** Called once with the real token usage after the stream completes. */
  onUsage?: (usage: {
    inputTokens: number;
    outputTokens: number;
  }) => void | Promise<void>;
}

/** Re-exported so the route handler can typecheck against Anthropic.* errors. */
export { Anthropic };

/**
 * Stream a Claude review as a sequence of normalised chunks.
 * Throws on Anthropic API errors (route handler classifies them).
 */
export async function* streamReview(
  params: StreamReviewParams,
): AsyncGenerator<ReviewChunk, void, undefined> {
  const { code, language, file, model, effort, signal, onUsage } = params;

  // Emit a single header chunk so the client can show "analysing: foo.ts"
  // before the model starts streaming findings.
  if (file) yield { kind: "header", file };

  const stream = client().messages.stream(
    {
      model: model ?? MODEL_ID,
      max_tokens: 16000,
      output_config: { effort: effort ?? EFFORT },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TOOLS,
      tool_choice: { type: "any" }, // force a tool call; suppresses preambles
      messages: [
        {
          role: "user",
          content: buildUserMessage({ code, language, file }),
        },
      ],
    },
    signal ? { signal } : undefined,
  );

  // Per-block accumulators. Tool input arrives as a stream of partial JSON
  // (input_json_delta), keyed by content block index.
  const partial = new Map<number, { name: string; json: string }>();

  for await (const event of stream) {
    if (
      event.type === "content_block_start" &&
      event.content_block.type === "tool_use"
    ) {
      partial.set(event.index, { name: event.content_block.name, json: "" });
      continue;
    }

    if (
      event.type === "content_block_delta" &&
      event.delta.type === "input_json_delta"
    ) {
      const acc = partial.get(event.index);
      if (acc) acc.json += event.delta.partial_json;
      continue;
    }

    if (event.type === "content_block_stop") {
      const acc = partial.get(event.index);
      if (!acc) continue;
      partial.delete(event.index);

      let input: unknown;
      try {
        input = JSON.parse(acc.json);
      } catch {
        // Malformed tool call — skip silently rather than break the stream.
        continue;
      }

      const chunk = normaliseToolCall(acc.name, input, file);
      if (chunk) yield chunk;
    }
  }

  // Drain stream to surface any post-stream errors (e.g. max_tokens, refusal).
  // Throws on aborts and API errors, which the route handler classifies.
  const final = await stream.finalMessage();
  if (onUsage && final.usage) {
    await onUsage({
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
    });
  }
}

function normaliseToolCall(
  name: string,
  input: unknown,
  defaultFile: string | undefined,
): ReviewChunk | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;

  if (name === "report_finding") {
    const tag = obj.tag;
    const body = obj.body;
    if (!isReviewTag(tag) || typeof body !== "string") return null;
    return {
      kind: "item",
      tag,
      line: typeof obj.line === "number" ? obj.line : undefined,
      body,
      file: typeof obj.file === "string" ? obj.file : defaultFile,
    };
  }

  if (name === "report_summary") {
    return {
      kind: "summary",
      issues: toInt(obj.issues),
      suggestions: toInt(obj.suggestions),
      positives: toInt(obj.positives),
    };
  }

  return null;
}

function isReviewTag(v: unknown): v is ReviewTag {
  return v === "security" || v === "perf" || v === "style" || v === "good";
}

function toInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.max(0, Math.floor(v))
    : 0;
}

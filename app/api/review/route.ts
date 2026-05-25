import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewRequest = {
  code?: string;
  language?: string;
  source?: "paste" | "pr";
  prUrl?: string;
};

export async function POST(req: NextRequest) {
  let body: ReviewRequest;
  try {
    body = (await req.json()) as ReviewRequest;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const code = body.code?.trim();
  if (!code) {
    return jsonError(400, "Missing 'code' string in request body");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(
      500,
      "ANTHROPIC_API_KEY is not configured. Add it to .env.local.",
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      send("status", { state: "reviewing" });

      // TODO: replace stub events with a real Anthropic streaming call.
      // Sketch:
      //   import Anthropic from "@anthropic-ai/sdk";
      //   const client = new Anthropic();
      //   const response = await client.messages.stream({ ... });
      //   for await (const event of response) { ...send("chunk", parsed) }
      send("chunk", {
        kind: "header",
        file: body.prUrl ?? "pasted-snippet",
      });
      send("chunk", {
        kind: "item",
        tag: "good",
        body: "API route reachable. Streaming response wired. Connect Anthropic SDK to replace this stub.",
      });
      send("chunk", {
        kind: "summary",
        issues: 0,
        suggestions: 0,
        positives: 1,
      });

      send("status", { state: "idle" });
      send("done", { ok: true });
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

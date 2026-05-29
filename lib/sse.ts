/**
 * Minimal Server-Sent Events frame parsing for the client review stream.
 *
 * Pure and dependency-free so it can be unit-tested under `node --test`.
 * A "frame" is the text between blank-line (\n\n) separators; this extracts
 * the event name and the concatenated `data:` payload. JSON parsing and
 * dispatch stay in the component.
 */

export type SseFrame = { event: string; data: string };

export function parseSseFrame(frame: string): SseFrame {
  let event = "message";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  return { event, data };
}

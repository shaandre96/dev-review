import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseSseFrame } from "./sse.ts";

describe("parseSseFrame", () => {
  test("extracts event name and data payload", () => {
    assert.deepEqual(parseSseFrame('event: chunk\ndata: {"a":1}'), {
      event: "chunk",
      data: '{"a":1}',
    });
  });

  test("defaults the event to 'message' when no event line is present", () => {
    assert.deepEqual(parseSseFrame("data: hello"), {
      event: "message",
      data: "hello",
    });
  });

  test("concatenates multiple data lines", () => {
    assert.deepEqual(parseSseFrame("event: x\ndata: ab\ndata: cd"), {
      event: "x",
      data: "abcd",
    });
  });

  test("ignores lines without a recognised prefix (e.g. SSE comments)", () => {
    assert.deepEqual(parseSseFrame(": keep-alive\nevent: ping\ndata: {}"), {
      event: "ping",
      data: "{}",
    });
  });

  test("returns empty data when there is no data line", () => {
    assert.deepEqual(parseSseFrame("event: done"), {
      event: "done",
      data: "",
    });
  });
});

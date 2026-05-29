import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  budgetPrDiff,
  fetchPrDiff,
  GitHubError,
  parsePrUrl,
  splitDiffByFile,
} from "./github.ts";

describe("parsePrUrl", () => {
  test("parses a standard PR URL", () => {
    assert.deepEqual(
      parsePrUrl("https://github.com/octocat/Hello-World/pull/42"),
      {
        owner: "octocat",
        repo: "Hello-World",
        number: 42,
      },
    );
  });

  test("accepts a www. host and trailing path/query", () => {
    assert.deepEqual(
      parsePrUrl("https://www.github.com/o/r/pull/7/files?w=1"),
      {
        owner: "o",
        repo: "r",
        number: 7,
      },
    );
  });

  test("rejects non-github hosts", () => {
    assert.throws(
      () => parsePrUrl("https://gitlab.com/o/r/-/merge_requests/3"),
      GitHubError,
    );
  });

  test("rejects github URLs that are not pull requests", () => {
    assert.throws(
      () => parsePrUrl("https://github.com/o/r/issues/3"),
      GitHubError,
    );
  });

  test("rejects strings that are not URLs", () => {
    assert.throws(() => parsePrUrl("not a url"), GitHubError);
  });

  test("rejects owner/repo segments with unsafe characters", () => {
    assert.throws(
      () => parsePrUrl("https://github.com/%2e%2e/r/pull/1"),
      GitHubError,
    );
  });
});

describe("splitDiffByFile", () => {
  const twoFiles = [
    "diff --git a/src/a.ts b/src/a.ts",
    "index 111..222 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "diff --git a/b.txt b/b.txt",
    "index 333..444 100644",
    "--- a/b.txt",
    "+++ b/b.txt",
    "@@ -0,0 +1 @@",
    "+hello",
  ].join("\n");

  test("splits into one entry per file using the new-side path", () => {
    const files = splitDiffByFile(twoFiles);
    assert.equal(files.length, 2);
    assert.equal(files[0].file, "src/a.ts");
    assert.equal(files[1].file, "b.txt");
    assert.ok(files[0].patch.startsWith("diff --git a/src/a.ts"));
  });

  test("falls back to the diff --git header for deletions", () => {
    const del = [
      "diff --git a/gone.js b/gone.js",
      "deleted file mode 100644",
      "--- a/gone.js",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-bye",
    ].join("\n");
    const files = splitDiffByFile(del);
    assert.equal(files.length, 1);
    assert.equal(files[0].file, "gone.js");
  });

  test("returns no files for an empty diff", () => {
    assert.deepEqual(splitDiffByFile(""), []);
  });
});

describe("budgetPrDiff", () => {
  const ref = { owner: "o", repo: "r", number: 5 };

  test("keeps all files under budget and reports the count", () => {
    const diff =
      "diff --git a/x b/x\n+++ b/x\n+a\ndiff --git a/y b/y\n+++ b/y\n+b";
    const { combined, header } = budgetPrDiff(diff, ref);
    assert.equal(header, "o/r #5 — 2 files");
    assert.ok(combined.includes("a/x"));
    assert.ok(combined.includes("a/y"));
  });

  test("throws empty_diff when there are no files", () => {
    assert.throws(
      () => budgetPrDiff("", ref),
      (e) => e instanceof GitHubError && e.code === "empty_diff",
    );
  });

  test("drops files past the byte budget and notes the skipped count", () => {
    const big = "x".repeat(60_000);
    const file = (n: number) =>
      `diff --git a/f${n} b/f${n}\n+++ b/f${n}\n+${big}`;
    const diff = [file(1), file(2), file(3)].join("\n");
    const { header } = budgetPrDiff(diff, ref);
    assert.equal(header, "o/r #5 — 1 file (2 skipped, diff too large)");
  });
});

describe("fetchPrDiff", () => {
  const ref = { owner: "octocat", repo: "Hello-World", number: 2 };
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  // Capture the args the helper passes to fetch so we can assert on them.
  function stubFetch(make: () => Response) {
    const calls: Array<{ url: string; opts: RequestInit }> = [];
    globalThis.fetch = ((url: string, opts: RequestInit = {}) => {
      calls.push({ url, opts });
      return Promise.resolve(make());
    }) as typeof fetch;
    return calls;
  }

  test("returns the diff text and builds the correct request (no token)", async () => {
    const calls = stubFetch(() => new Response("DIFF", { status: 200 }));
    const out = await fetchPrDiff(ref);
    assert.equal(out, "DIFF");
    assert.equal(
      calls[0].url,
      "https://api.github.com/repos/octocat/Hello-World/pulls/2",
    );
    const headers = calls[0].opts.headers as Record<string, string>;
    assert.equal(headers.Accept, "application/vnd.github.diff");
    assert.equal(calls[0].opts.cache, "no-store");
    assert.equal(headers.Authorization, undefined);
  });

  test("sends an Authorization header when a token is supplied", async () => {
    const calls = stubFetch(() => new Response("D", { status: 200 }));
    await fetchPrDiff(ref, { token: "ghp_secret" });
    const headers = calls[0].opts.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer ghp_secret");
  });

  test("maps 404 to pr_not_found", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    await assert.rejects(
      fetchPrDiff(ref),
      (e) => e instanceof GitHubError && e.code === "pr_not_found",
    );
  });

  test("maps 401 to bad_token", async () => {
    stubFetch(() => new Response("", { status: 401 }));
    await assert.rejects(
      fetchPrDiff(ref, { token: "x" }),
      (e) => e instanceof GitHubError && e.code === "bad_token",
    );
  });

  test("maps 403 with no remaining rate limit to gh_rate_limited", async () => {
    stubFetch(
      () =>
        new Response("", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" },
        }),
    );
    await assert.rejects(
      fetchPrDiff(ref),
      (e) => e instanceof GitHubError && e.code === "gh_rate_limited",
    );
  });

  test("maps a plain 403 to gh_forbidden", async () => {
    stubFetch(() => new Response("", { status: 403 }));
    await assert.rejects(
      fetchPrDiff(ref),
      (e) => e instanceof GitHubError && e.code === "gh_forbidden",
    );
  });

  test("maps 422 to diff_too_large", async () => {
    stubFetch(() => new Response("", { status: 422 }));
    await assert.rejects(
      fetchPrDiff(ref),
      (e) => e instanceof GitHubError && e.code === "diff_too_large",
    );
  });

  test("maps other non-OK statuses to gh_error", async () => {
    stubFetch(() => new Response("", { status: 500 }));
    await assert.rejects(
      fetchPrDiff(ref),
      (e) => e instanceof GitHubError && e.code === "gh_error",
    );
  });
});

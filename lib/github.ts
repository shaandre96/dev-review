/**
 * GitHub PR diff fetching for DevReview.
 *
 * Privacy contract (read before changing):
 *  - A user-supplied token is accepted ONLY to authenticate the GitHub request
 *    for private repos. It lives in the request's memory for the duration of
 *    the fetch and is never logged, persisted, echoed back, or sent to
 *    Anthropic. Do not add logging that includes the token or the auth header.
 *  - Public PRs work with no token at all.
 *
 * The unified diff is fetched via the `application/vnd.github.diff` media type
 * on the pulls endpoint, then split per file so the route can budget large PRs.
 */

export type PrRef = { owner: string; repo: string; number: number };

/** Typed error so the route can map a failure to a friendly SSE error code. */
export class GitHubError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GitHubError";
    this.code = code;
  }
}

// owner/repo: GitHub allows alphanumerics, hyphen, underscore, dot. Reject `.`
// and `..` outright so a crafted URL can't introduce path segments into the
// api.github.com request we build below.
const SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Parse a github.com PR URL into its {owner, repo, number}. Throws GitHubError. */
export function parsePrUrl(input: string): PrRef {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new GitHubError(
      "bad_pr_url",
      "That doesn't look like a URL. Expected https://github.com/owner/repo/pull/123.",
    );
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "github.com") {
    throw new GitHubError(
      "bad_pr_url",
      "Only github.com pull request URLs are supported.",
    );
  }

  const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) {
    throw new GitHubError(
      "bad_pr_url",
      "Expected a URL like https://github.com/owner/repo/pull/123.",
    );
  }

  const [, owner, repo, num] = m;
  if (
    !SEGMENT.test(owner) ||
    !SEGMENT.test(repo) ||
    owner === "." ||
    owner === ".." ||
    repo === "." ||
    repo === ".."
  ) {
    throw new GitHubError(
      "bad_pr_url",
      "PR URL contains an unsupported owner or repo name.",
    );
  }

  return { owner, repo, number: Number(num) };
}

/**
 * Fetch the raw unified diff for a PR. `token` is optional and only required
 * for private repos. Never logs the token.
 */
export async function fetchPrDiff(
  ref: PrRef,
  opts: { token?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(
    ref.owner,
  )}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.diff",
    "User-Agent": "DevReview",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    // no-store: never let Next persist an authenticated diff response.
    res = await fetch(apiUrl, {
      headers,
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new GitHubError("gh_unreachable", "Could not reach github.com.");
  }

  if (res.ok) return res.text();

  switch (res.status) {
    case 401:
      throw new GitHubError(
        "bad_token",
        "GitHub rejected the token (401). Check it hasn't expired and has `repo` scope.",
      );
    case 403: {
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        throw new GitHubError(
          "gh_rate_limited",
          "GitHub API rate limit reached. Supplying a token raises the limit.",
        );
      }
      throw new GitHubError(
        "gh_forbidden",
        "GitHub denied access (403). The token may not have access to this repo.",
      );
    }
    case 404:
      throw new GitHubError(
        "pr_not_found",
        "PR not found. If the repo is private, supply a token with `repo` scope.",
      );
    case 406:
    case 422:
      throw new GitHubError(
        "diff_too_large",
        "GitHub couldn't return a diff for this PR — it may be too large.",
      );
    default:
      throw new GitHubError(
        "gh_error",
        `GitHub request failed (${res.status}).`,
      );
  }
}

export type DiffFile = { file: string; patch: string };

/**
 * Split a unified diff into per-file patches. Each entry keeps its full
 * `diff --git` header so the patch is self-contained and reviewable on its own.
 */
export function splitDiffByFile(diff: string): DiffFile[] {
  const parts = diff
    .split(/(?=^diff --git )/m)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.map((patch) => {
    // Prefer the new-side path (`+++ b/<path>`); fall back to the `diff --git`
    // header (covers deletions where +++ is /dev/null).
    const plus = patch.match(/^\+\+\+ b\/(.+)$/m);
    const git = patch.match(/^diff --git a\/.+ b\/(.+)$/m);
    const file = plus?.[1] ?? git?.[1] ?? "unknown";
    return { file, patch };
  });
}

/** Byte budget for a fetched PR diff. Files are included until this is hit,
 *  so a huge PR reviews its first files rather than blowing up the model call. */
export const MAX_PR_BYTES = 100_000;

/**
 * Trim a unified diff to the byte budget by dropping whole files once the
 * budget is exhausted (at least one file is always kept). Returns the combined
 * patch plus a header string describing what was reviewed.
 */
export function budgetPrDiff(
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

import type { Metadata } from "next";
import Link from "next/link";
import { Code, Em, Section } from "../_components/prose";

export const metadata: Metadata = {
  title: "Privacy — DevReview",
  description:
    "What DevReview does with the code, diffs, tokens, and account data you provide.",
};

const UPDATED = "29 May 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bg text-fg font-mono text-[13px] leading-[1.7]">
      <div className="mx-auto max-w-[760px] px-6 py-12">
        <Link
          href="/"
          className="text-dim text-[11.5px] hover:text-fg no-underline"
        >
          ← back to dev·review
        </Link>

        <h1 className="mt-6 text-[20px] font-semibold text-fg">
          Privacy Policy
        </h1>
        <p className="mt-1 text-dim text-[11.5px]">Last updated: {UPDATED}</p>

        <p className="mt-6 text-fg-soft">
          DevReview is a commercial code-review service operated by Andre Sha.
          You paste a snippet or point it at a GitHub pull request and it
          streams back an AI-generated review. You can use it anonymously, or
          sign in to subscribe to a paid plan. This page describes exactly what
          the service does with what you provide; it reflects the live service,
          not boilerplate. The legal terms are in our{" "}
          <Link href="/terms" className="underline hover:text-fg">
            Terms &amp; Conditions
          </Link>
          .
        </p>

        <Section title="The short version">
          <ul className="list-disc pl-5 space-y-1 text-fg-soft">
            <li>
              Anonymous reviews need no account; your code/diff is processed to
              serve the request and is not stored by us.
            </li>
            <li>
              To produce a review, the code or diff you submit is sent to{" "}
              <Em>Anthropic</Em> (the model provider).
            </li>
            <li>
              For pull-request reviews, the PR identifier — and a GitHub token
              if you provide one — is sent to <Em>GitHub</Em> to fetch the diff.
            </li>
            <li>
              A token you enter is used only for that GitHub request. It is{" "}
              <Em>never</Em> stored, logged, written to your browser, or sent to
              the model.
            </li>
            <li>
              If you <Em>sign in</Em> (to use a paid plan) we store account data
              and set a session cookie — see <Em>Accounts</Em> below. You can
              delete it at any time.
            </li>
            <li>
              Review outputs are never cached. We use cookieless, aggregate
              analytics; no advertising or cross-site trackers.
            </li>
          </ul>
        </Section>

        <Section title="What you submit, and where it goes">
          <p className="text-fg-soft">
            <Em>Pasted code.</Em> When you start a review, your browser sends
            the pasted text and a detected language label to our server endpoint
            (<Code>/api/review</Code>). The server embeds that text in a prompt
            and streams it to the Anthropic API, relaying the model&apos;s
            findings back to your browser. The submitted text is held only for
            the duration of the request.
          </p>
          <p className="mt-3 text-fg-soft">
            <Em>Pull requests.</Em> When you submit a GitHub PR URL, the server
            parses it and requests the unified diff from{" "}
            <Code>api.github.com</Code>. That diff is then reviewed the same way
            as pasted code (sent to Anthropic). Large diffs are trimmed to a
            size budget before review.
          </p>
        </Section>

        <Section title="GitHub tokens">
          <p className="text-fg-soft">
            Public repositories need no token. To review a PR in a{" "}
            <Em>private</Em> repository, you may supply your own GitHub token.
            It is held in page memory only (never written to{" "}
            <Code>localStorage</Code>, <Code>sessionStorage</Code>, or cookies),
            sent to our server solely as the <Code>Authorization</Code> header
            on the single GitHub diff fetch, and never logged, stored, or sent
            to the model. The fetch is made with caching disabled.
          </p>
        </Section>

        <Section title="Accounts">
          <p className="text-fg-soft">
            Anonymous use requires no account. If you sign in with Google or
            GitHub (to subscribe to a Lite or Pro plan), we store:
          </p>
          <ul className="mt-3 list-disc pl-5 space-y-1 text-fg-soft">
            <li>your email, display name, and avatar URL from the provider;</li>
            <li>an identifier linking your account to that provider;</li>
            <li>a session record plus a cookie that keeps you signed in;</li>
            <li>
              your subscription status and per-review usage (model, token
              counts, and cost) for billing and quota enforcement.
            </li>
          </ul>
          <p className="mt-3 text-fg-soft">
            We never receive your Google or GitHub password. You can permanently
            delete your account and this data at any time from the{" "}
            <Em>Account</Em> page.
          </p>
        </Section>

        <Section title="Third parties">
          <p className="text-fg-soft">
            Running the service shares data with a few providers, each governed
            by its own terms and privacy policy:
          </p>
          <ul className="mt-3 list-disc pl-5 space-y-1 text-fg-soft">
            <li>
              <Em>Anthropic</Em> — receives the code or diff you submit, to
              generate the review.
            </li>
            <li>
              <Em>GitHub</Em> — receives the PR reference (and your token, if
              supplied) to return a diff; and your basic profile if you sign in
              with GitHub.
            </li>
            <li>
              <Em>Google</Em> — your basic profile (email, name, avatar) if you
              sign in with Google.
            </li>
            <li>
              <Em>Neon</Em> — our database host; stores account, subscription,
              and usage records.
            </li>
            <li>
              <Em>Upstash</Em> — holds short-lived rate-limit counters keyed by
              IP (anonymous) or account.
            </li>
            <li>
              <Em>Stripe</Em> — processes payments for paid plans; we never see
              or store your card details.
            </li>
          </ul>
        </Section>

        <Section title="Caching and review storage">
          <p className="text-fg-soft">
            Review outputs are not cached or stored, and the GitHub diff fetch
            is marked no-store. For signed-in users we keep only{" "}
            <Em>usage metadata</Em> — model, token counts, and cost per review —
            to enforce quotas and billing, never the code or the review text.
            The trade-off is speed: every review is computed fresh, so it can
            take a few seconds and identical requests are not served from a
            cache.
          </p>
        </Section>

        <Section title="Cookies, analytics, and logs">
          <p className="text-fg-soft">
            The only cookie this app sets is the Auth.js session cookie, and
            only after you sign in. Analytics are provided by Vercel Analytics,
            which is aggregate and cookieless — no advertising or cross-site
            tracking.
          </p>
          <p className="mt-3 text-muted text-[12px]">
            Note: the hosting provider (Vercel) may record standard operational
            request logs — IP address, timestamp, response status — as part of
            serving traffic. That logging is the provider&apos;s and is governed
            by its policies.
          </p>
        </Section>

        <Section title="Deleting your data">
          <p className="text-fg-soft">
            Anonymous use leaves nothing to delete beyond transient rate-limit
            counters that expire on their own. If you have an account, deleting
            it from the <Em>Account</Em> page removes your profile, login
            connections, session, and subscription record. Any active paid
            subscription is also cancelled with Stripe and the linked Stripe
            customer is removed, so billing stops immediately. Usage rows are
            anonymised. Deletion is immediate and cannot be undone.
          </p>
        </Section>

        <Section title="Demo mode">
          <p className="text-fg-soft">
            Loading the app with <Code>?demo=1</Code> replays a canned, built-in
            review for screenshots and offline demos. In demo mode no code is
            sent anywhere — there is no network call to Anthropic or GitHub.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p className="text-fg-soft">
            If the data practices above change, this page will be updated along
            with the &quot;last updated&quot; date. Questions about this policy
            can be directed to the project maintainer.
          </p>
        </Section>

        <p className="mt-10 text-dimmer text-[11px]">
          DevReview is operated as a commercial service by Andre Sha (sole
          trader), Victoria, Australia.
        </p>
      </div>
    </main>
  );
}

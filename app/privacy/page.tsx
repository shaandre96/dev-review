import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — DevReview",
  description:
    "What DevReview does with the code, diffs, and tokens you submit.",
};

const UPDATED = "29 May 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0D0D0D] text-[#F8F8F2] font-mono text-[13px] leading-[1.7]">
      <div className="mx-auto max-w-[760px] px-6 py-12">
        <Link
          href="/"
          className="text-[#6C7280] text-[11.5px] hover:text-[#F8F8F2] no-underline"
        >
          ← back to dev·review
        </Link>

        <h1 className="mt-6 text-[20px] font-semibold text-[#F8F8F2]">
          Privacy Policy
        </h1>
        <p className="mt-1 text-[#6C7280] text-[11.5px]">
          Last updated: {UPDATED}
        </p>

        <p className="mt-6 text-[#C8CCD2]">
          DevReview is a code-review tool: you paste a snippet or point it at a
          GitHub pull request, and it streams back an AI-generated review. This
          page describes exactly what the application does with what you submit.
          It reflects the behaviour of the source code, not boilerplate.
        </p>

        <Section title="The short version">
          <ul className="list-disc pl-5 space-y-1 text-[#C8CCD2]">
            <li>
              We do <Em>not</Em> have a database. Your code, diffs, and tokens
              are processed in memory to serve a single request and are not
              persisted by this app.
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
            <li>Nothing is cached. Every review is recomputed from scratch.</li>
            <li>The app sets no cookies and runs no analytics or trackers.</li>
          </ul>
        </Section>

        <Section title="What you submit, and where it goes">
          <p className="text-[#C8CCD2]">
            <Em>Pasted code.</Em> When you start a review, your browser sends
            the pasted text and a detected language label to our server endpoint
            (<Code>/api/review</Code>). The server embeds that text in a prompt
            and streams it to the Anthropic API, relaying the model&apos;s
            findings back to your browser. The submitted text is held only for
            the duration of the request.
          </p>
          <p className="mt-3 text-[#C8CCD2]">
            <Em>Pull requests.</Em> When you submit a GitHub PR URL, the server
            parses it and requests the unified diff from{" "}
            <Code>api.github.com</Code>. That diff is then reviewed the same way
            as pasted code (sent to Anthropic). Large diffs are trimmed to a
            size budget before review.
          </p>
        </Section>

        <Section title="GitHub tokens">
          <p className="text-[#C8CCD2]">
            Public repositories need no token. To review a PR in a{" "}
            <Em>private</Em> repository, you may supply your own GitHub token.
            When you do:
          </p>
          <ul className="mt-3 list-disc pl-5 space-y-1 text-[#C8CCD2]">
            <li>
              In your browser, the token is held in page memory only. It is not
              written to <Code>localStorage</Code>, <Code>sessionStorage</Code>,
              or cookies, and it is cleared when you press Clear.
            </li>
            <li>
              It is sent to our server with the review request and used solely
              as the <Code>Authorization</Code> header on the single GitHub diff
              fetch.
            </li>
            <li>
              It is never written to logs, never stored, and never included in
              the data sent to Anthropic.
            </li>
            <li>
              The GitHub request is made with caching disabled, so the
              authenticated response is not retained.
            </li>
          </ul>
          <p className="mt-3 text-[#8A8F98] text-[12px]">
            We still recommend using a fine-grained, read-only, short-lived
            token scoped to the minimum repositories needed, and revoking it
            when you&apos;re done.
          </p>
        </Section>

        <Section title="Third parties">
          <p className="text-[#C8CCD2]">
            Producing a review necessarily shares your content with services
            outside this app:
          </p>
          <ul className="mt-3 list-disc pl-5 space-y-1 text-[#C8CCD2]">
            <li>
              <Em>Anthropic</Em> — receives the code or diff you submit, in
              order to generate the review. Their handling is governed by
              Anthropic&apos;s own terms and privacy policy.
            </li>
            <li>
              <Em>GitHub</Em> — receives the PR reference and, if supplied, your
              token, in order to return the diff. Governed by GitHub&apos;s
              terms and privacy policy.
            </li>
          </ul>
        </Section>

        <Section title="Caching and performance">
          <p className="text-[#C8CCD2]">
            For privacy and freshness, this app does not cache. The GitHub diff
            fetch is explicitly marked no-store, and review results are not
            saved or reused. The practical trade-off is speed:{" "}
            <Em>
              every review is computed fresh, so it can take a few seconds and
              identical requests are not served instantly from a cache.
            </Em>
          </p>
        </Section>

        <Section title="Storage, cookies, and tracking">
          <p className="text-[#C8CCD2]">
            This application has no database and stores none of your
            submissions. It sets no cookies of its own and includes no
            analytics, advertising, or third-party tracking scripts.
          </p>
          <p className="mt-3 text-[#8A8F98] text-[12px]">
            Note: the hosting provider used to run this app (for example,
            Vercel) may record standard operational request logs such as IP
            address, timestamp, and response status as part of serving traffic.
            That logging is the provider&apos;s, not this application&apos;s,
            and is governed by the provider&apos;s policies.
          </p>
        </Section>

        <Section title="Demo mode">
          <p className="text-[#C8CCD2]">
            Loading the app with <Code>?demo=1</Code> replays a canned, built-in
            review for screenshots and offline demos. In demo mode no code is
            sent anywhere — there is no network call to Anthropic or GitHub.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p className="text-[#C8CCD2]">
            If the data practices above change, this page will be updated along
            with the &quot;last updated&quot; date. Questions about this policy
            can be directed to the project maintainer.
          </p>
        </Section>

        <p className="mt-10 text-[#4A4D54] text-[11px]">
          This is a personal portfolio project and not a commercial service.
        </p>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-[14px] font-semibold text-[#F8F8F2] lowercase tracking-[0.02em]">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Em({ children }: { children: React.ReactNode }) {
  return <span className="text-[#F8F8F2] font-semibold">{children}</span>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[#1E1E1E] border border-[#1F1F1F] rounded-[2px] px-[4px] text-[#C8CCD2]">
      {children}
    </code>
  );
}

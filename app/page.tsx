import type { Metadata } from "next";
import Link from "next/link";
import { TIERS } from "@/lib/tiers";
import { AuthControl } from "./_components/auth-control";
import { CheckoutButton } from "./_components/checkout-button";

export const metadata: Metadata = {
  title: "DevReview — AI code review in a terminal",
  description:
    "Paste a function, file, or GitHub PR and get a structured, categorised review streamed back. Free to try; Lite and Pro for more.",
};

type Card = {
  id: "free" | "lite" | "pro";
  tagline: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
};

const CARDS: Card[] = [
  {
    id: "free",
    tagline: "Kick the tyres — no account needed.",
    features: [
      "Haiku 4.5, medium effort",
      "5 reviews/day",
      "Paste code or public PRs",
      "Streamed, categorised findings",
    ],
    cta: { label: "Open the terminal →", href: "/review" },
  },
  {
    id: "lite",
    tagline: "For regular reviews.",
    features: [
      "Haiku 4.5 + Sonnet 4.6",
      "High effort",
      "≈ 30 Sonnet or 190 Haiku reviews / mo",
      "Private PRs with your token",
      "Usage-based credits",
    ],
    cta: { label: "Choose Lite", href: "/signin" },
  },
  {
    id: "pro",
    tagline: "Full power — your call on effort.",
    features: [
      "Everything in Lite",
      "+ Opus 4.7",
      "Choose effort (low → xhigh)",
      "≈ 40 Opus reviews / mo (far more on smaller models)",
    ],
    cta: { label: "Choose Pro", href: "/signin" },
    highlight: true,
  },
];

function priceLabel(id: Card["id"]): string {
  const price = TIERS[id].priceUsdMonthly;
  return price === 0 ? "Free" : `$${price}`;
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-fg font-mono text-[13px]">
      {/* top nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-line">
        <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-fg-strong">
          <span className="inline-block w-[6px] h-[6px] bg-fg" />
          dev<span className="font-normal text-dim">·</span>review
        </div>
        <AuthControl />
      </header>

      {/* hero */}
      <section className="mx-auto max-w-[820px] px-6 pt-20 pb-14 text-center">
        <h1 className="text-[32px] leading-[1.2] font-semibold tracking-[-0.01em]">
          Code review,
          <span className="text-dv-green"> streamed like a terminal.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[560px] text-muted text-[14px] leading-[1.7]">
          Paste a function, file, or GitHub PR. Get a structured, categorised
          review — security, performance, style — streamed back line by line,
          powered by Claude.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/review"
            className="px-5 py-[10px] bg-control border border-line hover:bg-control-hover text-fg text-[13px] no-underline"
          >
            Open the terminal →
          </Link>
          <Link
            href="#pricing"
            className="px-5 py-[10px] text-muted hover:text-fg text-[13px] no-underline"
          >
            View pricing
          </Link>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="mx-auto max-w-[980px] px-6 pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {CARDS.map((card) => (
            <div
              key={card.id}
              className={`flex flex-col border bg-surface p-6 ${
                card.highlight ? "border-dv-green" : "border-line"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-semibold uppercase tracking-[0.04em]">
                  {TIERS[card.id].label}
                </span>
                <span className="text-muted text-[12px]">
                  <span className="text-fg text-[16px] font-semibold">
                    {priceLabel(card.id)}
                  </span>
                  {TIERS[card.id].priceUsdMonthly > 0 ? " /mo" : ""}
                </span>
              </div>
              <p className="mt-2 text-muted text-[12px] leading-[1.6]">
                {card.tagline}
              </p>
              <ul className="mt-4 flex-1 space-y-[6px] text-fg-soft text-[12.5px]">
                {card.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-dv-green">→</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {card.id === "free" ? (
                <Link
                  href={card.cta.href}
                  className="mt-6 text-center px-4 py-[10px] text-[13px] no-underline border border-line bg-control hover:bg-control-hover text-fg"
                >
                  {card.cta.label}
                </Link>
              ) : (
                <CheckoutButton
                  tier={card.id}
                  label={card.cta.label}
                  highlight={card.highlight}
                />
              )}
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-dim text-[11.5px]">
          Paid plans require an account — sign in to get set up. Credits are
          cost-based, so you can spend a plan&apos;s monthly allowance across
          any model you&apos;re entitled to.
        </p>
      </section>

      {/* footer */}
      <footer className="flex items-center justify-between px-6 py-4 border-t border-line text-dim text-[11px]">
        <span>Powered by Claude</span>
        <span className="inline-flex items-center gap-4">
          <Link href="/terms" className="hover:text-fg no-underline text-dim">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-fg no-underline text-dim">
            Privacy
          </Link>
          <a
            href="https://github.com/shaandre96/dev-review"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fg no-underline text-dim"
          >
            View source
          </a>
        </span>
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TIERS } from "@/lib/tiers";
import { ChangePlanButton } from "./change-plan-button";
import { DeleteAccountButton } from "./delete-button";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user)
    redirect(`/signin?callbackUrl=${encodeURIComponent("/account")}`);

  const tier = TIERS[session.user.tier ?? "free"];
  const { status } = await searchParams;

  return (
    <main className="min-h-screen bg-bg text-fg font-mono text-[13px]">
      <div className="mx-auto max-w-[640px] px-6 py-12">
        <Link
          href="/"
          className="text-dim text-[11.5px] hover:text-fg no-underline"
        >
          ← back to dev·review
        </Link>

        <div className="mt-6 flex items-center justify-between gap-4">
          <h1 className="text-[20px] font-semibold">Account</h1>
          <Link
            href="/review"
            className="inline-flex items-center px-4 py-[8px] border border-dv-green bg-[rgba(80,250,123,0.08)] text-dv-green text-[12.5px] no-underline hover:bg-[rgba(80,250,123,0.14)]"
          >
            Open the terminal →
          </Link>
        </div>

        {status === "subscribed" && (
          <p className="mt-4 border-l-2 border-dv-green pl-3 py-1 text-dv-green text-[11.5px]">
            Subscription active. It may take a moment to reflect below.
          </p>
        )}

        <dl className="mt-6 border border-line bg-surface divide-y divide-line-soft">
          <Row label="Email" value={session.user.email ?? "—"} />
          <Row label="Name" value={session.user.name ?? "—"} />
          <Row
            label="Plan"
            value={`${tier.label}${tier.priceUsdMonthly ? ` — $${tier.priceUsdMonthly}/mo` : ""}`}
          />
        </dl>

        <section className="mt-6">
          <h2 className="text-[12px] text-dim uppercase tracking-[0.04em]">
            Billing
          </h2>
          <div className="mt-2 inline-flex flex-wrap gap-3 items-start">
            {tier.id === "lite" && (
              <ChangePlanButton
                to="pro"
                label="Upgrade to Pro — $29/mo"
                prompt="Switch to Pro? You'll get Opus and the higher monthly credit allowance. Stripe will charge a prorated difference now."
                primary
              />
            )}
            {tier.id === "pro" && (
              <ChangePlanButton
                to="lite"
                label="Switch to Lite — $9/mo"
                prompt="Switch down to Lite? You'll lose access to Opus and the larger monthly allowance. Stripe will apply a prorated credit toward your next invoice."
              />
            )}
            {/* plain anchors (not prefetched) — these routes create Stripe sessions */}
            <a
              href="/api/portal"
              className="px-4 py-[8px] border border-line bg-control hover:bg-control-hover text-fg text-[12.5px] no-underline"
            >
              Manage billing
            </a>
            {tier.id === "free" && (
              <Link
                href="/#pricing"
                className="px-4 py-[8px] text-muted hover:text-fg text-[12.5px] no-underline"
              >
                View plans →
              </Link>
            )}
          </div>
          <p className="mt-2 text-dim text-[11px] leading-[1.6]">
            Cancellations, payment-method updates, and invoices are in{" "}
            <span className="text-fg-soft">Manage billing</span>.
          </p>
        </section>

        <section className="mt-10 border-l-2 border-dv-red pl-4">
          <h2 className="text-[14px] font-semibold text-dv-red">Danger zone</h2>
          <p className="mt-1 mb-3 text-muted text-[11.5px] leading-[1.7]">
            Deleting your account removes your profile, login connections, and
            subscription record, cancels any active paid plan with Stripe so you
            stop being billed, and removes you from Stripe. This cannot be
            undone.
          </p>
          <DeleteAccountButton />
        </section>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 px-4 py-3">
      <dt className="text-dim text-[11.5px]">{label}</dt>
      <dd className="text-fg break-words">{value}</dd>
    </div>
  );
}

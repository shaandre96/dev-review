import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TIERS } from "@/lib/tiers";
import { DeleteAccountButton } from "./delete-button";

export const metadata: Metadata = {
  title: "Account — DevReview",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const tier = TIERS[session.user.tier ?? "free"];
  const { status } = await searchParams;

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-[#F8F8F2] font-mono text-[13px]">
      <div className="mx-auto max-w-[640px] px-6 py-12">
        <Link
          href="/"
          className="text-[#6C7280] text-[11.5px] hover:text-[#F8F8F2] no-underline"
        >
          ← back to dev·review
        </Link>

        <h1 className="mt-6 text-[20px] font-semibold">Account</h1>

        {status === "subscribed" && (
          <p className="mt-4 border-l-2 border-[#50FA7B] pl-3 py-1 text-[#50FA7B] text-[11.5px]">
            Subscription active. It may take a moment to reflect below.
          </p>
        )}

        <dl className="mt-6 border border-[#2A2A2A] bg-[#161616] divide-y divide-[#1F1F1F]">
          <Row label="Email" value={session.user.email ?? "—"} />
          <Row label="Name" value={session.user.name ?? "—"} />
          <Row
            label="Plan"
            value={`${tier.label}${tier.priceUsdMonthly ? ` — $${tier.priceUsdMonthly}/mo` : ""}`}
          />
        </dl>

        <section className="mt-6">
          <h2 className="text-[12px] text-[#6C7280] uppercase tracking-[0.04em]">
            Billing
          </h2>
          <div className="mt-2 inline-flex gap-3">
            {/* plain anchors (not prefetched) — these routes create Stripe sessions */}
            <a
              href="/api/portal"
              className="px-4 py-[8px] border border-[#2A2A2A] bg-[#1F1F1F] hover:bg-[#232323] text-[#F8F8F2] text-[12.5px] no-underline"
            >
              Manage billing
            </a>
            {tier.id === "free" && (
              <Link
                href="/#pricing"
                className="px-4 py-[8px] text-[#8A8F98] hover:text-[#F8F8F2] text-[12.5px] no-underline"
              >
                View plans →
              </Link>
            )}
          </div>
        </section>

        <section className="mt-10 border-l-2 border-[#FF5555] pl-4">
          <h2 className="text-[14px] font-semibold text-[#FF5555]">
            Danger zone
          </h2>
          <p className="mt-1 mb-3 text-[#8A8F98] text-[11.5px] leading-[1.7]">
            Deleting your account removes your profile, login connections, and
            subscription record. This cannot be undone.
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
      <dt className="text-[#6C7280] text-[11.5px]">{label}</dt>
      <dd className="text-[#F8F8F2] break-words">{value}</dd>
    </div>
  );
}

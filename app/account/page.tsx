import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TIERS } from "@/lib/tiers";
import { DeleteAccountButton } from "./delete-button";

export const metadata: Metadata = {
  title: "Account — DevReview",
};

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const tier = TIERS[session.user.tier ?? "free"];

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

        <dl className="mt-6 border border-[#2A2A2A] bg-[#161616] divide-y divide-[#1F1F1F]">
          <Row label="Email" value={session.user.email ?? "—"} />
          <Row label="Name" value={session.user.name ?? "—"} />
          <Row
            label="Plan"
            value={`${tier.label}${tier.priceUsdMonthly ? ` — $${tier.priceUsdMonthly}/mo` : ""}`}
          />
        </dl>

        <p className="mt-4 text-[#6C7280] text-[11.5px] leading-[1.7]">
          Billing management (upgrade, change plan, cancel) arrives with the
          payments phase.
        </p>

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

"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[#0D0D0D] text-[#F8F8F2] font-mono text-[13px] flex items-center justify-center px-6">
      <div className="w-full max-w-[380px]">
        <Link
          href="/"
          className="text-[#6C7280] text-[11.5px] hover:text-[#F8F8F2] no-underline"
        >
          ← back to dev·review
        </Link>

        <div className="mt-6 border border-[#2A2A2A] bg-[#161616] p-6">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#D4D4D4]">
            <span className="inline-block w-[6px] h-[6px] bg-[#F8F8F2]" />
            dev<span className="font-normal text-[#6C7280]">·</span>review
          </div>
          <h1 className="mt-4 text-[15px] text-[#F8F8F2]">Sign in</h1>
          <p className="mt-1 text-[#8A8F98] text-[11.5px] leading-[1.6]">
            Sign in to manage a Lite or Pro plan. Anonymous reviews don&apos;t
            require an account.
          </p>

          <div className="mt-5 flex flex-col gap-[10px]">
            <button
              type="button"
              onClick={() => signIn("github", { callbackUrl: "/review" })}
              className="w-full px-4 py-[10px] border border-[#2A2A2A] bg-[#1F1F1F] hover:bg-[#232323] text-[#F8F8F2] text-[12.5px] text-left inline-flex items-center gap-[10px]"
            >
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-[14px] h-[14px]"
                aria-hidden
              >
                <title>GitHub</title>
                <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.81.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82a7.66 7.66 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Continue with GitHub
            </button>

            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/review" })}
              className="w-full px-4 py-[10px] border border-[#2A2A2A] bg-[#1F1F1F] hover:bg-[#232323] text-[#F8F8F2] text-[12.5px] text-left inline-flex items-center gap-[10px]"
            >
              <span
                className="inline-block w-[14px] h-[14px] text-center font-semibold text-[#7AB7FF]"
                aria-hidden
              >
                G
              </span>
              Continue with Google
            </button>
          </div>

          <p className="mt-5 text-[#4A4D54] text-[11px] leading-[1.6]">
            By signing in you agree to how we handle account data — see the{" "}
            <Link href="/privacy" className="underline hover:text-[#B6BAC1]">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}

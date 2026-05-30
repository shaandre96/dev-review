import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DevReview — terminal AI code review",
    template: "%s · DevReview",
  },
  description:
    "Terminal-style AI code review. Paste a function, file, or GitHub PR URL and get streamed, categorised feedback.",
  applicationName: "DevReview",
  authors: [{ name: "Andre Sha" }],
  openGraph: {
    type: "website",
    siteName: "DevReview",
    title: "DevReview — terminal AI code review",
    description:
      "Paste a function, file, or GitHub PR and get a structured, categorised review streamed back, powered by Claude.",
  },
  twitter: {
    card: "summary_large_image",
    title: "DevReview — terminal AI code review",
    description:
      "Paste a function, file, or GitHub PR and get a structured, categorised review streamed back, powered by Claude.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terminal",
  description:
    "Paste a function, file, or GitHub PR and get a structured, categorised review streamed back, line by line.",
};

export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

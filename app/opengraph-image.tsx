import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "DevReview — AI code review in a terminal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0D0D0D";
const FG = "#F8F8F2";
const DIM = "#6C7280";
const MUTED = "#8A8F98";
const LINE = "#2A2A2A";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: BG,
        color: FG,
        fontFamily: "monospace",
        display: "flex",
        flexDirection: "column",
        padding: 80,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "#D4D4D4",
          fontSize: 22,
        }}
      >
        <div style={{ width: 10, height: 10, background: FG }} />
        dev<span style={{ color: DIM, margin: "0 2px" }}>·</span>review
      </div>

      <div
        style={{
          marginTop: 60,
          fontSize: 78,
          lineHeight: 1.1,
          fontWeight: 600,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <span>Code review,</span>
        <span>
          streamed <span style={{ color: "#50FA7B" }}>like a terminal.</span>
        </span>
      </div>

      <div
        style={{
          marginTop: 32,
          fontSize: 28,
          color: MUTED,
          lineHeight: 1.4,
          maxWidth: 980,
        }}
      >
        Paste code or a GitHub PR — get a structured, categorised review
        streamed back, powered by Claude.
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 32,
          borderTop: `1px solid ${LINE}`,
          display: "flex",
          gap: 24,
          fontSize: 22,
        }}
      >
        <span style={{ color: "#FF5555" }}>[SECURITY]</span>
        <span style={{ color: "#FFB86C" }}>[PERF]</span>
        <span style={{ color: DIM }}>[STYLE]</span>
        <span style={{ color: "#50FA7B" }}>[GOOD]</span>
      </div>
    </div>,
    { ...size },
  );
}

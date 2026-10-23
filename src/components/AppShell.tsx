"use client";

import dynamic from "next/dynamic";

// react-pdf needs the browser (canvas, workers), so the app renders client-side only.
const ReviewCopilot = dynamic(() => import("./ReviewCopilot"), {
  ssr: false,
  loading: () => <p className="pt-32 text-center font-serif italic text-muted">Review Copilot</p>,
});

export default function AppShell() {
  return <ReviewCopilot />;
}

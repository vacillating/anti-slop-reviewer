"use client";

import { useRef, useState } from "react";

export const SAMPLE_PDF = "/samples/bert-1810.04805.pdf";

export default function StartScreen({ onFile }: { onFile(file: File | string, name: string): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (f: File | undefined) => {
    if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) onFile(f, f.name);
  };

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <p className="label mb-6">Review Copilot</p>
        <h1 className="font-serif text-4xl leading-tight text-ink">Read the paper. Form your own view.</h1>
        <p className="mt-4 max-w-lg font-serif text-lg leading-relaxed text-ink-soft">
          The copilot walks you through the paper section by section, answers factual questions with quotes, and asks
          for your take. It never tells you what it thinks of the paper.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files[0]);
          }}
          onClick={() => input.current?.click()}
          className={`mt-10 cursor-pointer rounded-sm border border-dashed px-8 py-12 text-center transition-colors ${
            dragging ? "border-accent bg-accent-soft" : "border-hairline bg-paper hover:border-muted"
          }`}
        >
          <p className="text-ink">Drop a paper PDF here, or click to choose a file</p>
          <p className="mt-1 text-sm text-muted">The file stays in your browser. Only its extracted text goes to the copilot.</p>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => accept(e.target.files?.[0])}
          />
        </div>

        <button
          onClick={() => onFile(SAMPLE_PDF, "bert-1810.04805.pdf")}
          className="mt-5 text-sm text-ink-soft underline decoration-hairline underline-offset-4 hover:text-accent hover:decoration-accent"
        >
          Or use the sample paper (BERT, Devlin et al., NAACL 2019)
        </button>
      </div>
    </main>
  );
}

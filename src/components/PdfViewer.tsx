"use client";

import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { findQuote, normalizeWithMap } from "@/lib/textMatch";
import { itemsToText } from "@/lib/pdfText";
import type { Citation } from "@/lib/types";
import type { PDFDocumentProxy } from "pdfjs-dist";

// Must be set in the module that renders <Document>; assets are copied to
// public/pdfjs by scripts/copy-pdf-assets.mjs.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
const PDF_OPTIONS = { cMapUrl: "/pdfjs/cmaps/", standardFontDataUrl: "/pdfjs/standard_fonts/" };

const GUTTER = 36;
const MAX_PAGE_WIDTH = 920;

export type LocateStatus = "exact" | "fuzzy" | "page" | "none";

export interface CitationLocation {
  citation: Citation;
  page: number;
  status: LocateStatus;
  /** Vertical position of the passage on its page, as a fraction of page height. */
  topPct: number;
}

export interface Marker {
  id: string;
  page: number;
  topPct: number;
  label: string;
}

export interface PdfViewerHandle {
  /** Highlights a turn's citations and scrolls to one of them. Never throws. */
  showCitations(citations: Citation[], focusIndex?: number): Promise<CitationLocation[]>;
  clearHighlights(): void;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  file: string | File;
  onTextExtracted(pages: string[]): void;
  markers: Marker[];
  activeMarkerId: string | null;
  onMarkerClick(id: string): void;
  onAskAbout?(selection: { page: number; text: string }): void;
  ref?: Ref<PdfViewerHandle>;
}

/** Finds a quote in a rendered page's text layer and returns its rects (fractions of the page box). */
function locateInPage(pageEl: HTMLElement, quote: string): { rects: Rect[]; quality: "exact" | "fuzzy" } | null {
  const layer = pageEl.querySelector(".textLayer");
  if (!layer) return null;
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const starts: number[] = [];
  let full = "";
  while (walker.nextNode()) {
    const t = walker.currentNode as Text;
    nodes.push(t);
    starts.push(full.length);
    full += t.data;
  }
  if (!full) return null;

  const { norm, map } = normalizeWithMap(full);
  const m = findQuote(norm, quote);
  if (!m) return null;

  const startChar = map[m.start];
  const endChar = map[m.end - 1] + 1;
  const toPos = (c: number): [Text, number] => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > c) i--;
    return [nodes[i], Math.min(c - starts[i], nodes[i].data.length)];
  };
  const range = document.createRange();
  const [sn, so] = toPos(startChar);
  const [en, eo] = toPos(endChar - 1);
  range.setStart(sn, so);
  range.setEnd(en, Math.min(eo + 1, en.data.length));

  const box = pageEl.getBoundingClientRect();
  const raw = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
  // Merge rects on the same line so the highlight reads as one stroke per line.
  const lines: DOMRect[][] = [];
  for (const r of raw.sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find((l) => Math.abs(l[0].top - r.top) < r.height * 0.5);
    if (line) line.push(r);
    else lines.push([r]);
  }
  const rects = lines.map((l) => {
    const left = Math.min(...l.map((r) => r.left));
    const right = Math.max(...l.map((r) => r.right));
    const top = Math.min(...l.map((r) => r.top));
    const bottom = Math.max(...l.map((r) => r.bottom));
    return {
      left: (left - box.left) / box.width,
      top: (top - box.top) / box.height,
      width: (right - left) / box.width,
      height: (bottom - top) / box.height,
    };
  });
  return rects.length ? { rects, quality: m.quality } : null;
}

/**
 * One rendered page. Memoized with stable props so that highlight, marker and
 * selection state changes do not re-render the text layer (which would wipe the
 * reviewer's text selection).
 */
const PdfPage = memo(function PdfPage({
  pageNumber,
  width,
  onTextLayerReady,
}: {
  pageNumber: number;
  width: number;
  onTextLayerReady(page: number): void;
}) {
  return (
    <Page
      pageNumber={pageNumber}
      width={width}
      suspense={false}
      renderTextLayer
      renderAnnotationLayer
      onRenderTextLayerSuccess={() => onTextLayerReady(pageNumber)}
      loading={<div style={{ height: width * 1.294 }} />}
    />
  );
});

export default function PdfViewer({ file, onTextExtracted, markers, activeMarkerId, onMarkerClick, onAskAbout, ref }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const readyPages = useRef(new Set<number>());
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(700);
  const [highlights, setHighlights] = useState<Map<number, Rect[]>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [askButton, setAskButton] = useState<{ top: number; left: number; page: number; text: string } | null>(null);

  // Fit pages to the column width.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(Math.max(320, Math.min(MAX_PAGE_WIDTH, el.clientWidth - GUTTER * 2 - 16)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleLoad = useCallback(
    async (pdf: PDFDocumentProxy) => {
      setNumPages(pdf.numPages);
      readyPages.current.clear();
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const content = await (await pdf.getPage(i)).getTextContent();
          pages.push(itemsToText(content.items));
        } catch {
          pages.push("");
        }
      }
      onTextExtracted(pages);
    },
    [onTextExtracted],
  );

  const markReady = useCallback((page: number) => readyPages.current.add(page), []);

  const waitForPage = useCallback(async (page: number, timeoutMs = 5000) => {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const el = pageEls.current.get(page);
      if (el && readyPages.current.has(page) && el.querySelector(".textLayer")?.textContent) return el;
      await new Promise((r) => setTimeout(r, 100));
    }
    return pageEls.current.get(page) ?? null;
  }, []);

  const scrollToPage = useCallback((page: number, topPct: number) => {
    const container = scrollRef.current;
    const el = pageEls.current.get(page);
    if (!container || !el) return;
    const y = el.offsetTop + topPct * el.offsetHeight - container.clientHeight * 0.28;
    container.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      clearHighlights: () => setHighlights(new Map()),
      async showCitations(citations, focusIndex = 0) {
        const results: CitationLocation[] = [];
        const next = new Map<number, Rect[]>();
        for (const citation of citations) {
          let loc: CitationLocation = { citation, page: citation.page, status: "none", topPct: 0 };
          try {
            // Cited page first, then its neighbours, then the rest of the paper.
            const candidates = [citation.page, citation.page + 1, citation.page - 1];
            for (let p = 1; p <= numPages; p++) if (!candidates.includes(p)) candidates.push(p);
            for (const p of candidates) {
              if (p < 1 || p > numPages) continue;
              const el = p === citation.page ? await waitForPage(p) : readyPages.current.has(p) ? pageEls.current.get(p) : null;
              if (!el) continue;
              const found = locateInPage(el, citation.quote);
              if (found) {
                next.set(p, [...(next.get(p) ?? []), ...found.rects]);
                loc = { citation, page: p, status: found.quality, topPct: found.rects[0].top };
                break;
              }
            }
            if (loc.status === "none" && citation.page >= 1 && citation.page <= numPages) {
              loc = { ...loc, status: "page" };
            }
          } catch (err) {
            console.warn("[highlight] failed", err);
          }
          results.push(loc);
        }
        setHighlights(next);
        const focus = results[focusIndex] ?? results[0];
        if (focus && focus.status !== "none") scrollToPage(focus.page, focus.topPct);
        return results;
      },
    }),
    [numPages, waitForPage, scrollToPage],
  );

  // "Ask about this" button for text selected in the PDF.
  const handleMouseUp = useCallback(() => {
    if (!onAskAbout) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
      const container = scrollRef.current;
      if (!sel || sel.rangeCount === 0 || text.length < 3 || !container) return setAskButton(null);
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      const pageEl = anchor?.closest<HTMLElement>("[data-page]");
      if (!pageEl || !container.contains(pageEl)) return setAskButton(null);
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const box = container.getBoundingClientRect();
      setAskButton({
        top: rect.bottom - box.top + container.scrollTop + 8,
        left: Math.min(rect.left - box.left + rect.width / 2, box.width - 80),
        page: Number(pageEl.dataset.page),
        text: text.slice(0, 1200),
      });
    }, 0);
  }, [onAskAbout]);

  const pageList = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);
  const markersByPage = useMemo(() => {
    const m = new Map<number, Marker[]>();
    for (const mk of markers) m.set(mk.page, [...(m.get(mk.page) ?? []), mk]);
    return m;
  }, [markers]);

  return (
    <div
      ref={scrollRef}
      className="quiet-scroll relative h-full overflow-y-auto bg-desk"
      onMouseUp={handleMouseUp}
      onMouseDown={() => setAskButton(null)}
    >
      <Document
        file={file}
        options={PDF_OPTIONS}
        suspense={false}
        onLoadSuccess={handleLoad}
        onLoadError={(e) => setLoadError(e.message)}
        loading={<p className="pt-24 text-center font-serif italic text-muted">Opening the paper…</p>}
        error={<p className="pt-24 text-center font-serif text-accent">Could not open this PDF. {loadError}</p>}
        className="py-8"
      >
        {pageList.map((n) => (
          <div
            key={n}
            data-page={n}
            ref={(el) => {
              if (el) pageEls.current.set(n, el);
              else pageEls.current.delete(n);
            }}
            className="relative mx-auto mb-6 bg-white shadow-[0_1px_3px_rgba(60,45,30,0.12),0_0_0_1px_rgba(60,45,30,0.05)]"
            style={{ width }}
          >
            <PdfPage pageNumber={n} width={width} onTextLayerReady={markReady} />
            {/* Highlight overlay, positioned in page-relative fractions so it survives resizes. */}
            <div className="pointer-events-none absolute inset-0 z-[3] mix-blend-multiply">
              {(highlights.get(n) ?? []).map((r, i) => (
                <div
                  key={i}
                  className="pdf-mark absolute rounded-[2px] bg-mark"
                  style={{
                    left: `calc(${r.left * 100}% - 2px)`,
                    top: `calc(${r.top * 100}% - 1px)`,
                    width: `calc(${r.width * 100}% + 4px)`,
                    height: `calc(${r.height * 100}% + 2px)`,
                  }}
                />
              ))}
            </div>
            {/* Margin markers for passages discussed earlier. */}
            {(markersByPage.get(n) ?? []).map((mk) => (
              <button
                key={`${mk.id}-${mk.topPct}`}
                title={mk.label}
                onClick={() => onMarkerClick(mk.id)}
                className="group absolute flex h-5 w-6 items-center justify-center"
                style={{ left: -GUTTER + 4, top: `calc(${mk.topPct * 100}% - 4px)` }}
              >
                <span
                  className={`block w-[3px] rounded-full transition-all ${
                    mk.id === activeMarkerId ? "h-5 bg-accent" : "h-3.5 bg-accent/40 group-hover:h-5 group-hover:bg-accent/80"
                  }`}
                />
              </button>
            ))}
            <span className="absolute -bottom-5 right-0 text-[10px] tracking-wide text-muted">{n}</span>
          </div>
        ))}
      </Document>

      {askButton && onAskAbout && (
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={() => {
            onAskAbout({ page: askButton.page, text: askButton.text });
            window.getSelection()?.removeAllRanges();
            setAskButton(null);
          }}
          className="fade-up absolute z-20 -translate-x-1/2 rounded-full border border-hairline bg-sheet px-3 py-1 text-xs font-medium text-ink shadow-sm hover:border-accent hover:text-accent"
          style={{ top: askButton.top, left: askButton.left }}
        >
          Ask about this
        </button>
      )}
    </div>
  );
}

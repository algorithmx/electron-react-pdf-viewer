import React, { useEffect, useRef, useLayoutEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { calculateStartEnd, processPage, setUpCanvasElement } from './utils';
import usePdfLayout from './usePdfLayout';

interface UseContinuousPdfRendererProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  textLayerRef: React.MutableRefObject<HTMLDivElement | null>;
  scaleRef: React.MutableRefObject<number | undefined>;
  // Current pdf scroll offset (in PDF CSS pixels)
  scrollOffset: number;
  // Visible height of the container (in CSS pixels)
  visibleHeight: number;
  containerWidth: number;
  setTotalHeight: (height: number) => void;
  // Maximum number of pages to keep in the cache, default to 20
  maxPagesKept: number;
}

/**
 * This hook composes the rendered (pre-rendered) pages onto a canvas.
 * It now relies on usePdfLayout for computing pages layout and scale.
 */
export default function useContinuousPdfRenderer({
  pdfDoc,
  containerRef,
  canvasRef,
  textLayerRef,
  scaleRef,
  scrollOffset,
  visibleHeight,
  containerWidth,
  setTotalHeight,
  maxPagesKept,
}: UseContinuousPdfRendererProps): void {
  // Cache for rendered pages: key = page number, value = offscreen canvas.
  const pageCanvasCacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  // Cache for rendered text layers to avoid redundant re-rendering.
  const pageTextLayerCacheRef = useRef<Map<number, HTMLDivElement>>(new Map());
  // Lock for page rendering
  const pageRenderLockRef = useRef<Set<number>>(new Set());
  // List of processed page numbers
  const processedPageNumbersRef = useRef<number[]>([]);

  // Clear caches when pdfDoc changes.
  useEffect(() => {
    pageCanvasCacheRef.current.clear();
    pageTextLayerCacheRef.current.clear();
  }, [pdfDoc]);

  // Retrieve layout data using the new usePdfLayout hook.
  const pagesData = usePdfLayout({
    pdfDoc,
    containerWidth,
    setTotalHeight,
    scaleRef,
  });

  // Composite visible pages onto a canvas sized to the container.
  useLayoutEffect(() => {
    if (!pdfDoc) {
      // eslint-disable-next-line no-console
      console.error('No PDF document found');
      return;
    }
    const container = containerRef.current;
    if (!container) {
      // eslint-disable-next-line no-console
      console.error('No container found');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      // eslint-disable-next-line no-console
      console.error('No canvas found');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // eslint-disable-next-line no-console
      console.error('No context found');
      return;
    }

    function compositeVisiblePages({
      visibleStart,
      visibleEnd,
      cacheStart,
      cacheEnd,
    }: {
      visibleStart: number;
      visibleEnd: number;
      cacheStart: number;
      cacheEnd: number;
    }) {
      const devicePixelRatio = window.devicePixelRatio || 1;
      setUpCanvasElement(
        canvas!,
        container!.clientWidth,
        visibleHeight,
        devicePixelRatio,
      );
      ctx!.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      // Clear old text layer elements.
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
      }

      // --- LRU Cache Eviction Strategy: Keep N most recent pdf pages ---
      // Iterate over pages in the current cache range.
      for (let i = cacheStart; i <= cacheEnd; i += 1) {
        const pageData = pagesData[i];
        if (!pageData) {
          // eslint-disable-next-line no-continue
          continue;
        }
        const pageNumber = i + 1;
        const cacheHit = processPage(
          pageData,
          i,
          visibleStart,
          visibleEnd,
          cacheStart,
          cacheEnd,
          ctx!,
          pdfDoc!,
          pageCanvasCacheRef,
          textLayerRef.current!,
          pageTextLayerCacheRef,
          pageRenderLockRef,
        );
        if (!cacheHit) {
          processedPageNumbersRef.current.push(pageNumber);
        }
      }

      // Update the recent pages list with the 10 most recently processed pages.
      if (processedPageNumbersRef.current.length > maxPagesKept) {
        processedPageNumbersRef.current =
          processedPageNumbersRef.current.slice(-maxPagesKept);
        // Evict cache entries not in the recent pages list.
        const allowedPages = new Set(processedPageNumbersRef.current);
        const evictCacheEntries = <T>(cache: Map<number, T>): void => {
          Array.from(cache.keys()).forEach((page) => {
            if (
              !allowedPages.has(page) &&
              !pageRenderLockRef.current.has(page)
            ) {
              // eslint-disable-next-line no-console
              cache.delete(page);
            }
          });
        };
        evictCacheEntries(pageCanvasCacheRef.current);
        evictCacheEntries(pageTextLayerCacheRef.current);
      }
    }
    // --- End of LRU Cache Eviction Strategy ---

    const [visibleStart, visibleEnd, cacheStart, cacheEnd] = calculateStartEnd(
      pagesData,
      pdfDoc!.numPages,
      scrollOffset,
      visibleHeight,
      1,
    );

    // Offload heavy compositing work to the next animation frame.
    const frameId = window.requestAnimationFrame(() => {
      compositeVisiblePages({
        visibleStart,
        visibleEnd,
        cacheStart,
        cacheEnd,
      });
    });

    // eslint-disable-next-line consistent-return
    return () => {
      window.cancelAnimationFrame(frameId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, scrollOffset, visibleHeight, pagesData]);
}

import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  calculateStartEnd,
  renderTextLayer,
  processPage,
  setUpCanvasElement,
} from './utils';
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
}: UseContinuousPdfRendererProps): void {
  // Cache for rendered pages: key = page number, value = offscreen canvas.
  const pageCanvasCacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  // Improved: Cache for rendered text layers to avoid redundant re-rendering.
  const pageTextLayerCacheRef = useRef<Map<number, HTMLDivElement>>(new Map());

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

  // Dummy state to force re-render when async rendering finishes.
  const [rerenderFlag, setRerenderFlag] = useState<boolean>(false);
  // Ref for scheduling canvas rendering via requestAnimationFrame.
  const renderRafRef = useRef<number | null>(null);

  // Composite visible pages onto a canvas sized to the container.
  useLayoutEffect(() => {
    if (!pdfDoc) return;
    const container = containerRef.current;
    if (!container) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cancel any pending frame to avoid redundant renders.
    if (renderRafRef.current !== null) {
      cancelAnimationFrame(renderRafRef.current);
      renderRafRef.current = null;
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

      // --- Eviction Strategy ---
      const buffer = 2;
      // Convert indices (zero-indexed) to page numbers (1-indexed)
      const minAllowedPage = Math.max(1, cacheStart + 1 - buffer);
      const maxAllowedPage = Math.min(pdfDoc!.numPages, cacheEnd + 1 + buffer);

      // Helper to evict entries outside of the allowed range.
      const evictCacheEntries = <T>(cache: Map<number, T>): void => {
        Array.from(cache.keys()).forEach((page) => {
          if (page < minAllowedPage || page > maxAllowedPage) {
            cache.delete(page);
          }
        });
      };

      evictCacheEntries(pageCanvasCacheRef.current);
      evictCacheEntries(pageTextLayerCacheRef.current);
      // --- End of Eviction Strategy ---

      // Clear old text layer elements.
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
      }

      // Iterate over pages in the current cache range.
      for (let i = cacheStart; i <= cacheEnd; i += 1) {
        const pageData = pagesData[i];
        if (!pageData) {
          // eslint-disable-next-line no-continue
          continue;
        }

        processPage(
          pageData,
          i,
          visibleStart,
          visibleEnd,
          cacheStart,
          cacheEnd,
          ctx!,
          pdfDoc!,
          pageCanvasCacheRef,
          setRerenderFlag,
        );

        const pageBottom = pageData.yOffset + pageData.viewport.height;
        if (pageBottom >= visibleStart && pageData.yOffset <= visibleEnd) {
          const pageNumber = i + 1;
          // Use a cached text layer if available; otherwise, render it.
          if (pageTextLayerCacheRef.current.has(pageNumber)) {
            textLayerRef.current?.appendChild(
              pageTextLayerCacheRef.current.get(pageNumber)!,
            );
          } else {
            renderTextLayer(pageData, pdfDoc!, pageNumber)
              .then((textDiv) => {
                textLayerRef.current?.appendChild(textDiv);
                pageTextLayerCacheRef.current.set(pageNumber, textDiv);
                return null;
              })
              .catch((error) => {
                // eslint-disable-next-line no-console
                console.error('Error rendering text layer:', error);
              });
          }
        }
      }
    }

    const [visibleStart, visibleEnd, cacheStart, cacheEnd] = calculateStartEnd(
      pagesData,
      pdfDoc!.numPages,
      scrollOffset,
      visibleHeight,
      2,
    );

    compositeVisiblePages({
      visibleStart,
      visibleEnd,
      cacheStart,
      cacheEnd,
    });
  }, [
    pdfDoc,
    containerRef,
    canvasRef,
    textLayerRef,
    scrollOffset,
    visibleHeight,
    rerenderFlag,
    containerWidth,
    pagesData,
    setTotalHeight,
  ]);
}

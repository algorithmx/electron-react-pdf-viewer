import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  calculateStartEnd,
  renderCanvas,
  renderTextLayer,
  getPagesDataArray,
  processPage,
  requestIdleCallbackShim,
} from './utils';

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
  // Cache for text layers: key = page number, value = text layer div.
  const pageTextLayerCacheRef = useRef<Map<number, HTMLDivElement>>(new Map());
  // Array to hold each page's viewport (dimensions) and its y-offset in the overall PDF.
  const pagesDataRef = useRef<
    Array<{ viewport: pdfjsLib.PageViewport; yOffset: number }>
  >([]);

  // New effect: clear caches whenever pdfDoc changes (or becomes null)
  useEffect(() => {
    pageCanvasCacheRef.current.clear();
    pageTextLayerCacheRef.current.clear();
    pagesDataRef.current = [];
  }, [pdfDoc]);

  // Dummy state to force re-composition when async rendering finishes.
  const [rerenderFlag, setRerenderFlag] = useState<boolean>(false);
  // Add a new ref for scheduling canvas rendering via requestAnimationFrame
  const renderRafRef = useRef<number | null>(null);

  // Compute layout (scale, per-page viewports and cumulative y-offsets) when pdfDoc or containerWidth changes.
  useEffect(() => {
    if (!pdfDoc) return;
    let isCancelled = false;

    // Schedule background pre-rendering of pages one at a time.
    function schedulePreRendering(pageNumber: number): void {
      if (isCancelled || pageNumber > pdfDoc!.numPages) return;
      if (!pageCanvasCacheRef.current.has(pageNumber)) {
        const pageData = pagesDataRef.current[pageNumber - 1];
        const { viewport } = pageData;
        const outputScale = window.devicePixelRatio || 1;
        // eslint-disable-next-line promise/catch-or-return
        renderCanvas(
          pdfDoc!,
          pageNumber,
          viewport,
          outputScale,
          setRerenderFlag,
          pageCanvasCacheRef,
        )
          .catch((error) => {
            // eslint-disable-next-line no-console
            console.error('Error pre-rendering page:', error);
          })
          .finally(() => {
            requestIdleCallbackShim(() => {
              schedulePreRendering(pageNumber + 1);
            });
          });
      } else {
        requestIdleCallbackShim(() => {
          schedulePreRendering(pageNumber + 1);
        });
      }
    }

    async function computeLayout() {
      // Clear the previous cache when a new PDF is loaded or dimensions change.
      pageCanvasCacheRef.current.clear();
      pageTextLayerCacheRef.current.clear();

      // Use the first page to determine the base viewport.
      const firstPage = await pdfDoc!.getPage(1);
      const baseViewport = firstPage.getViewport({ scale: 1 });
      // Recalculate the scale based on the current containerWidth.
      const scale = containerWidth / baseViewport.width;
      scaleRef.current = scale;
      const { pagesDataLocal, totalHeightLocal } = await getPagesDataArray(
        pdfDoc!,
        scale,
      );
      pagesDataRef.current = pagesDataLocal;
      setTotalHeight(totalHeightLocal);
      setRerenderFlag((prev: boolean) => !prev);
      schedulePreRendering(1);
    }
    computeLayout();
    isCancelled = true;
  }, [pdfDoc, containerWidth, setTotalHeight, scaleRef]);

  // Composite visible pages onto a canvas sized to the container.
  useEffect(() => {
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
    }

    renderRafRef.current = requestAnimationFrame(() => {
      // Adjust canvas dimensions based on devicePixelRatio.
      const devicePixelRatio = window.devicePixelRatio || 1;
      const containerWidthLocal = container.clientWidth;
      canvas.width = Math.floor(containerWidthLocal * devicePixelRatio);
      canvas.height = Math.floor(visibleHeight * devicePixelRatio);
      canvas.style.width = `${containerWidthLocal}px`;
      canvas.style.height = `${visibleHeight}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Determine visible region in PDF CSS pixels.
      const visibleStart = scrollOffset;
      const visibleEnd = scrollOffset + visibleHeight;
      const [cacheStart, cacheEnd] = calculateStartEnd(
        pagesDataRef.current,
        pdfDoc.numPages,
        visibleStart,
        visibleEnd,
        3,
      );

      // Clear previously rendered text layers.
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
      }

      // Iterate only over pages in the cache range.
      for (let i = cacheStart; i <= cacheEnd; i += 1) {
        const pageData = pagesDataRef.current[i];
        if (!pageData) {
          // eslint-disable-next-line no-continue
          continue;
        }

        // Process the canvas drawing.
        processPage(
          pageData,
          i,
          visibleStart,
          visibleEnd,
          cacheStart,
          cacheEnd,
          ctx,
          pdfDoc,
          pageCanvasCacheRef,
          setRerenderFlag,
        );

        // And immediately process text layer rendering if this page is visible.
        const pageBottom = pageData.yOffset + pageData.viewport.height;
        if (pageBottom >= visibleStart && pageData.yOffset <= visibleEnd) {
          renderTextLayer(pageData, pdfDoc, i + 1)
            .then((textDiv) => {
              textLayerRef.current?.appendChild(textDiv);
              return null;
            })
            .catch((error) => {
              // eslint-disable-next-line no-console
              console.error('Error rendering text layer:', error);
            });
        }
      }
      renderRafRef.current = null;
    });
  }, [
    pdfDoc,
    containerRef,
    canvasRef,
    textLayerRef,
    scrollOffset,
    visibleHeight,
    rerenderFlag,
  ]);
}

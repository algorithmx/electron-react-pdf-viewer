import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  calculateStartEnd,
  renderCanvas,
  renderTextLayer,
  getPagesDataArray,
  processPage,
  requestIdleCallbackShim,
  getWidestPage,
  PageData,
  setUpCanvasElement,
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
  const pagesDataRef = useRef<Array<PageData>>([]);
  // Dummy state to force re-composition when async rendering finishes.
  const [rerenderFlag, setRerenderFlag] = useState<boolean>(false);
  // Add a new ref for scheduling canvas rendering via requestAnimationFrame
  const renderRafRef = useRef<number | null>(null);

  function clearCaches() {
    pageCanvasCacheRef.current.clear();
    pageTextLayerCacheRef.current.clear();
    pagesDataRef.current = [];
  }

  // Clear caches whenever pdfDoc changes (or becomes null)
  useEffect(() => {
    clearCaches();
  }, [pdfDoc]);

  // Compute layout (scale, per-page viewports and cumulative y-offsets) when pdfDoc or containerWidth changes.
  useEffect(() => {
    if (!pdfDoc) return;
    let isCancelled = false;
    clearCaches();
    // Schedule background pre-rendering of pages one at a time.
    function schedulePreRendering(pageNumber: number): void {
      if (isCancelled || pageNumber > pdfDoc!.numPages) return;
      const pageData = pagesDataRef.current[pageNumber - 1];
      const { viewport } = pageData;
      const outputScale = window.devicePixelRatio || 1;

      // If not cached, schedule rendering,
      // otherwise use an immediately resolved promise.
      const renderPromise = !pageCanvasCacheRef.current.has(pageNumber)
        ? renderCanvas(
            pdfDoc!,
            pageNumber,
            viewport,
            outputScale,
            setRerenderFlag,
            pageCanvasCacheRef,
          )
        : Promise.resolve();
      // eslint-disable-next-line no-void
      void renderPromise
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.error('Error pre-rendering page:', error);
        })
        .finally(() => {
          requestIdleCallbackShim(() => {
            schedulePreRendering(pageNumber + 1);
          });
        });
    }

    async function computeLayout() {
      // Clear the previous cache when a new PDF is loaded or dimensions change.
      const widestPage = await getWidestPage(pdfDoc!);
      const baseViewport = widestPage.getViewport({ scale: 1 });
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
    // eslint-disable-next-line consistent-return
    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, containerWidth, setTotalHeight, scaleRef]);

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

    // Rendering logic
    const compositeVisiblePages = ({
      visibleStart,
      visibleEnd,
      cacheStart,
      cacheEnd,
    }: {
      visibleStart: number;
      visibleEnd: number;
      cacheStart: number;
      cacheEnd: number;
    }) => {
      // Adjust canvas dimensions based on devicePixelRatio.
      const devicePixelRatio = window.devicePixelRatio || 1;
      setUpCanvasElement(
        canvas,
        container.clientWidth, // containerWidthLocal
        visibleHeight,
        devicePixelRatio,
      );
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

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

        // Process text layer rendering if this page is visible.
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
    };

    // Determine visible region in PDF CSS pixels.
    const [visibleStart, visibleEnd, cacheStart, cacheEnd] = calculateStartEnd(
      pagesDataRef.current,
      pdfDoc!.numPages,
      scrollOffset,
      visibleHeight,
      2,
    );

    // Immediately composite the visible pages.
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
    setTotalHeight,
  ]);
}

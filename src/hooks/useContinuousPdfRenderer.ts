import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

interface UseContinuousPdfRendererProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  scaleRef: React.MutableRefObject<number | undefined>;
  // Current pdf scroll offset (in PDF CSS pixels)
  scrollOffset: number;
  // Visible height of the container (in CSS pixels)
  visibleHeight: number;
  containerWidth: number; // added for responsiveness
  setTotalHeight: (height: number) => void;
}

// x <-- pagesDataRef.current
// N <-- pdfDoc.numPages
function calculateStartEnd(
  x: Array<{ viewport: pdfjsLib.PageViewport; yOffset: number }>,
  N: number,
  visibleStart: number,
  visibleEnd: number,
  Q: number = 3,
) {
  let firstVisibleIndex = Number.POSITIVE_INFINITY;
  let lastVisibleIndex = Number.NEGATIVE_INFINITY;

  // Find the first visible page.
  for (let i = 0; i < x.length; i += 1) {
    const { viewport, yOffset } = x[i];
    const pageBottom = yOffset + viewport.height;
    if (pageBottom >= visibleStart && yOffset <= visibleEnd) {
      firstVisibleIndex = i;
      break;
    }
  }

  // Find the last visible page.
  for (let i = x.length - 1; i >= 0; i -= 1) {
    const { viewport, yOffset } = x[i];
    const pageBottom = yOffset + viewport.height;
    if (pageBottom >= visibleStart && yOffset <= visibleEnd) {
      lastVisibleIndex = i;
      break;
    }
  }

  if (firstVisibleIndex === Number.POSITIVE_INFINITY) {
    firstVisibleIndex = 0;
    lastVisibleIndex = 0;
  }

  const cacheStart = Math.max(0, firstVisibleIndex - Q);
  const cacheEnd = Math.min(N - 1, lastVisibleIndex + Q);
  return [cacheStart, cacheEnd];
}

// Helper function to draw a portion of a page from an offscreen canvas.
function drawPageSection(
  renderCanvas: HTMLCanvasElement,
  pageData: { viewport: pdfjsLib.PageViewport; yOffset: number },
  visibleStart: number,
  visibleEnd: number,
  ctx: CanvasRenderingContext2D,
  outputScale: number,
) {
  const { viewport, yOffset } = pageData;
  const pageTop = yOffset;
  const pageBottom = pageTop + viewport.height;
  const clipTop = Math.max(pageTop, visibleStart);
  const clipBottom = Math.min(pageBottom, visibleEnd);
  const srcY = (clipTop - pageTop) * outputScale;
  const srcHeight = (clipBottom - clipTop) * outputScale;
  const destY = clipTop - visibleStart;
  ctx.drawImage(
    renderCanvas,
    0,
    srcY,
    renderCanvas.width,
    srcHeight,
    0,
    destY,
    renderCanvas.width / outputScale,
    srcHeight / outputScale,
  );
}

// Helper function to process and draw (or cache) a page.
function processPage(
  pageData: { viewport: pdfjsLib.PageViewport; yOffset: number },
  index: number,
  visibleStart: number,
  visibleEnd: number,
  cacheStart: number,
  cacheEnd: number,
  ctx: CanvasRenderingContext2D,
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageCacheRef: React.MutableRefObject<Map<number, HTMLCanvasElement>>,
  setRerenderFlag: (value: boolean) => void,
) {
  if (index < cacheStart || index > cacheEnd) return;
  const pageNumber = index + 1;
  const { viewport, yOffset } = pageData;
  const pageBottom = yOffset + viewport.height;
  const isPageVisible = pageBottom >= visibleStart && yOffset <= visibleEnd;
  const outputScale = window.devicePixelRatio || 1;
  const cachedCanvas = pageCacheRef.current.get(pageNumber);

  if (!cachedCanvas) {
    pdfDoc
      .getPage(pageNumber)
      .then((page) => {
        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = Math.floor(viewport.width * outputScale);
        renderCanvas.height = Math.floor(viewport.height * outputScale);
        renderCanvas.style.width = `${Math.floor(viewport.width)}px`;
        renderCanvas.style.height = `${Math.floor(viewport.height)}px`;
        const renderCtx = renderCanvas.getContext('2d');
        if (!renderCtx) {
          throw new Error('No canvas context available');
        }
        renderCtx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        return page
          .render({ canvasContext: renderCtx, viewport })
          .promise.then(() => renderCanvas);
      })
      .then((renderCanvas) => {
        pageCacheRef.current.set(pageNumber, renderCanvas);
        if (isPageVisible) {
          drawPageSection(
            renderCanvas,
            pageData,
            visibleStart,
            visibleEnd,
            ctx,
            outputScale,
          );
        }
        setRerenderFlag((prev: boolean) => !prev);
        return renderCanvas;
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Error loading PDF:', error);
      });
    return;
  }

  if (!isPageVisible) return;
  drawPageSection(
    cachedCanvas,
    pageData,
    visibleStart,
    visibleEnd,
    ctx,
    outputScale,
  );
}

export default function useContinuousPdfRenderer({
  pdfDoc,
  containerRef,
  canvasRef,
  scaleRef,
  scrollOffset,
  visibleHeight,
  containerWidth, // received from Viewer
  setTotalHeight,
}: UseContinuousPdfRendererProps): void {
  // Cache for rendered pages: key = page number, value = offscreen canvas.
  const pageCacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  // Array to hold each page's viewport (dimensions) and its y-offset in the overall PDF.
  const pagesDataRef = useRef<
    Array<{ viewport: pdfjsLib.PageViewport; yOffset: number }>
  >([]);
  // Dummy state to force re-composition when async rendering finishes.
  const [rerenderFlag, setRerenderFlag] = useState<boolean>(false);
  // Add a new ref for scheduling canvas rendering via requestAnimationFrame
  const renderRafRef = useRef<number | null>(null);

  // Compute layout (scale, per-page viewports and cumulative y-offsets) when pdfDoc or containerWidth changes.
  useEffect(() => {
    if (!pdfDoc) return;
    let isCancelled = false;

    // Use requestIdleCallback if available, else fallback to setTimeout.
    function requestIdleCallbackShim(
      callback: (deadline: {
        timeRemaining: () => number;
        didTimeout: boolean;
      }) => void,
    ): number {
      if (window.requestIdleCallback) {
        return window.requestIdleCallback(callback);
      }
      return window.setTimeout(() => {
        callback({ didTimeout: false, timeRemaining: () => 50 });
      }, 50);
    }

    // Schedule background pre-rendering of pages one at a time.
    function schedulePreRendering(pageNumber: number): void {
      if (isCancelled || pageNumber > pdfDoc!.numPages) return;
      if (!pageCacheRef.current.has(pageNumber)) {
        // eslint-disable-next-line promise/catch-or-return
        pdfDoc!
          .getPage(pageNumber)
          .then((page) => {
            const pageData = pagesDataRef.current[pageNumber - 1];
            const { viewport } = pageData;
            const outputScale = window.devicePixelRatio || 1;
            const renderCanvas = document.createElement('canvas');
            renderCanvas.width = Math.floor(viewport.width * outputScale);
            renderCanvas.height = Math.floor(viewport.height * outputScale);
            renderCanvas.style.width = `${Math.floor(viewport.width)}px`;
            renderCanvas.style.height = `${Math.floor(viewport.height)}px`;
            const renderCtx = renderCanvas.getContext('2d');
            if (!renderCtx) {
              throw new Error('No canvas context available');
            }
            renderCtx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
            // Render the page offscreen.
            return page
              .render({ canvasContext: renderCtx, viewport })
              .promise.then(() => {
                pageCacheRef.current.set(pageNumber, renderCanvas);
                setRerenderFlag((prev: boolean) => !prev);
                return renderCanvas;
              });
          })
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
      // Use the first page to determine the base viewport.
      const firstPage = await pdfDoc!.getPage(1);
      const baseViewport = firstPage.getViewport({ scale: 1 });
      // Recalculate the scale based on the current containerWidth.
      const scale = containerWidth / baseViewport.width;
      scaleRef.current = scale;

      let totalHeightLocal = 0;
      const pagesDataLocal: Array<{
        viewport: pdfjsLib.PageViewport;
        yOffset: number;
      }> = [];
      // Clear the previous cache when a new PDF is loaded or dimensions change.
      pageCacheRef.current.clear();
      // Compute viewport details and cumulative y-offset for each page.
      for (let i = 1; i <= pdfDoc!.numPages; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const page = await pdfDoc!.getPage(i);
        const viewport = page.getViewport({ scale });
        pagesDataLocal.push({ viewport, yOffset: totalHeightLocal });
        totalHeightLocal += viewport.height;
      }
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
      // Use device pixel ratio for high DPI displays.
      const devicePixelRatio = window.devicePixelRatio || 1;
      // Adjust canvas dimensions according to the container and device pixel ratio.
      const containerWidthLocal = container.clientWidth;
      canvas.width = Math.floor(containerWidthLocal * devicePixelRatio);
      canvas.height = Math.floor(visibleHeight * devicePixelRatio);
      canvas.style.width = `${containerWidthLocal}px`;
      canvas.style.height = `${visibleHeight}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      // Clear previous contents before re-drawing.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Determine the visible section in the PDF's coordinate space.
      const visibleStart = scrollOffset;
      const visibleEnd = scrollOffset + visibleHeight;
      const [cacheStart, cacheEnd] = calculateStartEnd(
        pagesDataRef.current,
        pdfDoc.numPages,
        visibleStart,
        visibleEnd,
        3,
      );
      // Iterate over pages using the helper function.
      pagesDataRef.current.forEach((pageData, index) =>
        processPage(
          pageData,
          index,
          visibleStart,
          visibleEnd,
          cacheStart,
          cacheEnd,
          ctx,
          pdfDoc,
          pageCacheRef,
          setRerenderFlag,
        ),
      );
      renderRafRef.current = null;
    });
  }, [
    pdfDoc,
    containerRef,
    canvasRef,
    scrollOffset,
    visibleHeight,
    rerenderFlag,
  ]);
}

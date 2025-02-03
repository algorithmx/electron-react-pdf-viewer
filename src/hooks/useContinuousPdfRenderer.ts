import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

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
  canvasElement: HTMLCanvasElement,
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
    canvasElement,
    0,
    srcY,
    canvasElement.width,
    srcHeight,
    0,
    destY,
    canvasElement.width / outputScale,
    srcHeight / outputScale,
  );
}

// create canvas element
function createCanvasElement(
  viewport: pdfjsLib.PageViewport,
  outputScale: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  return canvas;
}

// render canvas, always set the cache.
function renderCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  viewport: pdfjsLib.PageViewport,
  outputScale: number,
  setRerenderFlag: React.Dispatch<React.SetStateAction<boolean>>,
  pageCanvasCacheRef: React.MutableRefObject<Map<number, HTMLCanvasElement>>,
): Promise<HTMLCanvasElement> {
  const canvasElement = createCanvasElement(viewport, outputScale);
  return pdfDoc!
    .getPage(pageNumber)
    .then((page) => {
      if (!canvasElement) {
        throw new Error('No render canvas available');
      }
      const renderCtx = canvasElement.getContext('2d');
      if (!renderCtx) {
        throw new Error('No canvas context available');
      }
      renderCtx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      return page.render({ canvasContext: renderCtx, viewport });
    })
    .then(() => {
      setRerenderFlag((prev: boolean) => !prev);
      pageCanvasCacheRef.current.set(pageNumber, canvasElement);
      return canvasElement;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error rendering canvas:', error);
      return canvasElement;
    });
}

// create text layer div
function createTextLayerDiv(pageData: {
  viewport: pdfjsLib.PageViewport;
  yOffset: number;
}) {
  const textDiv = document.createElement('div');
  textDiv.style.position = 'absolute';
  textDiv.style.left = '0px';
  textDiv.className = 'textLayer';
  textDiv.style.top = `${pageData.yOffset}px`;
  textDiv.style.width = `${pageData.viewport.width}px`;
  textDiv.style.height = `${pageData.viewport.height}px`;
  return textDiv;
}

// render text layer
function renderTextLayer(
  pageData: {
    viewport: pdfjsLib.PageViewport;
    yOffset: number;
  },
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
): Promise<HTMLDivElement> {
  const textDiv = createTextLayerDiv(pageData);
  return pdfDoc!
    .getPage(pageNumber)
    .then((page) => page.getTextContent())
    .then((textContent) => {
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textDiv,
        viewport: pageData.viewport,
      });
      textLayer.render();
      return textDiv;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error rendering text layer for page', pageNumber, error);
      return textDiv;
    });
}

async function getPagesDataArray(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  scale: number,
) {
  let totalHeightLocal = 0;
  const pagesDataLocal: Array<{
    viewport: pdfjsLib.PageViewport;
    yOffset: number;
  }> = [];
  // Compute viewport details and cumulative y-offset for each page.
  for (let i = 1; i <= pdfDoc!.numPages; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const page = await pdfDoc!.getPage(i);
    const viewport = page.getViewport({ scale });
    pagesDataLocal.push({ viewport, yOffset: totalHeightLocal });
    totalHeightLocal += viewport.height;
  }
  return { pagesDataLocal, totalHeightLocal };
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
  pageCanvasCacheRef: React.MutableRefObject<Map<number, HTMLCanvasElement>>,
  setRerenderFlag: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  if (index < cacheStart || index > cacheEnd) return;
  const pageNumber = index + 1;
  const { viewport, yOffset } = pageData;
  const pageBottom = yOffset + viewport.height;
  const isPageVisible = pageBottom >= visibleStart && yOffset <= visibleEnd;
  const outputScale = window.devicePixelRatio || 1;
  const cachedCanvas = pageCanvasCacheRef.current.get(pageNumber);
  if (!cachedCanvas) {
    // always set the cache
    renderCanvas(
      pdfDoc!,
      pageNumber,
      viewport,
      outputScale,
      setRerenderFlag,
      pageCanvasCacheRef,
    )
      .then((canvasElement: HTMLCanvasElement) => {
        if (canvasElement && isPageVisible) {
          drawPageSection(
            canvasElement,
            pageData,
            visibleStart,
            visibleEnd,
            ctx,
            outputScale,
          );
        }
        return null;
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

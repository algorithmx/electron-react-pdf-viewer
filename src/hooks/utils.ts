import React from 'react';
import * as pdfjsLib from 'pdfjs-dist';

interface PageData {
  viewport: pdfjsLib.PageViewport;
  yOffset: number;
}

/**
 * Calculates the range of pages to cache based on the visible region.
 *
 * @param x - Array of objects containing each page's viewport and y-offset.
 * @param N - Total number of pages.
 * @param visibleStart - The beginning y-coordinate (in PDF CSS pixels) of the visible area.
 * @param visibleEnd - The ending y-coordinate (in PDF CSS pixels) of the visible area.
 * @param Q - The number of pages to extend caching beyond the visible range (default is 3).
 * @returns A tuple [cacheStart, cacheEnd] indicating the indices of the first and last pages to cache.
 */
function calculateStartEnd(
  x: Array<PageData>,
  N: number,
  dh: number,
  H: number,
  Q: number = 3,
) {
  const visibleStart = dh;
  const visibleEnd = dh + H;
  // Initialize with extreme values so that any valid page discovers new bounds.
  let firstVisibleIndex = Number.POSITIVE_INFINITY;
  let lastVisibleIndex = Number.NEGATIVE_INFINITY;

  // Loop to find the first visible page.
  for (let i = 0; i < x.length; i += 1) {
    const { viewport, yOffset } = x[i];
    // Calculate the bottom edge of the page.
    const pageBottom = yOffset + viewport.height;
    // If any part of the page falls in the visible region, mark its index.
    if (pageBottom >= visibleStart && yOffset <= visibleEnd) {
      firstVisibleIndex = i;
      break; // Found the first visible page, no need to continue.
    }
  }

  // Loop in reverse to find the last visible page.
  for (let i = x.length - 1; i >= 0; i -= 1) {
    const { viewport, yOffset } = x[i];
    const pageBottom = yOffset + viewport.height;
    // If this page overlaps with the visible area, mark its index.
    if (pageBottom >= visibleStart && yOffset <= visibleEnd) {
      lastVisibleIndex = i;
      break; // Found the last visible page, exit loop.
    }
  }

  // In case no pages overlap the visible area, default to the first page.
  if (firstVisibleIndex === Number.POSITIVE_INFINITY) {
    firstVisibleIndex = 0;
    lastVisibleIndex = 0;
  }

  // Extend the index range by Q pages on either side, clamping to document limits.
  const cacheStart = Math.max(0, firstVisibleIndex - Q);
  const cacheEnd = Math.min(N - 1, lastVisibleIndex + Q);
  return [visibleStart, visibleEnd, cacheStart, cacheEnd];
}

/**
 * Draws a designated section of a rendered page onto a given canvas context.
 *
 * This function clips the source image (from an offscreen canvas) to the region
 * that overlaps with the visible area, and then draws that section on the onscreen canvas.
 *
 * @param canvasElement - The source offscreen canvas containing the rendered PDF page.
 * @param pageData - An object containing the page's viewport and its y-offset.
 * @param visibleStart - The top boundary of the visible area (in PDF CSS pixels).
 * @param visibleEnd - The bottom boundary of the visible area (in PDF CSS pixels).
 * @param ctx - The canvas rendering context where the page section is drawn.
 * @param outputScale - Scale factor for rendering (typically window.devicePixelRatio).
 */
function drawPageSection(
  canvasElement: HTMLCanvasElement,
  pageData: { viewport: pdfjsLib.PageViewport; yOffset: number },
  visibleStart: number,
  visibleEnd: number,
  ctx: CanvasRenderingContext2D,
  outputScale: number,
) {
  const { viewport, yOffset } = pageData;
  // Calculate the top and bottom boundaries of the page.
  const pageTop = yOffset;
  const pageBottom = pageTop + viewport.height;
  // Determine the visible portion within the page boundaries.
  const clipTop = Math.max(pageTop, visibleStart);
  const clipBottom = Math.min(pageBottom, visibleEnd);
  // Calculate the source Y coordinate in the canvas (adjusted for output scale).
  const srcY = (clipTop - pageTop) * outputScale;
  // Calculate the height of the clipped region in the source canvas.
  const srcHeight = (clipBottom - clipTop) * outputScale;
  // The destination Y coordinate on the onscreen canvas.
  const destY = clipTop - visibleStart;
  // Draw the clipped region from the offscreen canvas to the onscreen canvas.
  ctx.drawImage(
    canvasElement,
    0, // Source X: start at left edge.
    srcY, // Source Y: computed from clip.
    canvasElement.width, // Source width: full canvas width.
    srcHeight, // Source height: clipped height.
    0, // Destination X: start at left of display canvas.
    destY, // Destination Y: adjust for visible region.
    canvasElement.width / outputScale, // Destination width (scaled down).
    srcHeight / outputScale, // Destination height (scaled down).
  );
}

/**
 * Sets up a canvas element with the given width, height, and scale.
 *
 * This function sets the intrinsic width and height of the canvas to the
 * product of the given width and height with the scale factor.
 *
 * @param c - The HTMLCanvasElement to configure.
 * @param W - The width of the canvas.
 * @param H - The height of the canvas.
 * @param X - The scale factor.
 * @returns The configured HTMLCanvasElement.
 */
function setUpCanvasElement(
  c: HTMLCanvasElement,
  W: number,
  H: number,
  X: number,
) {
  // Set the intrinsic width and height multiplied by the scale.
  c.width = Math.floor(W * X);
  c.height = Math.floor(H * X);
  // Set the CSS dimensions to the unscaled size.
  c.style.width = `${Math.floor(W)}px`;
  c.style.height = `${Math.floor(H)}px`;
  return c;
}

/**
 * Creates a new canvas element that is configured based on the provided viewport and scale.
 *
 * The function sets both the intrinsic canvas dimensions (used for rendering)
 * and its CSS dimensions.
 *
 * @param viewport - The PDF page viewport containing the dimensions.
 * @param outputScale - Scale factor for rendering (typically window.devicePixelRatio).
 * @returns HTMLCanvasElement configured for rendering a PDF page.
 */
function createCanvasElement(
  viewport: pdfjsLib.PageViewport,
  outputScale: number,
) {
  // Create a new canvas element.
  const canvas = document.createElement('canvas');
  return setUpCanvasElement(
    canvas,
    viewport.width,
    viewport.height,
    outputScale,
  );
}

/**
 *
 * @param pdfDoc - The PDFDocumentProxy object representing the loaded PDF.
 * @param pageNumber - The page number (1-indexed) to render.
 * @param viewport - The viewport for the page determining its dimensions.
 * @param outputScale - Scale factor for rendering (typically window.devicePixelRatio).
 * @param pageCanvasCacheRef - A mutable ref to a cache mapping page numbers to rendered canvases.
 * @returns A Promise resolving to the rendered HTMLCanvasElement.
 */
function renderCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  viewport: pdfjsLib.PageViewport,
  outputScale: number,
  pageCanvasCacheRef: React.MutableRefObject<Map<number, HTMLCanvasElement>>,
): Promise<HTMLCanvasElement> {
  // Create an offscreen canvas element for rendering the PDF page.
  const canvasElement = createCanvasElement(viewport, outputScale);
  return pdfDoc!
    .getPage(pageNumber)
    .then((page) => {
      // Ensure the canvas element is available.
      if (!canvasElement) {
        throw new Error('No render canvas available');
      }
      // Get the 2D rendering context from the canvas.
      const renderCtx = canvasElement.getContext('2d');
      if (!renderCtx) {
        throw new Error('No canvas context available');
      }
      // Set up the transformation matrix to account for the output scale.
      renderCtx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      // Render the PDF page into the canvas.
      return page.render({ canvasContext: renderCtx, viewport });
    })
    .then(() => {
      // eslint-disable-next-line no-console
      console.log(
        `%c[RENDER] Rendered page ${pageNumber}`,
        'color: #ff0; background-color: #fff; padding: 2px 4px; border-radius: 4px;',
      );
      // Cache the rendered canvas for later reuse.
      pageCanvasCacheRef.current.set(pageNumber, canvasElement);
      return canvasElement;
    })
    .catch((error) => {
      // Log rendering errors and still return the canvas element.
      // eslint-disable-next-line no-console
      console.error('Error rendering canvas:', error);
      return canvasElement;
    });
}

/**
 * Creates a div element to serve as the container for rendering text layers.
 *
 * The div is absolutely positioned based on the page's y-offset
 * and sized according to the viewport dimensions.
 *
 * @param pageData - An object containing the page's viewport and its y-offset.
 * @returns An HTMLDivElement styled for the text layer.
 */
function createTextLayerDiv(pageData: {
  viewport: pdfjsLib.PageViewport;
  yOffset: number;
}) {
  // Create a container div for the text layer.
  const textDiv = document.createElement('div');
  // Set position to absolute so it overlays the corresponding page.
  textDiv.style.position = 'absolute';
  textDiv.style.left = '0px';
  // Add CSS class for text styling.
  textDiv.className = 'textLayer';
  // Position the div at the correct vertical offset.
  textDiv.style.top = `${pageData.yOffset}px`;
  // Set the div's width and height based on the page viewport size.
  textDiv.style.width = `${pageData.viewport.width}px`;
  textDiv.style.height = `${pageData.viewport.height}px`;
  return textDiv;
}

/**
 * Renders the text layer for a specific page.
 *
 * This function creates a container for the text layer, retrieves the text content
 * from the PDF page, instantiates a new TextLayer (from pdfjsLib), and renders it.
 * It returns the container div after rendering is complete.
 *
 * @param pageData - An object containing the page's viewport and its y-offset.
 * @param pdfDoc - The PDFDocumentProxy object representing the loaded PDF.
 * @param pageNumber - The page number (1-indexed) for which to render the text layer.
 * @returns A Promise resolving to the HTMLDivElement containing the text layer.
 */
function renderTextLayer(
  pageData: {
    viewport: pdfjsLib.PageViewport;
    yOffset: number;
  },
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
): Promise<HTMLDivElement> {
  // Create the container div where the text will be rendered.
  const textDiv = createTextLayerDiv(pageData);
  return pdfDoc!
    .getPage(pageNumber)
    .then((page) => {
      // Extract the text content from the page.
      return page.getTextContent();
    })
    .then((textContent) => {
      // Instantiate a new text layer with the retrieved content.
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textDiv,
        viewport: pageData.viewport,
      });
      // Render the text layer onto the container div.
      textLayer.render();
      return textDiv;
    })
    .catch((error) => {
      // Log errors if text layer rendering fails.
      // eslint-disable-next-line no-console
      console.error('Error rendering text layer for page', pageNumber, error);
      return textDiv;
    });
}

/**
 * Asynchronously gathers layout data for all PDF pages.
 *
 * For each page in the PDF, this function computes its viewport (scaled dimensions)
 * and calculates its cumulative vertical offset (y-offset) within the overall PDF layout.
 *
 * @param pdfDoc - The PDFDocumentProxy object representing the loaded PDF.
 * @param scale - The scale factor to apply to each page's dimensions.
 * @returns A Promise resolving to an object containing:
 *    - pagesDataLocal: Array of objects with each page's viewport and y-offset.
 *    - totalHeightLocal: The total height (in PDF CSS pixels) of the document.
 */
async function getPagesDataArray(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  scale: number,
) {
  // Fetch all pages concurrently.
  const { numPages } = pdfDoc!;
  const pages = await Promise.all(
    Array.from({ length: numPages }, (_, i) => pdfDoc!.getPage(i + 1)),
  );
  // Use Array.reduce to compute cumulative y-offset and accumulate page data.
  const { pagesDataLocal, totalHeightLocal } = pages.reduce(
    (acc, page) => {
      const viewport = page.getViewport({ scale });
      acc.pagesDataLocal.push({ viewport, yOffset: acc.totalHeightLocal });
      acc.totalHeightLocal += viewport.height;
      return acc;
    },
    {
      pagesDataLocal: [] as Array<{
        viewport: pdfjsLib.PageViewport;
        yOffset: number;
      }>,
      totalHeightLocal: 0,
    },
  );
  return { pagesDataLocal, totalHeightLocal };
}

/**
 * Retrieves the widest page in the PDF document.
 *
 * This function calculates the widest page by iterating through all pages
 * and comparing their widths. It then returns the widest page.
 *
 * @param pdfDoc - The PDFDocumentProxy object representing the loaded PDF.
 * @returns A Promise resolving to the widest PDFPageProxy object.
 */
async function getWidestPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
): Promise<pdfjsLib.PDFPageProxy> {
  // Use the widest page to determine the base viewport.
  const { pagesDataLocal } = await getPagesDataArray(pdfDoc!, 1);
  const widestPageIndex = pagesDataLocal.reduce((maxIndex, page, index) => {
    return page.viewport.width > pagesDataLocal[maxIndex].viewport.width
      ? index
      : maxIndex;
  }, 0);
  return pdfDoc!
    .getPage(widestPageIndex + 1)
    .then((page) => {
      return page;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error getting widest page:', error);
      // return the first page
      return pdfDoc!.getPage(1);
    });
}

/**
 * Handles processing (rendering) of an individual page.
 *
 * Given page layout data and the visible region, this function determines whether
 * the page falls within a cacheable index range and whether it is visible.
 * If the page is not yet cached, it initiates asynchronous rendering and caching.
 * If the page is visible and already cached, it draws the specific visible section.
 * - Return: is cache hit
 *
 * @param pageData - An object containing the page's viewport and y-offset.
 * @param index - The zero-indexed page position in the pages array.
 * @param visibleStart - The top boundary (in PDF CSS pixels) of the visible area.
 * @param visibleEnd - The bottom boundary (in PDF CSS pixels) of the visible area.
 * @param cacheStart - The starting page index eligible for caching.
 * @param cacheEnd - The ending page index eligible for caching.
 * @param ctx - The canvas rendering context to draw on.
 * @param pdfDoc - The PDFDocumentProxy object representing the loaded PDF.
 * @param pageCanvasCacheRef - A mutable ref to a cache mapping page numbers to rendered canvases.
 * @param setRerenderFlag - React state dispatch function to force a re-render.
 * @param textLayerContainer - The container div for the text layer.
 * @param pageTextLayerCacheRef - A mutable ref to a cache mapping page numbers to text layer containers.
 */
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
  textLayerContainer: HTMLDivElement,
  pageTextLayerCacheRef: React.MutableRefObject<Map<number, HTMLDivElement>>,
  pageRenderLockRef: React.MutableRefObject<Set<number>>,
): boolean {
  // Skip processing if the page is outside the caching window.
  if (index < cacheStart || index > cacheEnd) return false;
  const pageNumber = index + 1;
  const { viewport, yOffset } = pageData;
  // Determine the bottom edge of the page.
  const pageBottom = yOffset + viewport.height;
  // Check if the page is within the visible area.
  const isPageVisible = pageBottom >= visibleStart && yOffset <= visibleEnd;
  const outputScale = window.devicePixelRatio || 1;
  let cacheHit = false;

  // Always acquire the lock at the start of the critical section.
  pageRenderLockRef.current.add(pageNumber);

  // Array to track asynchronous tasks in the critical section.
  const asyncTasks: Promise<any>[] = [];

  // --- Canvas Rendering ---
  const cachedCanvas = pageCanvasCacheRef.current.get(pageNumber);
  // const cachedTextLayer = pageTextLayerCacheRef.current.get(pageNumber);
  if (cachedCanvas) {
    // eslint-disable-next-line no-console
    console.log(
      `%c[CACHE] cache hit: ${pageNumber}`,
      'color: #0f0; background-color: #000; padding: 2px 4px; border-radius: 4px;',
    );
    cacheHit = true;
    if (isPageVisible) {
      drawPageSection(
        cachedCanvas,
        pageData,
        visibleStart,
        visibleEnd,
        ctx,
        outputScale,
      );
    }
  } else {
    // Render the canvas asynchronously and add the promise to asyncTasks.
    const canvasTask = renderCanvas(
      pdfDoc,
      pageNumber,
      viewport,
      outputScale,
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
    asyncTasks.push(canvasTask);
  }

  // --- Text Layer Rendering ---
  // if (isPageVisible) {
  //   if (pageTextLayerCacheRef.current.has(pageNumber)) {
  //     textLayerContainer.appendChild(
  //       pageTextLayerCacheRef.current.get(pageNumber)!,
  //     );
  //   } else {
  //     // Render the text layer asynchronously and add the promise to asyncTasks.
  //     const textTask = renderTextLayer(
  //       { viewport, yOffset },
  //       pdfDoc,
  //       pageNumber,
  //     )
  //       .then((textDiv: HTMLDivElement) => {
  //         textLayerContainer.appendChild(textDiv);
  //         pageTextLayerCacheRef.current.set(pageNumber, textDiv);
  //         // eslint-disable-next-line no-console
  //         console.log('[RENDER] Caching text layer for page', pageNumber);
  //         return null;
  //       })
  //       .catch((error) => {
  //         // eslint-disable-next-line no-console
  //         console.error(
  //           'Error rendering text layer for page',
  //           pageNumber,
  //           error,
  //         );
  //       });
  //     asyncTasks.push(textTask);
  //   }
  // }

  // Release the render lock only after all queued asynchronous tasks complete.
  if (asyncTasks.length > 0) {
    // eslint-disable-next-line no-void
    void Promise.all(asyncTasks)
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Error rendering page', pageNumber, error);
      })
      .finally(() => {
        pageRenderLockRef.current.delete(pageNumber);
        // eslint-disable-next-line no-console
        console.log(
          `%c[RELEASE] Released render lock for page ${pageNumber}`,
          'color: #f00; background-color: #000; padding: 2px 4px; border-radius: 4px;',
        );
      });
  } else {
    pageRenderLockRef.current.delete(pageNumber);
  }
  return cacheHit;
}

export {
  calculateStartEnd,
  drawPageSection,
  createCanvasElement,
  createTextLayerDiv,
  getPagesDataArray,
  processPage,
  getWidestPage,
  PageData,
  setUpCanvasElement,
};

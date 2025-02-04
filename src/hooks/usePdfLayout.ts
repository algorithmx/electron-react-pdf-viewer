import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { getPagesDataArray, getWidestPage, PageData } from './utils';

interface UsePdfLayoutProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  containerWidth: number;
  setTotalHeight: (height: number) => void;
  scaleRef: React.MutableRefObject<number | undefined>;
}

/**
 * Computes the layout for the PDF document:
 * - Determines the scale based on the widest page.
 * - Computes each page's viewport and cumulative y-offset.
 * - Returns an array of objects, each containing a page's viewport and y-offset.
 *
 * @param pdfDoc - The PDF document to compute the layout for.
 * @param containerWidth - The width of the container.
 * @param setTotalHeight - A function to set the total height of the PDF.
 * @param scaleRef - A ref to store the scale factor.
 * @returns An array of objects, each containing a page's viewport and y-offset.
 */
function usePdfLayout({
  pdfDoc,
  containerWidth,
  setTotalHeight,
  scaleRef,
}: UsePdfLayoutProps): PageData[] {
  const [pagesData, setPagesData] = useState<PageData[]>([]);

  useEffect(() => {
    let isCancelled = false;
    if (!pdfDoc) {
      setPagesData([]);
      return;
    }
    async function computeLayout() {
      try {
        const widestPage = await getWidestPage(pdfDoc!);
        if (isCancelled) return;
        const baseViewport = widestPage.getViewport({ scale: 1 });
        const scale = containerWidth / baseViewport.width;
        scaleRef.current = scale;
        const { pagesDataLocal, totalHeightLocal } = await getPagesDataArray(
          pdfDoc!,
          scale,
        );
        if (isCancelled) return;
        setTotalHeight(totalHeightLocal);
        setPagesData(pagesDataLocal);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error computing PDF layout:', error);
      }
    }
    computeLayout();
    // eslint-disable-next-line consistent-return
    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, containerWidth, setTotalHeight, scaleRef]);

  return pagesData;
}

export default usePdfLayout;

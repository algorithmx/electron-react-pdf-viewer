import React, { useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

interface UsePdfRendererProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  pageNumber: number;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  scaleRef: React.MutableRefObject<number | undefined>;
}

export default function usePdfRenderer({
  pdfDoc,
  pageNumber,
  canvasRef,
  scaleRef,
}: UsePdfRendererProps): void {
  useEffect(() => {
    if (!pdfDoc) return;
    async function renderPage() {
      const page = await pdfDoc!.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const baseViewport = page.getViewport({ scale: 1 });
      // Compute scale if not set
      if (scaleRef.current === undefined) {
        const containerWidth =
          canvas.parentElement?.clientWidth || baseViewport.width;
        scaleRef.current = containerWidth / baseViewport.width;
      }
      const scale = scaleRef.current;
      const viewport = page.getViewport({ scale });
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      page.render({
        canvasContext: context,
        viewport,
        transform:
          outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : undefined,
      });
    }
    renderPage();
  }, [pdfDoc, pageNumber, canvasRef, scaleRef]);
}

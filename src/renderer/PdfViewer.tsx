import React, { useRef, useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';

// Set the workerSrc to use the PDF.js worker bundled with the library.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

type PdfViewerProps = {
  file: string;
};

function PdfViewer({ file }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef<number>(); // Persist the scale across pages
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    setPdfDoc(null);
    scaleRef.current = undefined; // Reset scale when file changes
    pdfjsLib
      .getDocument(file)
      .promise.then((pdf) => {
        setPdfDoc(pdf);
        setPageCount(pdf.numPages);
        return null;
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Error loading PDF:', error);
        return null;
      });
  }, [file]);

  useEffect(() => {
    if (!pdfDoc) return;
    async function renderPage() {
      const page = await pdfDoc!.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      // Compute the base viewport at scale 1.
      const baseViewport = page.getViewport({ scale: 1 });
      // If scale has not been computed yet, compute it based on container width.
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

      // Add transform for rendering to account for devicePixelRatio.
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
  }, [pdfDoc, pageNumber]);

  return (
    <div>
      <button
        onClick={() => setPageNumber(pageNumber + 1)}
        type="button"
        disabled={pageNumber >= pageCount}
      >
        Next
      </button>
      <button
        onClick={() => setPageNumber(pageNumber - 1)}
        type="button"
        disabled={pageNumber <= 1}
      >
        Previous
      </button>
      <canvas ref={canvasRef} />
    </div>
  );
}

export default PdfViewer;

import React, { ChangeEvent, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';

function Viewer({
  pdfDoc,
  pageNumber,
  pageCount,
  canvasRef,
  scaleRef,
  setPageNumber,
  setFile,
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  pageNumber: number;
  pageCount: number;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  scaleRef: React.MutableRefObject<number | undefined>;
  setPageNumber: (pageNumber: number) => void;
  setFile: (file: string) => void;
}): React.ReactNode {
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    if (event?.target?.files?.length) {
      const url = URL.createObjectURL(event.target.files[0]);
      setFile(url);
    }
  };

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
  }, [pdfDoc, canvasRef, pageNumber, scaleRef]);

  return (
    <>
      <div className="tool-button-container">
        <input
          className="file-input"
          style={{ width: '20%' }}
          type="file"
          accept="application/pdf"
          onChange={handleFile}
        />
        <button
          onClick={() => setPageNumber(pageNumber - 1)}
          type="button"
          style={{ width: '10%' }}
          disabled={pageNumber <= 1}
        >
          {'<<'}
        </button>
        <button
          onClick={() => setPageNumber(pageNumber + 1)}
          type="button"
          style={{ width: '10%' }}
          disabled={pageNumber >= pageCount}
        >
          {'>>'}
        </button>
      </div>
      <div className="pdf-viewer-container">
        {pdfDoc ? (
          <canvas ref={canvasRef} />
        ) : (
          <div className="canvas-placeholder">No PDF Loaded</div>
        )}
      </div>
    </>
  );
}

export default Viewer;

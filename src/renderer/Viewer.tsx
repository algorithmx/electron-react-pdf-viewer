import React from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import FileSelector from './FileSelector';
import PaginationControls from './PaginationControls';
import usePdfRenderer from '../hooks/usePdfRenderer';

interface ViewerProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  pageNumber: number;
  pageCount: number;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  scaleRef: React.MutableRefObject<number | undefined>;
  setPageNumber: (page: number) => void;
  setFile: (file: string) => void;
}

function Viewer({
  pdfDoc,
  pageNumber,
  pageCount,
  canvasRef,
  scaleRef,
  setPageNumber,
  setFile,
}: ViewerProps): React.ReactNode {
  // Use the custom hook to render the PDF page
  usePdfRenderer({ pdfDoc, pageNumber, canvasRef, scaleRef });

  return (
    <>
      <div className="tool-button-container">
        <FileSelector onFileSelected={setFile} />
        <PaginationControls
          pageNumber={pageNumber}
          pageCount={pageCount}
          onPrevious={() => setPageNumber(pageNumber - 1)}
          onNext={() => setPageNumber(pageNumber + 1)}
        />
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

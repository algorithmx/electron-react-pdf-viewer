import React, { useState, useRef, useLayoutEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import FileSelector from './FileSelector';
import useContinuousPdfRenderer from '../hooks/useContinuousPdfRenderer';
import DebouncedSlider from '../components/DebouncedSlider';

interface ViewerProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  scaleRef: React.MutableRefObject<number | undefined>;
  setFile: (file: string) => void;
}

function Viewer({ pdfDoc, scaleRef, setFile }: ViewerProps): React.ReactNode {
  const [totalHeight, setTotalHeight] = useState<number>(0);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useContinuousPdfRenderer({
    pdfDoc,
    containerRef,
    canvasRef,
    scaleRef,
    scrollOffset,
    visibleHeight: dimensions.height,
    setTotalHeight,
  });

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element) {
      const { clientWidth, clientHeight } = element;
      setDimensions((prev) => {
        if (prev.width !== clientWidth || prev.height !== clientHeight) {
          return { width: clientWidth, height: clientHeight };
        }
        return prev;
      });
    }
  }, [containerRef]);

  const maxScroll =
    totalHeight - dimensions.height > 0
      ? Math.floor(totalHeight - dimensions.height)
      : 0;

  const handleWheel = (e: React.WheelEvent<HTMLElement>) => {
    if (e.deltaY > 0) {
      setScrollOffset(Math.min(scrollOffset + e.deltaY, maxScroll));
    } else {
      setScrollOffset(Math.max(scrollOffset + e.deltaY, 0));
    }
  };

  // eslint-disable-next-line no-console
  console.log('[Viewer] scrollOffset', scrollOffset);

  return (
    <>
      <div className="tool-button-container">
        <FileSelector onFileSelected={setFile} />
      </div>
      <div className="pdf-viewer-container continuous-viewer">
        <div className="canvas-container" ref={containerRef}>
          {pdfDoc ? (
            <canvas ref={canvasRef} onWheel={handleWheel} />
          ) : (
            <div className="canvas-placeholder">No PDF Loaded</div>
          )}
        </div>
        <DebouncedSlider
          value={scrollOffset}
          min={0}
          max={maxScroll}
          onChangeFinal={setScrollOffset}
          onMouseWheelScroll={handleWheel}
        />
      </div>
    </>
  );
}

export default Viewer;

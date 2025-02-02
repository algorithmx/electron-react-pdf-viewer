import React, { useState, useRef, useLayoutEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import useContinuousPdfRenderer from '../hooks/useContinuousPdfRenderer';
import DebouncedSlider from '../components/DebouncedSlider';

interface ViewerProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  scaleRef: React.MutableRefObject<number | undefined>;
}

function Viewer({ pdfDoc, scaleRef }: ViewerProps): React.ReactNode {
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
    containerWidth: dimensions.width,
    setTotalHeight,
  });

  useLayoutEffect(() => {
    const updateDimensions = () => {
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
    };

    updateDimensions(); // initial measurement
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
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

  // --- New: Rectangle selection state and event handlers ---
  const [selecting, setSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const handleMouseDown = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setStartPos({ x, y });
    setSelectionRect({ x, y, width: 0, height: 0 });
    setSelecting(true);
  };

  const handleMouseMove = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => {
    if (!selecting || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const currX = clientX - rect.left;
    const currY = clientY - rect.top;
    const x = Math.min(startPos.x, currX);
    const y = Math.min(startPos.y, currY);
    const width = Math.abs(currX - startPos.x);
    const height = Math.abs(currY - startPos.y);
    setSelectionRect({ x, y, width, height });
  };

  const handleMouseUp = (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => {
    if (!selecting) return;
    setSelecting(false);
    // eslint-disable-next-line no-console
    console.log('Selected area:', selectionRect);
    setTimeout(
      () => setSelectionRect({ x: 0, y: 0, width: 0, height: 0 }),
      100,
    );
  };
  // ---------------------------------------------------------

  return (
    <div className="pdf-viewer-container continuous-viewer">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="canvas-container"
        ref={containerRef}
        role="region"
        aria-label="PDF viewer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        onWheel={handleWheel}
      >
        {pdfDoc ? (
          <canvas ref={canvasRef} />
        ) : (
          <div className="canvas-placeholder">No PDF Loaded</div>
        )}
        {selecting && (
          <div
            style={{
              position: 'absolute',
              left: selectionRect.x,
              top: selectionRect.y,
              width: selectionRect.width,
              height: selectionRect.height,
              border: '2px dashed blue',
              backgroundColor: 'rgba(0, 0, 255, 0.2)',
              pointerEvents: 'none',
            }}
          />
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
  );
}

export default Viewer;

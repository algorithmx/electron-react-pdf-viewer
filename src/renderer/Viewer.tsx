import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/legacy/web/pdf_viewer.css';
import useContinuousPdfRenderer from '../hooks/useContinuousPdfRenderer';
import DebouncedSlider from '../components/DebouncedSlider';

interface ViewerProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  scaleRef: React.MutableRefObject<number | undefined>;
  // Callback to transfer snapshot data URL to the parent.
  onSnapshot: (snapshotDataUrl: string) => void;
}

function Viewer({
  pdfDoc,
  scaleRef,
  onSnapshot = () => {},
}: ViewerProps): React.ReactNode {
  const [totalHeight, setTotalHeight] = useState<number>(0);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selecting, setSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  // Reset scroll offset when a new PDF is loaded
  useEffect(() => {
    setScrollOffset(0);
  }, [pdfDoc]);

  useContinuousPdfRenderer({
    pdfDoc,
    containerRef,
    canvasRef,
    scaleRef,
    scrollOffset,
    visibleHeight: dimensions.height,
    containerWidth: dimensions.width,
    setTotalHeight,
    textLayerRef,
    maxPagesKept: 5,
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

  // --- Rectangle selection state and event handlers ---
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only proceed if Ctrl key is held down.
    if (!e.ctrlKey) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { clientX, clientY } = e;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setStartPos({ x, y });
    setSelectionRect({ x, y, width: 0, height: 0 });
    setSelecting(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // If Ctrl is released mid-drag, cancel the selection.
    if (!e.ctrlKey) {
      if (selecting) {
        setSelecting(false);
        setSelectionRect({ x: 0, y: 0, width: 0, height: 0 });
      }
      return;
    }
    if (!selecting || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { clientX, clientY } = e;
    const currX = clientX - rect.left;
    const currY = clientY - rect.top;
    const x = Math.min(startPos.x, currX);
    const y = Math.min(startPos.y, currY);
    const width = Math.abs(currX - startPos.x);
    const height = Math.abs(currY - startPos.y);
    setSelectionRect({ x, y, width, height });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only act on mouse up if Ctrl key is held.
    if (!e.ctrlKey) return;
    if (!selecting) return;
    setSelecting(false);

    // Take snapshot of selected area from canvas and transfer to right panel.
    if (
      selectionRect.width > 0 &&
      selectionRect.height > 0 &&
      canvasRef.current
    ) {
      const dpr = window.devicePixelRatio || 1;
      const { x, y, width, height } = selectionRect;
      const sourceCanvas = canvasRef.current;
      const snapshotCanvas = document.createElement('canvas');
      snapshotCanvas.width = width * dpr;
      snapshotCanvas.height = height * dpr;
      const snapshotCtx = snapshotCanvas.getContext('2d');
      if (snapshotCtx) {
        snapshotCtx.drawImage(
          sourceCanvas,
          x * dpr,
          y * dpr,
          width * dpr,
          height * dpr,
          0,
          0,
          width * dpr,
          height * dpr,
        );
        const dataUrl = snapshotCanvas.toDataURL();
        if (onSnapshot) {
          onSnapshot(dataUrl);
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log('Selected area:', selectionRect);
    setTimeout(
      () => setSelectionRect({ x: 0, y: 0, width: 0, height: 0 }),
      100,
    );
  };
  // --- End of rectangle selection state and event handlers ---

  return (
    <div className="pdf-viewer-container continuous-viewer">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="canvas-container"
        ref={containerRef}
        role="region"
        aria-label="PDF viewer"
        style={{ position: 'relative' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {pdfDoc ? (
          <>
            <canvas ref={canvasRef} />
            <div
              ref={textLayerRef}
              className="pdf-text-layer"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'all',
                userSelect: 'text',
              }}
            />
          </>
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
              pointerEvents: 'all',
              userSelect: 'text',
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

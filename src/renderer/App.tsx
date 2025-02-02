import React, { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Viewer from './Viewer';
import 'pdfjs-dist/web/pdf_viewer.css';
import './App.css';

// Set the workerSrc to use the PDF.js worker bundled with the library.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

function App() {
  const [file, setFile] = useState<string | undefined>();
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const scaleRef = useRef<number>(); // Persist the scale across pages

  useEffect(() => {
    const onOpenFile = (...args: unknown[]) => {
      const filePath = args[0] as string;
      setFile(filePath);
    };
    const removeListener = window.electron.ipcRenderer.on(
      'open-file',
      onOpenFile,
    );
    return () => {
      removeListener();
    };
  }, []);

  // Load PDF document when file changes.
  useEffect(() => {
    if (!file) return;
    setPdfDoc(null);
    scaleRef.current = undefined; // Reset scale when file changes

    pdfjsLib
      .getDocument(file)
      .promise.then((pdf) => {
        setPdfDoc(pdf);
        if (pdf) {
          // eslint-disable-next-line no-console
          console.log('PDF loaded.');
        }
        return null;
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Error loading PDF:', error);
        return null;
      });
  }, [file]);

  useEffect(() => {
    const onCloseFile = () => {
      setFile(undefined);
      setPdfDoc(null);
    };
    const removeListener = window.electron.ipcRenderer.on(
      'close-file',
      onCloseFile,
    );
    return () => {
      removeListener();
    };
  }, []);

  return (
    <div className="app-container">
      <div className="left-panel">
        <Viewer pdfDoc={pdfDoc} scaleRef={scaleRef} />
      </div>
      <div className="right-panel">
        <div>
          <h1>PDF Util</h1>
        </div>
      </div>
    </div>
  );
}

export default App;

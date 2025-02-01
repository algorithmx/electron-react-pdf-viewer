import React, { ChangeEvent, useState } from 'react';
import './App.css';
import PdfViewer from './PdfViewer';

function App() {
  const [file, setFile] = useState<string | undefined>();

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    if (event?.target?.files?.length) {
      // eslint-disable-next-line no-console
      console.log(event.target.files[0]);
      const url = URL.createObjectURL(event.target.files[0]);
      // eslint-disable-next-line no-console
      console.log('url', url);
      setFile(url);
    }
  };

  return (
    <div>
      <div className="file-container">
        <div>
          <input
            className="file-input"
            type="file"
            accept="application/pdf"
            onChange={handleFile}
          />
        </div>
      </div>
      {file && <PdfViewer file={file} />}
    </div>
  );
}

export default App;

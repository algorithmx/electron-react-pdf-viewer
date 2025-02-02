import React, { ChangeEvent } from 'react';

interface FileSelectorProps {
  onFileSelected: (fileUrl: string) => void;
}

function FileSelector({ onFileSelected }: FileSelectorProps): React.ReactNode {
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    if (event?.target?.files?.length) {
      const url = URL.createObjectURL(event.target.files[0]);
      onFileSelected(url);
    }
  }

  return (
    <input
      type="file"
      accept="application/pdf"
      className="file-input"
      onChange={handleFile}
      style={{ width: '20%' }}
    />
  );
}

export default FileSelector;

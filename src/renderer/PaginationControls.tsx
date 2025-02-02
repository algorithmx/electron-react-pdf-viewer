import React from 'react';

interface PaginationControlsProps {
  pageNumber: number;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
}

function PaginationControls({
  pageNumber,
  pageCount,
  onPrevious,
  onNext,
}: PaginationControlsProps): React.ReactNode {
  return (
    <>
      <button
        onClick={onPrevious}
        type="button"
        style={{ width: '10%' }}
        disabled={pageNumber <= 1}
      >
        {'<<'}
      </button>
      <button
        onClick={onNext}
        type="button"
        style={{ width: '10%' }}
        disabled={pageNumber >= pageCount}
      >
        {'>>'}
      </button>
    </>
  );
}

export default PaginationControls;

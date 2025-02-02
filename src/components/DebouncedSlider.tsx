import React, { useState, ChangeEvent } from 'react';

interface DebouncedSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChangeFinal: (newValue: number) => void;
}

function DebouncedSlider({
  value,
  min,
  max,
  step,
  onChangeFinal,
}: DebouncedSliderProps) {
  const sliderStep = step ?? 1;
  const [tempValue, setTempValue] = useState<number>(value);
  const [dragging, setDragging] = useState<boolean>(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTempValue(Math.floor(Number(e.target.value)));
  };

  const handleDragStart = () => {
    setDragging(true);
  };

  const handleDragEnd = () => {
    if (dragging) {
      setDragging(false);
      // eslint-disable-next-line no-console
      console.log('dragging', tempValue);
      onChangeFinal(tempValue);
    }
  };

  const handleBlur = () => {
    if (dragging) {
      setDragging(false);
      onChangeFinal(tempValue);
    }
  };

  // eslint-disable-next-line no-console
  console.log('[DebouncedSlider] tempValue: ', tempValue);

  return (
    <input
      type="range"
      className="pagination-slider"
      value={tempValue}
      min={min}
      max={max}
      step={sliderStep}
      onChange={handleChange}
      onMouseDown={handleDragStart}
      onMouseUp={handleDragEnd}
      onTouchStart={handleDragStart}
      onTouchEnd={handleDragEnd}
      onBlur={handleBlur}
    />
  );
}

// Add defaultProps for optional props.
DebouncedSlider.defaultProps = {
  step: 1,
};

export default DebouncedSlider;

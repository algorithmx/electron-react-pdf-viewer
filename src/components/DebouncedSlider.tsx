import React, { useState, useEffect, ChangeEvent } from 'react';

interface DebouncedSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChangeFinal: (newValue: number) => void;
  onMouseWheelScroll: (e: React.WheelEvent<HTMLInputElement>) => void;
}

function DebouncedSlider({
  value,
  min,
  max,
  step,
  onChangeFinal,
  onMouseWheelScroll,
}: DebouncedSliderProps) {
  const sliderStep = step ?? 1;
  const delta = 1;
  const [tempValue, setTempValue] = useState<number>(value);
  const [dragging, setDragging] = useState<boolean>(false);

  // Sync local state with updated value prop when not dragging.
  useEffect(() => {
    if (!dragging) {
      setTempValue(value);
    }
  }, [value, dragging]);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'PageUp') {
      setTempValue(Math.min(tempValue + delta, max));
      onChangeFinal(tempValue);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'PageDown') {
      setTempValue(Math.max(tempValue - delta, min));
      onChangeFinal(tempValue);
    }
  };

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
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onWheel={onMouseWheelScroll}
    />
  );
}

// Add defaultProps for optional props.
DebouncedSlider.defaultProps = {
  step: 1,
};

export default DebouncedSlider;

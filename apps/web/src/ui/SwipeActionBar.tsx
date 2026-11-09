import { useRef, useState } from "react";

type SwipeActionBarProps = {
  label: string;
  disabled?: boolean;
  onConfirm: () => void;
};

/** A deliberate left-to-right swipe confirmation for the single action valid in the current workflow state. */
export function SwipeActionBar({ label, disabled = false, onConfirm }: SwipeActionBarProps) {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const firedRef = useRef(false);

  const updateProgress = (next: number) => {
    const value = Math.max(0, Math.min(100, next));
    progressRef.current = value;
    setProgress(value);
  };
  const reset = () => {
    firedRef.current = false;
    updateProgress(0);
  };
  const complete = () => {
    if (disabled || firedRef.current) {
      reset();
      return;
    }
    if (progressRef.current >= 95) {
      firedRef.current = true;
      updateProgress(0);
      onConfirm();
    } else {
      reset();
    }
  };

  return (
    <div className={`swipe-action-bar${disabled ? " is-disabled" : ""}`}>
      <label className="swipe-action-label" htmlFor="driver-state-swipe">
        Swipe to <strong>{label}</strong>
      </label>
      <input
        id="driver-state-swipe"
        className="swipe-action-range"
        type="range"
        min="0"
        max="100"
        step="1"
        value={progress}
        disabled={disabled}
        aria-label={`Swipe to ${label}`}
        aria-valuetext={`${label}, ${progress}%`}
        onChange={(event) => updateProgress(Number(event.currentTarget.value))}
        onPointerUp={complete}
        onPointerCancel={reset}
        onKeyUp={complete}
        onBlur={reset}
      />
      <span className="swipe-action-hint">Drag the handle fully to the right</span>
    </div>
  );
}

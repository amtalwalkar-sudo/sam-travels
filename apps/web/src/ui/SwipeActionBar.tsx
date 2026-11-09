import { useRef, useState, type PointerEvent } from "react";

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
  const pointerStartXRef = useRef<number | null>(null);
  const draggedRef = useRef(false);

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

  const completePointer = (event: PointerEvent<HTMLInputElement>) => {
    const didSwipe = draggedRef.current && pointerStartXRef.current !== null && event.clientX > pointerStartXRef.current && progressRef.current >= 95;
    pointerStartXRef.current = null;
    draggedRef.current = false;
    if (didSwipe) complete();
    else reset();
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
        onPointerDown={(event) => { firedRef.current = false; pointerStartXRef.current = event.clientX; draggedRef.current = false; }}
        onPointerMove={(event) => { if (pointerStartXRef.current !== null && event.clientX - pointerStartXRef.current >= 24) draggedRef.current = true; }}
        onKeyDown={() => { firedRef.current = false; }}
        onPointerUp={completePointer}
        onPointerCancel={() => { pointerStartXRef.current = null; draggedRef.current = false; reset(); }}
        onKeyUp={complete}
        onBlur={reset}
      />
      <span className="swipe-action-hint">Drag the handle fully to the right</span>
    </div>
  );
}

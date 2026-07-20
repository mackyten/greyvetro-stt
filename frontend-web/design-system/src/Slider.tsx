export interface SliderProps {
  /** Row label shown at the top-left. */
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Text shown at the top-right of the row; defaults to the numeric value (mono). */
  displayValue?: string;
  onChange?: (value: number) => void;
}

/**
 * A labeled range slider — the composer's voice-setting control (Stability,
 * Similarity, Style). The label row carries the current value in mono on the
 * right; the track uses the brand accent color.
 * @category Forms
 */
export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.05,
  displayValue,
  onChange,
}: SliderProps) {
  return (
    <div className="slider-row">
      <div className="slider-head">
        <span>{label}</span>
        <span className="val">{displayValue ?? value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(e.target.valueAsNumber)}
      />
    </div>
  );
}

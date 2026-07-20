export interface SwitchProps {
  /** Label shown to the left of the toggle. */
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
}

/**
 * A labeled on/off toggle (`.switch-row` + `.switch`) — e.g. the composer's
 * "Speaker boost". The pill turns blue when on and the knob slides right.
 * @category Forms
 */
export function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <div className="switch-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch${checked ? ' on' : ''}`}
        onClick={() => onChange?.(!checked)}
      />
    </div>
  );
}

export interface TextFieldProps {
  /** Optional label rendered above the input. */
  label?: string;
  value?: string;
  placeholder?: string;
  /** Helper text shown below the input in muted grey. */
  hint?: string;
  onChange?: (value: string) => void;
}

/**
 * A single-line text input on the brand surface (`.text-field`), with an
 * optional label and helper hint. Used across modals (project name, preset
 * name).
 * @category Forms
 */
export function TextField({ label, value, placeholder, hint, onChange }: TextFieldProps) {
  const input = (
    <input
      className="text-field"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
  if (label) {
    return (
      <label className="field-label">
        {label}
        {input}
        {hint && <span className="field-hint">{hint}</span>}
      </label>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {input}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

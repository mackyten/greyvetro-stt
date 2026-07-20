export interface ColorSwatchProps {
  /** Display name of the token, e.g. "Baby blue". */
  name: string;
  /** Any CSS color or gradient value — a hex, `var(--token)`, or `linear-gradient(...)`. */
  value: string;
  /** Optional caption under the name (shown in mono), e.g. the hex or token name. */
  caption?: string;
}

/**
 * A single brand color/gradient swatch. Compose several to document the palette
 * (`--blue`, `--pink`, `--gradient`, surfaces, semantics).
 * @category Foundations
 */
export function ColorSwatch({ name, value, caption }: ColorSwatchProps) {
  return (
    <div style={{ width: 132 }}>
      <div
        style={{
          height: 72,
          borderRadius: 12,
          background: value,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)',
        }}
      />
      <div style={{ marginTop: 8, fontWeight: 700, fontSize: 12.5, color: 'var(--heading)' }}>
        {name}
      </div>
      {caption && (
        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
          {caption}
        </div>
      )}
    </div>
  );
}

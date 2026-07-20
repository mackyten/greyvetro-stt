import type { CSSProperties } from 'react';

const label: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: 'var(--muted)',
  marginBottom: 4,
};

export interface TypographyProps {
  /** Sample string rendered in the heading and body rows. */
  sample?: string;
}

/**
 * Type specimen for the brand type system: Manrope for UI (heading + body) and
 * JetBrains Mono for numbers/meta. Mirrors the font stack defined in styles.css.
 * @category Foundations
 */
export function Typography({ sample = 'Voiceover in your own words.' }: TypographyProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 440 }}>
      <div>
        <div style={label}>Heading · Manrope 800</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--heading)' }}>{sample}</div>
      </div>
      <div>
        <div style={label}>Body · Manrope 400</div>
        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{sample}</div>
      </div>
      <div>
        <div style={label}>Mono · JetBrains Mono</div>
        <div className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>
          0:12 / 1:04 · #8fd0e8 · 9,240 credits
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';

export interface ChipProps {
  children: ReactNode;
  /** Filled/selected state (used for filter toggles). */
  active?: boolean;
  /** Destructive styling (red text + border). */
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}

/**
 * A pill button used for filters, tags, and inline actions. `active` fills it
 * with the blue tint; `danger` turns it red. Also renders as a static tag when
 * given no handler.
 * @category Actions
 */
export function Chip({ children, active, danger, disabled, title, onClick }: ChipProps) {
  const cls = ['chip', active && 'active', danger && 'danger'].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={disabled} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

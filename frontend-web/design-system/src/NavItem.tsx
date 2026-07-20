import type { ReactNode } from 'react';

export interface NavItemProps {
  /** Leading icon/emoji. */
  icon?: ReactNode;
  label: string;
  /** Highlights the item as the current destination. */
  active?: boolean;
  onClick?: () => void;
}

/**
 * A sidebar navigation row. The `active` state gets the soft blue highlight and
 * darker text; hovering tints the surface.
 * @category Navigation
 */
export function NavItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

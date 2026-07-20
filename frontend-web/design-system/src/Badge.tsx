import type { ReactNode } from 'react';

export interface BadgeProps {
  children: ReactNode;
}

/**
 * A small uppercase pink pill used to flag items — e.g. "My voice" on a cloned
 * voice row.
 * @category Display
 */
export function Badge({ children }: BadgeProps) {
  return <span className="badge">{children}</span>;
}

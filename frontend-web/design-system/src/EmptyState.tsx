import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Large emoji/glyph shown above the title. */
  icon?: string;
  title: string;
  /** Supporting muted text under the title. */
  children?: ReactNode;
}

/**
 * A centered empty-state block — icon, heading, and a line of muted supporting
 * text — shown when a list or screen has no content yet.
 * @category Feedback
 */
export function EmptyState({ icon, title, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

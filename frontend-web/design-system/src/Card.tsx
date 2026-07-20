import type { ReactNode } from 'react';

export interface CardProps {
  /** Optional uppercase section heading rendered at the top of the card. */
  title?: string;
  children: ReactNode;
}

/**
 * The base surface container — rounded, bordered, soft-shadowed. Everything in
 * the app that groups content sits in a Card; an optional `title` renders the
 * muted uppercase section header.
 * @category Display
 */
export function Card({ title, children }: CardProps) {
  return (
    <div className="card">
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

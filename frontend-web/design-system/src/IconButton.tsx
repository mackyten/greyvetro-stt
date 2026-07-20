import type { ReactNode } from 'react';

export interface IconButtonProps {
  /** The glyph or icon to render (emoji, symbol, or SVG). */
  children: ReactNode;
  title?: string;
  onClick?: () => void;
}

/**
 * A compact square, borderless button for a single icon — used in modal headers
 * (close, refresh) and other tight controls.
 * @category Actions
 */
export function IconButton({ children, title, onClick }: IconButtonProps) {
  return (
    <button className="icon-btn" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

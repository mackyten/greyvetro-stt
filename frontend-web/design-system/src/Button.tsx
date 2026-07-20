import type { ReactNode } from 'react';

export interface ButtonProps {
  /** `primary` = full-width gradient CTA (`.generate-btn`); `secondary` = bordered action (`.download-btn`). */
  variant?: 'primary' | 'secondary';
  children: ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  onClick?: () => void;
}

/**
 * The brand button. `primary` is the gradient "Generate" call-to-action;
 * `secondary` is the bordered, surface button used for downloads and lesser
 * actions.
 * @category Actions
 */
export function Button({
  variant = 'primary',
  children,
  disabled,
  type = 'button',
  title,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={variant === 'primary' ? 'generate-btn' : 'download-btn'}
      disabled={disabled}
      type={type}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

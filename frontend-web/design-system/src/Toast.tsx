import type { ReactNode } from 'react';

export interface ToastProps {
  /** Tone — sets the icon and its color. */
  variant?: 'success' | 'error' | 'info';
  children: ReactNode;
}

/**
 * A snackbar/toast used for transient confirmations (bottom-center in the app,
 * auto-dismissing). This renders the static toast surface for a single message;
 * the live stack + timers live in the app's `ToastProvider`.
 * @category Feedback
 */
export function Toast({ variant = 'success', children }: ToastProps) {
  const icon = variant === 'success' ? '✓' : variant === 'error' ? '✕' : 'ℹ';
  return (
    <div className={`toast ${variant}`} role="status">
      <span className="toast-icon">{icon}</span>
      {children}
    </div>
  );
}

import type { ReactNode } from 'react';

export interface BannerProps {
  /** `error` = red; `warn` = amber. */
  variant?: 'error' | 'warn';
  children: ReactNode;
}

/**
 * An inline, persistent notice banner tied to context (e.g. a generation error
 * next to the Generate button). For transient confirmations use `Toast`
 * instead.
 * @category Feedback
 */
export function Banner({ variant = 'error', children }: BannerProps) {
  return <div className={variant === 'warn' ? 'warn-banner' : 'error-banner'}>{children}</div>;
}

export interface UsageCardProps {
  /** Plan/tier label appended to "Credits ·", e.g. "Free". */
  tier?: string;
  /** Credits consumed so far. */
  used: number;
  /** Total credit allowance. */
  limit: number;
}

/**
 * The credit meter shown in the sidebar footer: remaining credits over the
 * limit, with a gradient progress bar. Mirrors the app's `UsageCard`.
 * @category Display
 */
export function UsageCard({ tier, used, limit }: UsageCardProps) {
  const remaining = Math.max(0, limit - used);
  const usedFraction = limit === 0 ? 0 : Math.min(1, used / limit);
  return (
    <div className="usage-card">
      <div className="label">Credits{tier ? ` · ${tier}` : ''}</div>
      <div>
        <span className="count mono">{remaining.toLocaleString()}</span>{' '}
        <span className="of">of {limit.toLocaleString()} left</span>
      </div>
      <div className="usage-bar">
        <div style={{ width: `${usedFraction * 100}%` }} />
      </div>
    </div>
  );
}

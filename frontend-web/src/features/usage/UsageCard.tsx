import type { Usage } from '../../core/types';

export function UsageCard({ usage }: { usage: Usage | null }) {
  if (!usage) {
    return (
      <div className="usage-card">
        <div className="label">Credits</div>
        <div className="of">Loading…</div>
      </div>
    );
  }
  const remaining = Math.max(0, usage.characterLimit - usage.characterCount);
  const usedFraction =
    usage.characterLimit === 0
      ? 0
      : Math.min(1, usage.characterCount / usage.characterLimit);
  return (
    <div className="usage-card">
      <div className="label">Credits · {usage.tier}</div>
      <div>
        <span className="count mono">{remaining.toLocaleString()}</span>{' '}
        <span className="of">of {usage.characterLimit.toLocaleString()} left</span>
      </div>
      <div className="usage-bar">
        <div style={{ width: `${usedFraction * 100}%` }} />
      </div>
    </div>
  );
}

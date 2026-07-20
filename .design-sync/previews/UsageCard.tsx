import { UsageCard } from '@greyvetro/ui';

export function Free() {
  return (
    <div style={{ width: 190 }}>
      <UsageCard tier="Free" used={760} limit={10000} />
    </div>
  );
}

export function AlmostFull() {
  return (
    <div style={{ width: 190 }}>
      <UsageCard tier="Free" used={9240} limit={10000} />
    </div>
  );
}

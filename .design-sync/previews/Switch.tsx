import { useState } from 'react';
import { Switch } from '@greyvetro/ui';

export function On() {
  const [v, setV] = useState(true);
  return (
    <div style={{ width: 260 }}>
      <Switch label="Speaker boost" checked={v} onChange={setV} />
    </div>
  );
}

export function Off() {
  const [v, setV] = useState(false);
  return (
    <div style={{ width: 260 }}>
      <Switch label="Speaker boost" checked={v} onChange={setV} />
    </div>
  );
}

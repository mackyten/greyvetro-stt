import { useState } from 'react';
import { TextField } from '@greyvetro/ui';

export function WithLabel() {
  const [v, setV] = useState('Product launch');
  return (
    <div style={{ width: 320 }}>
      <TextField
        label="Project name"
        value={v}
        onChange={setV}
        hint="Shown in the gallery and on exports."
      />
    </div>
  );
}

export function Empty() {
  const [v, setV] = useState('');
  return (
    <div style={{ width: 320 }}>
      <TextField label="Preset name" value={v} placeholder="e.g. Energetic read" onChange={setV} />
    </div>
  );
}

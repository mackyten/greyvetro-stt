import { useState } from 'react';
import { SearchField } from '@greyvetro/ui';

export function WithQuery() {
  const [v, setV] = useState('narration');
  return (
    <div style={{ width: 320 }}>
      <SearchField value={v} onChange={setV} placeholder="Search voices…" />
    </div>
  );
}

export function Empty() {
  const [v, setV] = useState('');
  return (
    <div style={{ width: 320 }}>
      <SearchField value={v} onChange={setV} placeholder="Search voices…" />
    </div>
  );
}

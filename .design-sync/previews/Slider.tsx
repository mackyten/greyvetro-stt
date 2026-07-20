import { useState } from 'react';
import { Slider } from '@greyvetro/ui';

export function VoiceSettings() {
  const [stability, setStability] = useState(0.45);
  const [similarity, setSimilarity] = useState(0.75);
  const [style, setStyle] = useState(0.6);
  return (
    <div style={{ width: 280 }}>
      <Slider label="Stability" value={stability} onChange={setStability} />
      <Slider label="Similarity" value={similarity} onChange={setSimilarity} />
      <Slider label="Style" value={style} onChange={setStyle} />
    </div>
  );
}

export function Single() {
  const [v, setV] = useState(0.3);
  return (
    <div style={{ width: 280 }}>
      <Slider label="Stability" value={v} onChange={setV} />
    </div>
  );
}

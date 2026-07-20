import { VoiceRow } from '@greyvetro/ui';

export function Default() {
  return (
    <div style={{ maxWidth: 360 }}>
      <VoiceRow name="Aria" tagline="Warm · female · narration" />
    </div>
  );
}

export function Selected() {
  return (
    <div style={{ maxWidth: 360 }}>
      <VoiceRow name="Bennet" tagline="Deep · male · documentary" selected />
    </div>
  );
}

export function Cloned() {
  return (
    <div style={{ maxWidth: 360 }}>
      <VoiceRow name="My Studio Voice" tagline="Your cloned voice" badge="My voice" />
    </div>
  );
}

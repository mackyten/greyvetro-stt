import { Banner } from '@greyvetro/ui';

export function Error() {
  return (
    <div style={{ width: 360 }}>
      <Banner variant="error">Couldn't reach the voice service. Check your connection.</Banner>
    </div>
  );
}

export function Warn() {
  return (
    <div style={{ width: 360 }}>
      <Banner variant="warn">Voice cloning requires a paid ElevenLabs plan.</Banner>
    </div>
  );
}

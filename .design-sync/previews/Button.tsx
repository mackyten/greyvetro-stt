import { Button } from '@greyvetro/ui';

export function Primary() {
  return <Button variant="primary">Generate voiceover</Button>;
}

export function Secondary() {
  return <Button variant="secondary">⬇ Download MP3</Button>;
}

export function Disabled() {
  return (
    <Button variant="primary" disabled>
      Generate voiceover
    </Button>
  );
}

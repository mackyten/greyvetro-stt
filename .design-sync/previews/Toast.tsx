import { Toast } from '@greyvetro/ui';

export function Success() {
  return <Toast variant="success">Preset saved.</Toast>;
}

export function Error() {
  return <Toast variant="error">Generation failed — try again.</Toast>;
}

export function Info() {
  return <Toast variant="info">Transcribing audio…</Toast>;
}

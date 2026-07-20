import { Modal, SearchField, VoiceRow, Chip } from '@greyvetro/ui';

// The Modal overlay is `position: fixed`; a `transform` on the wrapper makes it
// the containing block, so the dimmed overlay + centered dialog render inside
// this sized box (and capture cleanly) instead of escaping to the viewport.
const stage = {
  position: 'relative' as const,
  transform: 'translateZ(0)',
  width: 620,
  height: 520,
  overflow: 'hidden' as const,
  borderRadius: 16,
};

export function VoicePicker() {
  return (
    <div style={stage}>
      <Modal title="Choose a voice" footer={<Chip>＋ Create my voice</Chip>} onClose={() => {}}>
        <SearchField placeholder="Search voices…" />
        <VoiceRow name="Aria" tagline="Warm · female · narration" selected />
        <VoiceRow name="Bennet" tagline="Deep · male · documentary" />
        <VoiceRow name="My Studio Voice" tagline="Your cloned voice" badge="My voice" />
      </Modal>
    </div>
  );
}

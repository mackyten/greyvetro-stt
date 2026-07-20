import { IconButton } from '@greyvetro/ui';

export function Actions() {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <IconButton title="Refresh">↻</IconButton>
      <IconButton title="Add">＋</IconButton>
      <IconButton title="Close">✕</IconButton>
    </div>
  );
}

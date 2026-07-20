import { NavItem } from '@greyvetro/ui';

export function Sidebar() {
  return (
    <div
      style={{
        width: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: 'var(--surface)',
        padding: 12,
        borderRadius: 12,
        border: '1px solid var(--border)',
      }}
    >
      <NavItem icon="🎙️" label="Studio" active />
      <NavItem icon="🗂️" label="Gallery" />
      <NavItem icon="🎬" label="Storyboard" />
      <NavItem icon="🎞️" label="Timeline" />
    </div>
  );
}

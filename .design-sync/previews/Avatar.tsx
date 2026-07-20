import { Avatar } from '@greyvetro/ui';

export function Single() {
  return <Avatar name="Aria" />;
}

export function Group() {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Avatar name="Aria" />
      <Avatar name="Bennet" />
      <Avatar name="Clara" />
      <Avatar initial="✦" />
    </div>
  );
}

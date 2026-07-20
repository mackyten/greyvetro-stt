import { Chip } from '@greyvetro/ui';

export function Default() {
  return <Chip>eleven_v3</Chip>;
}

export function Active() {
  return <Chip active>Female</Chip>;
}

export function Filters() {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Chip active>All</Chip>
      <Chip>Male</Chip>
      <Chip>Female</Chip>
    </div>
  );
}

export function Danger() {
  return <Chip danger>Delete preset</Chip>;
}

export function Disabled() {
  return <Chip disabled>Save as preset</Chip>;
}

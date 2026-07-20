import { ColorSwatch } from '@greyvetro/ui';

const row = { display: 'flex', gap: 16, flexWrap: 'wrap' as const };

export function Brand() {
  return (
    <div style={row}>
      <ColorSwatch name="Baby blue" value="#8fd0e8" caption="--blue" />
      <ColorSwatch name="Blue deep" value="#3e9ac4" caption="--blue-deep" />
      <ColorSwatch name="Baby pink" value="#fbcad4" caption="--pink" />
      <ColorSwatch name="Pink deep" value="#e58d9e" caption="--pink-deep" />
    </div>
  );
}

export function Gradients() {
  return (
    <div style={row}>
      <ColorSwatch name="Gradient" value="linear-gradient(135deg,#8fd0e8,#fbcad4)" caption="--gradient" />
      <ColorSwatch name="Gradient deep" value="linear-gradient(135deg,#3e9ac4,#e58d9e)" caption="--gradient-deep" />
    </div>
  );
}

export function Surfaces() {
  return (
    <div style={row}>
      <ColorSwatch name="Background" value="#eef1f5" caption="--bg" />
      <ColorSwatch name="Surface" value="#ffffff" caption="--surface" />
      <ColorSwatch name="Surface alt" value="#f4f5f7" caption="--surface-alt" />
      <ColorSwatch name="Border" value="#e1e6ec" caption="--border" />
    </div>
  );
}

export function Semantic() {
  return (
    <div style={row}>
      <ColorSwatch name="Success" value="#2fa96a" caption="--ok" />
      <ColorSwatch name="Warning" value="#f0c070" caption="--warn" />
      <ColorSwatch name="Error" value="#e0607a" caption="--error" />
    </div>
  );
}

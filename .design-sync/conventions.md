## Greyvetro Studio UI — how to build with these components

`@greyvetro/ui` is a small set of React primitives over the Greyvetro brand
stylesheet. Every component already carries its styling from `styles.css` (shipped
with this design system) — you compose components and use the brand **tokens** for
your own layout glue. There is **no utility-class framework** and **no provider to
wrap**: just import and render.

### Setup
- Components are styled by the global `styles.css` in this design system (brand
  tokens on `:root`, `@font-face` for Manrope + JetBrains Mono). No React context
  or ThemeProvider is required.
- Keep your content on the brand surface. The stylesheet sets
  `body { font-family: 'Manrope'; background: var(--bg); color: var(--text); }` —
  render inside that, or apply those three to your top-level container.
- **Dark mode**: set `data-theme="dark"` on the root element
  (`document.documentElement.dataset.theme = 'dark'`). Light is the default.

### Styling idiom — brand tokens (CSS variables)
Style your own layout with these `var(--*)` tokens from `styles.css`; do not
hard-code hexes. Real names:

| Group | Tokens |
|---|---|
| Surfaces | `--bg`, `--surface`, `--surface-alt`, `--border` |
| Accents | `--blue`, `--blue-deep`, `--pink`, `--pink-deep` |
| Gradients | `--gradient` (blue→pink), `--gradient-deep` |
| Text | `--heading`, `--text`, `--muted` |
| Semantic | `--ok`, `--warn`, `--error` |
| Elevation | `--shadow`, `--shadow-lift` |

Type: Manrope for UI; add `className="mono"` (JetBrains Mono) for numbers, time
codes, and meta. Corners are soft (10–20px radii), spacing is generous.

Controls are configured by **props, not class names**: `Button variant="primary"|"secondary"`,
`Chip active|danger|disabled`, `Toast`/`Banner variant`, `Switch checked`,
`Slider label/value`. Read each component's `.d.ts` + `.prompt.md` for its API.

### Where the truth lives
- `styles.css` (this design system) — the tokens and the visual language.
- `components/<group>/<Name>/<Name>.d.ts` + `.prompt.md` — each component's props
  and usage.

### Build snippet
```tsx
import { Card, Slider, Switch, Button } from '@greyvetro/ui';

function VoiceSettings() {
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 360 }}>
      <Card title="Voice settings">
        <Slider label="Stability" value={0.45} />
        <Slider label="Style" value={0.6} />
        <Switch label="Speaker boost" checked />
      </Card>
      <Button variant="primary">Generate voiceover</Button>
    </div>
  );
}
```

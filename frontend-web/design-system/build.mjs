// Build the @greyvetro/ui design-system package.
//
// The DS is a thin wrapper over the app's brand stylesheet, so this step keeps
// a *single source of truth*: it re-copies `frontend-web/src/styles.css` and the
// brand fonts into the package on every build (rewriting the absolute `/fonts/`
// @font-face URLs to package-relative `./fonts/` ones), then emits `dist/` +
// `.d.ts` via the app's own TypeScript. The copies are gitignored build
// artifacts — they can never drift from the app, because a build regenerates
// them. Run from anywhere: `node frontend-web/design-system/build.mjs`.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..'); // frontend-web/

// 1. Brand stylesheet → package styles.css (font URLs made package-relative).
const css = readFileSync(join(app, 'src/styles.css'), 'utf8').replace(
  /url\((['"]?)\/fonts\//g,
  'url($1./fonts/',
);
writeFileSync(join(here, 'styles.css'), css);

// 2. Brand fonts → package fonts/.
rmSync(join(here, 'fonts'), { recursive: true, force: true });
mkdirSync(join(here, 'fonts'), { recursive: true });
cpSync(join(app, 'public/fonts'), join(here, 'fonts'), { recursive: true });

// 3. Compile src/ → dist/ (+ declarations) with the app's TypeScript.
const tsc = join(app, 'node_modules/.bin/tsc');
const r = spawnSync(tsc, ['-p', join(here, 'tsconfig.json')], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.error('✓ @greyvetro/ui built → dist/');

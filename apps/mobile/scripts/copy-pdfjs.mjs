// Copie pdf.js (version figée dans package.json) dans public/pdfjs/ avant le build web. Le lecteur de PDF
// n'entre pas dans le bundle de l'app : il n'est chargé, depuis la même origine, qu'à l'import d'un CV.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('pdfjs-dist/package.json'));
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const out = join(here, '..', 'public', 'pdfjs');
mkdirSync(out, { recursive: true });

// Build « legacy » : polyfills compris, pour les navigateurs mobiles un peu anciens.
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) copyFileSync(join(pkgDir, 'legacy', 'build', name), join(out, name));

// Chargeur : un module de la même origine (autorisé par la CSP `script-src 'self'`) qui expose pdf.js à l'app.
writeFileSync(
  join(out, 'loader.mjs'),
  `// pdf.js ${version}, copié par scripts/copy-pdfjs.mjs.
import * as pdfjs from './pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;
globalThis.__sapiosPdfjs = pdfjs;
globalThis.dispatchEvent(new Event('sapios:pdfjs'));
`,
);
console.log(`pdf.js ${version} copié dans public/pdfjs/`);

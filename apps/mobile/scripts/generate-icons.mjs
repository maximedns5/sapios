// Génère les icônes et l'image de démarrage de l'app (et l'icône du site) à partir du logotype
// « sapios » en Bodoni Moda italique. Les contours viennent de `glyphs.json` (voir extract-glyphs.py) :
// aucun rendu ne dépend d'une police installée sur la machine.
//
//   node apps/mobile/scripts/generate-icons.mjs
//
// Il faut Playwright et Chromium : `npm i -g playwright`, ou PLAYWRIGHT_MODULE=/chemin/vers/playwright.
// Si `sharp` est installé (dépendance de Next, présente à la racine), les PNG opaques perdent leur canal
// alpha (exigence d'Apple) et tous les PNG sont recompressés.

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const root = path.resolve(mobile, '../..');

const ACCENT = '#4338E0';
const WHITE = '#FFFFFF';
const INK = '#1A1918';

/** Le logotype de l'écran de démarrage (`app/index.tsx`) : Bodoni 48, interlettrage -0,01 em, hauteur de ligne 1,25. */
const BOOT = { fontSize: 48, letterSpacingEm: -0.01, lineHeightEm: 1.25 };
/** Résolution de l'image de démarrage : 8 fois sa taille affichée. */
const SPLASH_SCALE = 8;

const glyphs = JSON.parse(await readFile(path.join(here, 'glyphs.json'), 'utf8'));
const upm = glyphs.unitsPerEm;

/** Le « s » seul, centré dans un carré, à `height` (fraction du côté) de haut. */
function monogram({ size, height, color, background, radius = 0 }) {
  return { kind: 'monogram', size, height, color, background, radius };
}

const ASSETS = [
  // iOS : carré plein, sans transparence ; le système arrondit les coins.
  { file: 'apps/mobile/assets/images/icon.png', ...monogram({ size: 1024, height: 0.56, color: WHITE, background: ACCENT }), opaque: true },
  // Android : premier plan seul (fond #4338E0 dans app.json), dans la zone sûre de 66/108 du côté.
  { file: 'apps/mobile/assets/images/adaptive-icon.png', ...monogram({ size: 1024, height: 0.4, color: WHITE }) },
  // Notification Android : blanc sur transparent, le système le teinte.
  { file: 'apps/mobile/assets/images/notification-icon.png', ...monogram({ size: 96, height: 0.66, color: WHITE }) },
  // Onglet du navigateur (app web) : coins arrondis.
  { file: 'apps/mobile/assets/images/favicon.png', ...monogram({ size: 64, height: 0.6, color: WHITE, background: ACCENT, radius: 0.22 }) },
  // PWA et écran d'accueil iOS : carré plein, lettre dans la zone sûre « maskable » (cercle de 80 %).
  { file: 'apps/mobile/public/apple-touch-icon.png', ...monogram({ size: 180, height: 0.56, color: WHITE, background: ACCENT }), opaque: true },
  { file: 'apps/mobile/public/icon-192.png', ...monogram({ size: 192, height: 0.54, color: WHITE, background: ACCENT }), opaque: true },
  { file: 'apps/mobile/public/icon-512.png', ...monogram({ size: 512, height: 0.54, color: WHITE, background: ACCENT }), opaque: true },
  // Site public (Next) : icône Apple ; l'icône SVG est écrite plus bas.
  { file: 'apps/web/app/apple-icon.png', ...monogram({ size: 180, height: 0.56, color: WHITE, background: ACCENT }), opaque: true },
  // Démarrage natif : le logotype noir sur blanc, à la place exacte du premier écran de l'app.
  { file: 'apps/mobile/assets/images/splash-icon.png', kind: 'splash', color: INK },
];

async function loadChromium() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '@playwright/test'].filter(Boolean);
  for (const name of candidates) {
    try {
      const spec = path.isAbsolute(name) ? pathToFileURL(path.join(name, 'index.js')).href : name;
      const mod = await import(spec);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return chromium;
    } catch {
      // candidat suivant
    }
  }
  throw new Error('Playwright introuvable : `npm i -g playwright`, ou PLAYWRIGHT_MODULE=/chemin/vers/playwright.');
}

async function loadSharp() {
  try {
    const require = createRequire(path.join(root, 'package.json'));
    return require('sharp');
  } catch {
    console.warn('sharp absent : PNG laissés tels que Chromium les produit (avec canal alpha).');
    return null;
  }
}

/** Le logotype entier, en unités de la police, y vers le haut, avec l'interlettrage de l'app. */
function wordPaths(letterSpacing) {
  return glyphs.word.layout
    .map(({ char, x }, i) => `<path transform="translate(${x + i * letterSpacing} 0)" d="${glyphs.glyphs[char].path}"/>`)
    .join('');
}

/** Boîte englobante de l'encre d'un groupe, en unités de la police (y vers le haut, ligne de base à 0). */
async function inkBox(page, inner) {
  return page.evaluate((markup) => {
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g id="g">${markup}</g></svg>`;
    const b = document.getElementById('g').getBBox();
    return { x: b.x, width: b.width, yMin: b.y, yMax: b.y + b.height };
  }, inner);
}

/** SVG d'un monogramme, prêt à afficher ou à écrire tel quel. */
async function monogramSvg(page, { size, height, color, background, radius }) {
  const inner = `<path d="${glyphs.glyphs.s.path}"/>`;
  const box = await inkBox(page, inner);
  const scale = (size * height) / (box.yMax - box.yMin);
  const tx = size / 2 - (box.x + box.width / 2) * scale;
  const ty = size / 2 + ((box.yMin + box.yMax) / 2) * scale;
  const r = (radius ?? 0) * size;
  const bg = background ? `<rect width="${size}" height="${size}" rx="${r}" fill="${background}"/>` : '';
  const f = (n) => Math.round(n * 1000) / 1000;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `${bg}<g fill="${color}" transform="translate(${f(tx)} ${f(ty)}) scale(${f(scale)} ${f(-scale)})">${inner}</g></svg>`
  );
}

/**
 * Image de démarrage : la boîte de ligne du `<Wordmark size={48} />` de `app/index.tsx`, élargie
 * symétriquement pour contenir toute l'encre. Centrée par expo-splash-screen, elle tombe à l'endroit
 * exact où l'app dessine ensuite son logotype : pas de saut à la fin du démarrage.
 */
async function splashSvg(page, color) {
  const spacing = BOOT.letterSpacingEm * upm;
  const inner = wordPaths(spacing);
  const ink = await inkBox(page, inner);
  // Boîte de texte de React Native : largeur = avances + interlettrage après chaque lettre.
  const textWidth = glyphs.word.advance + glyphs.word.layout.length * spacing;
  const lineHeight = BOOT.lineHeightEm * upm;
  // Ligne de base dans la boîte : l'excédent (ou le manque) d'interligne est réparti en haut et en bas.
  const contentHeight = glyphs.ascent - glyphs.descent;
  const baseline = (lineHeight - contentHeight) / 2 + glyphs.ascent;
  const cx = textWidth / 2;
  const cy = lineHeight / 2;
  // Encre en repère « boîte de ligne » (y vers le bas depuis le haut de la boîte).
  const inkTop = baseline - ink.yMax;
  const inkBottom = baseline - ink.yMin;
  const halfW = Math.max(cx - ink.x, ink.x + ink.width - cx) + 8;
  const halfH = Math.max(cy - inkTop, inkBottom - cy) + 8;
  const unitsToPx = (BOOT.fontSize / upm) * SPLASH_SCALE;
  const width = Math.ceil(2 * halfW * unitsToPx);
  const height = Math.ceil(2 * halfH * unitsToPx);
  const f = (n) => Math.round(n * 1000) / 1000;
  const tx = (halfW - cx) * unitsToPx;
  const ty = (halfH - cy + baseline) * unitsToPx;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<g fill="${color}" transform="translate(${f(tx)} ${f(ty)}) scale(${f(unitsToPx)} ${f(-unitsToPx)})">${inner}</g></svg>`;
  return { svg, width, height, imageWidth: Math.round((width / SPLASH_SCALE) * 10) / 10 };
}

async function render(page, svg, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
}

async function main() {
  const chromium = await loadChromium();
  const sharp = await loadSharp();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><html><body></body></html>');

  for (const asset of ASSETS) {
    let svg;
    let width;
    let height;
    if (asset.kind === 'splash') {
      const splash = await splashSvg(page, asset.color);
      ({ svg, width, height } = splash);
      console.log(`splash : ${width} × ${height} px, imageWidth ${splash.imageWidth} dans app.json`);
    } else {
      svg = await monogramSvg(page, asset);
      width = height = asset.size;
    }
    let png = await render(page, svg, width, height);
    if (sharp) {
      let img = sharp(png);
      if (asset.opaque) img = img.flatten({ background: asset.background }).removeAlpha();
      png = await img.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    }
    await writeFile(path.join(root, asset.file), png);
    console.log(`${asset.file} (${width} × ${height})`);
  }

  // Favicon vectoriel du site : même monogramme, coins arrondis.
  const siteIcon = await monogramSvg(page, { size: 64, height: 0.6, color: WHITE, background: ACCENT, radius: 0.22 });
  await writeFile(path.join(root, 'apps/web/app/icon.svg'), `${siteIcon}\n`);
  console.log('apps/web/app/icon.svg');

  await browser.close();
}

await main();

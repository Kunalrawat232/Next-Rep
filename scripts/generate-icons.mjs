// Renders the app icons from the logo mark with the Playwright Chromium that is already installed.
// Run `node scripts/generate-icons.mjs` after changing the logo. The PNGs are committed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { LOGO_N_PATH, LOGO_R_PATH } from '../src/components/logoPaths.ts';

const BACKGROUND = '#000000';
const INK = '#F5F5F7';

/** The N and R mark centred on a square, covering `fill` of the width. 0.8 keeps maskable icons in the safe zone. */
function svg(fill, rounded) {
  const markWidth = 898;
  const markHeight = 550;
  const side = markWidth / fill;
  const x = 251 - (side - markWidth) / 2;
  const y = 120 - (side - markHeight) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}">
  <defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="150" y1="122" x2="420" y2="657">
    <stop offset="0" stop-color="#C4D8FF"/><stop offset="1" stop-color="#4F86FF"/></linearGradient></defs>
  <rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${rounded ? side * 0.22 : 0}" fill="${BACKGROUND}"/>
  <g transform="translate(163.5 12)"><path fill="url(#g)" d="${LOGO_N_PATH}"/><path fill="${INK}" d="${LOGO_R_PATH}"/></g>
</svg>`;
}

const icons = [
  { file: 'icon-192.png', size: 192, fill: 0.62 },
  { file: 'icon-512.png', size: 512, fill: 0.62 },
  { file: 'icon-maskable-512.png', size: 512, fill: 0.5 },
  { file: 'apple-touch-icon.png', size: 180, fill: 0.62 },
];

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/favicon.svg', svg(0.62, true));

const browser = await chromium.launch();
try {
  for (const { file, size, fill } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg(fill, false)).toString('base64')}"></body>`,
    );
    await page.screenshot({ path: `public/icons/${file}`, omitBackground: false });
    await page.close();
  }
} finally {
  await browser.close();
}

// Dev-only: renders the icon art in icons/ to the PNG files manifest.json names, so the
// launcher icons can be redrawn as vectors. The PNGs are committed — the app ships plain
// files with no build step — and this is the only way they are made. Not part of the app.
//
//   node dev/make-icons.mjs
//
// Needs the browser: npm run browser:install
//
// Run it after changing an icon source, then `npm run check`: lint compares the manifest's
// declared sizes against the pixels the files actually have.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const TARGETS = [
    // purpose "any" icons come from the rounded tile; the maskable one from the full-bleed
    // ground, which is the variant Android crops to the launcher's shape.
    { source: 'icons/icon.svg', png: 'icons/icon-192.png', size: 192 },
    { source: 'icons/icon.svg', png: 'icons/icon-512.png', size: 512 },
    { source: 'icons/icon-maskable.svg', png: 'icons/icon-maskable-512.png', size: 512 },
];

async function main() {
    const browser = await chromium.launch();
    // One page for the whole run: every viewport is the icon's own square, and a
    // transparent screenshot only needs the page's default background hidden.
    const page = await browser.newPage();
    try {
        for (const { source, png, size } of TARGETS) {
            const markup = fs.readFileSync(source, 'utf8');
            await page.setViewportSize({ width: size, height: size });
            await page.setContent(
                `<!DOCTYPE html><html><head><style>html,body{margin:0}`
                + `svg{display:block;width:100%;height:100%}</style></head><body>${markup}</body></html>`);
            await page.screenshot({ path: png, omitBackground: true });
            console.log(`wrote ${png} (${size}x${size}, from ${source})`);
        }
    } finally {
        await browser.close();
    }
}

main().catch(e => { console.error(e); process.exit(1); });

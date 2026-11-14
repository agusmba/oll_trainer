// The lint gate itself, proven on throwaway trees rather than on this repo: a file the
// browser would choke on, and a reference to an asset that is not there.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import { lint } from '../dev/lint.mjs';

function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-'));
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'styles'));
    fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'var allowStartingTimer;\n');
    fs.writeFileSync(path.join(dir, 'styles', 'main.css'), 'body {}\n');
    fs.writeFileSync(path.join(dir, 'index.html'),
        `<link href="styles/main.css?v1">\n<script src="scripts/timer.js?v3"></script>\n`);
    return dir;
}

/// A service worker whose precache list matches the fixture's index.html. The real
/// worker lives at the site root — scope pins it there — so a fixture has to write it
/// by hand, and the precache agreement check reads exactly what it declares.
function withWorker(dir, precacheUrls) {
    fs.writeFileSync(path.join(dir, 'service-worker.js'),
        `const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 4)};\nself.addEventListener("install", () => {});\n`);
}

/// The manifest the fixture's index.html links: two PNG icons and an index.html start.
const FIX_MANIFEST = {
    name: 'OLL Trainer',
    short_name: 'OLL',
    start_url: 'index.html',
    display: 'standalone',
    icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
};

/// The fixture made installable: the manifest index.html links, the icons it names drawn
/// at the sizes it declares, and a worker precaching everything the app ships. One
/// deliberate breakage is then the only problem lint can find.
function withInstallableTree(dir, manifest = FIX_MANIFEST) {
    fs.writeFileSync(path.join(dir, 'index.html'),
        `${fs.readFileSync(path.join(dir, 'index.html'), 'utf8')}<link rel="manifest" href="manifest.json">\n`);
    fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 4)}\n`);

    fs.mkdirSync(path.join(dir, 'icons'), { recursive: true });
    for (const icon of manifest.icons) {
        const [width, height] = icon.sizes ? icon.sizes.split('x').map(Number) : [512, 512];
        writePng(dir, icon.src, width, height);
    }

    withWorker(dir, [
        'index.html', 'styles/main.css?v1', 'scripts/timer.js?v3', 'manifest.json',
        ...manifest.icons.map(icon => icon.src),
    ]);
    return manifest;
}

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; ++n) {
        let c = n;
        for (let k = 0; k < 8; ++k) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

/// A real PNG of the given pixel size: signature, IHDR, one deflated IDAT of transparent
/// pixels, IEND. Its header declares the dimensions it is drawn at, which is what any
/// reader takes as the file's size.
function writePng(dir, rel, width, height) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type: RGBA
    const rows = Buffer.alloc(height * (1 + width * 4)); // filter byte 0 per row, zero pixels
    fs.writeFileSync(path.join(dir, rel), Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', deflateSync(rows)),
        pngChunk('IEND', Buffer.alloc(0)),
    ]));
}

const clean = dir => fs.rmSync(dir, { recursive: true, force: true });

test('a clean tree passes', () => {
    const dir = fixture();
    try {
        assert.deepEqual(lint(dir), []);
    } finally { clean(dir); }
});

test('a lone CR in a shipped file is reported', () => {
    const dir = fixture();
    try {
        // The failure this scan exists for: a rewrite that spliced a carriage return in
        // with no line feed after it, leaving a statement the browser stops parsing.
        fs.writeFileSync(path.join(dir, 'scripts', 'ui.js'), 'function applystyle() {\r}\n');
        const problems = lint(dir);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /scripts\/ui\.js contains a lone CR byte/);
    } finally { clean(dir); }
});

test('a lone CR in the service worker is reported', () => {
    const dir = fixture();
    try {
        // The worker sits at the site root, where scope requires it, which is outside the
        // scripts/ scan: the same splice that breaks a script breaks offline entirely.
        fs.writeFileSync(path.join(dir, 'service-worker.js'),
            'const PRECACHE_URLS = ["index.html", "styles/main.css?v1", "scripts/timer.js?v3"];\r\nself.addEventListener("install", () => {\r});\n');
        const problems = lint(dir);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /^service-worker\.js contains a lone CR byte/);
    } finally { clean(dir); }
});

test('a service worker the browser cannot parse is reported', () => {
    const dir = fixture();
    try {
        withWorker(dir, ['index.html', 'styles/main.css?v1', 'scripts/timer.js?v3']);
        fs.appendFileSync(path.join(dir, 'service-worker.js'), 'self.addEventListener("fetch", (e => {\n');
        const problems = lint(dir);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /^service-worker\.js: /);
    } finally { clean(dir); }
});

test('a file that is entirely CRLF is left alone', () => {
    const dir = fixture();
    try {
        // scripts/algsmap.js ships as CRLF from upstream: legal line endings, not damage.
        fs.writeFileSync(path.join(dir, 'scripts', 'algsmap.js'), 'var algsMap = {\r\n};\r\n');
        assert.deepEqual(lint(dir), []);
    } finally { clean(dir); }
});

test('a file the browser would fail to parse is reported', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'function displayStats() { const a = (b;\n');
        const problems = lint(dir);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /scripts\/timer\.js: /);
    } finally { clean(dir); }
});

test('a reference to an asset that is not in the repo is reported', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'index.html'),
            `<link href="styles/selection.css?v1">\n<script src="scripts/timer.js?v3"></script>\n`);
        const problems = lint(dir);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /references styles\/selection\.css/);
    } finally { clean(dir); }
});

test('links to other sites are not treated as repo files', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'index.html'),
            fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
                + `<a href="https://agusmba.github.io/oll_trainer/">repo</a>\n<a href="#anchor">anchor</a>\n`);
        assert.deepEqual(lint(dir), []);
    } finally { clean(dir); }
});

test('an installable tree with nothing broken about it passes', () => {
    const dir = fixture();
    try {
        withInstallableTree(dir);
        assert.deepEqual(lint(dir), []);
    } finally { clean(dir); }
});

test('a precache list that omits an asset the app ships is reported', () => {
    const dir = fixture();
    try {
        // The list is the offline app. An entry missing from it is a picture that cannot
        // render, or a sheet that cannot load, the first time the phone has no network.
        withInstallableTree(dir);
        withWorker(dir, ['index.html', 'scripts/timer.js?v3', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png']);
        const problems = lint(dir);
        assert.equal(problems.length, 1, `problems: ${problems.join('; ')}`);
        assert.match(problems[0], /service-worker\.js does not precache styles\/main\.css\?v1/);
    } finally { clean(dir); }
});

test('a precache list still carrying an old ?vN is reported', () => {
    const dir = fixture();
    try {
        // The query is the asset's identity, so a stale number in the list precaches the
        // file the entry point no longer loads and the app never updates.
        withInstallableTree(dir);
        const stale = JSON.stringify([
            'index.html', 'styles/main.css?v1', 'scripts/timer.js?v2', 'manifest.json',
            'icons/icon-192.png', 'icons/icon-512.png',
        ]);
        fs.writeFileSync(path.join(dir, 'service-worker.js'),
            fs.readFileSync(path.join(dir, 'service-worker.js'), 'utf8').replace(/\[[^\]]*\]/, stale));
        const problems = lint(dir);
        assert.equal(problems.length, 1, `problems: ${problems.join('; ')}`);
        assert.match(problems[0],
            /service-worker\.js precaches scripts\/timer\.js\?v2, which index.html does not load: index.html loads scripts\/timer\.js\?v3/);
    } finally { clean(dir); }
});

test('a precache entry for an asset the app does not ship is reported', () => {
    const dir = fixture();
    try {
        // An entry the app cannot fetch fails the install, which is the whole offline story.
        withInstallableTree(dir);
        const extra = JSON.stringify([
            'index.html', 'styles/main.css?v1', 'scripts/timer.js?v3', 'manifest.json',
            'icons/icon-192.png', 'icons/icon-512.png', 'pic/58.svg',
        ]);
        fs.writeFileSync(path.join(dir, 'service-worker.js'),
            fs.readFileSync(path.join(dir, 'service-worker.js'), 'utf8').replace(/\[[^\]]*\]/, extra));
        const problems = lint(dir);
        assert.equal(problems.length, 1, `problems: ${problems.join('; ')}`);
        assert.match(problems[0], /service-worker\.js precaches pic\/58\.svg, which is not in the repo/);
    } finally { clean(dir); }
});

test('a worker with no precache list is reported', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'service-worker.js'), 'self.addEventListener("install", () => {});\n');
        const problems = lint(dir);
        assert.equal(problems.length, 1, `problems: ${problems.join('; ')}`);
        assert.match(problems[0], /service-worker\.js declares no PRECACHE_URLS list/);
    } finally { clean(dir); }
});

test('a manifest naming an icon that is not in the repo is reported', () => {
    const dir = fixture();
    try {
        // The manifest is a second source of asset references, and the index.html scan
        // never reads it: a renamed icon file is a missing launcher icon on a phone.
        withInstallableTree(dir);
        fs.rmSync(path.join(dir, 'icons', 'icon-512.png'));
        const problems = lint(dir);
        assert.equal(problems.length, 1, `problems: ${problems.join('; ')}`);
        assert.match(problems[0], /manifest\.json names icons\/icon-512\.png, which is not in the repo/);
    } finally { clean(dir); }
});

test('a manifest start_url that is not in the repo is reported', () => {
    const dir = fixture();
    try {
        withInstallableTree(dir, { ...FIX_MANIFEST, start_url: 'home.html' });
        const problems = lint(dir);
        assert.equal(problems.length, 1, `problems: ${problems.join('; ')}`);
        assert.match(problems[0], /manifest\.json names start_url home\.html, which is not in the repo/);
    } finally { clean(dir); }
});

test('an icon whose pixels disagree with its declared sizes is reported', () => {
    const dir = fixture();
    try {
        // Chromium picks the icon a launcher draws by the declared size, so a file that
        // lies about its own dimensions installs an app that renders wrong or not at all.
        withInstallableTree(dir);
        writePng(dir, 'icons/icon-192.png', 192, 193);
        const problems = lint(dir);
        assert.equal(problems.length, 1, `problems: ${problems.join('; ')}`);
        assert.match(problems[0], /icons\/icon-192\.png is 192x193, not the 192x192 the manifest declares/);
    } finally { clean(dir); }
});

test('a non-square icon declared with its own dimensions is not flagged', () => {
    const dir = fixture();
    try {
        withInstallableTree(dir, {
            ...FIX_MANIFEST,
            icons: [{ src: 'icons/banner.png', sizes: '640x360', type: 'image/png' }],
        });
        assert.deepEqual(lint(dir), []);
    } finally { clean(dir); }
});

test('a PNG whose declared sizes member is absent is left alone', () => {
    const dir = fixture();
    try {
        // Icons carry sizes; a stray PNG that declares none cannot disagree with anything.
        withInstallableTree(dir, {
            ...FIX_MANIFEST,
            icons: [{ src: 'icons/icon-512.png', type: 'image/png' }],
        });
        assert.deepEqual(lint(dir), []);
    } finally { clean(dir); }
});

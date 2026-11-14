// Deterministic checks over the shipped files and the dev tooling.
//
// These are the mistakes a browser only discovers at runtime: a file the browser
// stops parsing mid-statement, a reference to an asset that is not there. The manifest
// and the worker's precache list are two more sources of asset references, and nothing
// notices either until a phone loses the network, so they are checked here too.
// Cache-bust versions are a separate check (dev/bump-version.mjs --check); `npm run check`
// chains both, and .githooks/pre-commit and CI run it.
//
// Dev-only: not part of the shipped app.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The manifest and the service worker are named files at the site root: the worker's
// scope cannot reach above its own directory, so neither sits in a directory the scans
// walk, and both escape the lists unless named here.
const MANIFEST = 'manifest.json';
const WORKER = 'service-worker.js';
const JS_DIRS = ['scripts', 'dev', 'test', WORKER];
// Files the browser loads. CR bytes in one of them is the failure this scan exists for:
// a rewrite through a shell can splice \r in, and the browser stops parsing while the
// file still looks fine to a reader.
const SHIPPED = ['index.html', 'scripts', 'styles', 'pic', 'icons', MANIFEST, WORKER];
const EXT_RE = /\.(js|mjs|css|svg|html)$/;

function filesUnder(root, name) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) return [];
    if (fs.statSync(p).isFile()) return [p];
    return fs.readdirSync(p).filter(f => EXT_RE.test(f)).map(f => path.join(p, f));
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/// \returns true for a reference that points at another origin, and so at no file this
/// repo could be checked against.
const isExternal = url => /^[a-z]+:\/\//i.test(url);

/// \returns the path part of a reference, without the ?vN query dev/bump-version.mjs
/// writes into it — the query is part of a URL's identity, not of the file's.
const pathOf = url => url.split('?')[0];

/// \returns the file a reference asks for.
const fileFor = (root, url) => path.join(root, pathOf(url));

/// \returns the pixels a PNG carries in its IHDR chunk, or null when it is not a PNG.
/// Exported because offline.test.mjs asks the same question of the bytes an origin
/// answers with, and one rule for "does this file have the pixels" beats two.
export function pngDimensions(bytes) {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    // IHDR is always the first chunk: 4-byte length, 4-byte type, then width and height.
    if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
    return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

/// \returns true when a declared sizes value covers the pixels the file really has.
/// Exported for the same reason as pngDimensions.
export function sizesCover(declared, actual) {
    const tokens = String(declared).split(/\s+/).filter(Boolean);
    return tokens.some(token => token === 'any' || token === actual);
}

/// \returns the parsed manifest, or null when the tree has none or it does not parse.
/// `problem` carries the reason a manifest that exists could not be read.
function readManifest(root) {
    const manifestPath = path.join(root, MANIFEST);
    if (!fs.existsSync(manifestPath)) return null;
    try {
        return { manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) };
    } catch (e) {
        return { problem: `${MANIFEST} is not valid JSON: ${e.message}` };
    }
}

/// The manifest is the app's second source of asset references — icons and start_url —
/// and nothing else in the scan reads it. An icon the manifest names that is not in the
/// tree, or one whose pixels disagree with the size it declares, is an app that installs
/// with a missing or wrong launcher icon, which no browser test would notice.
function manifestProblems(root) {
    const read = readManifest(root);
    if (!read) return [];
    if (read.problem) return [read.problem];

    const { manifest } = read;
    const problems = [];
    const starts = manifest.start_url ?? '.';
    if (!isExternal(starts) && !fs.existsSync(fileFor(root, starts))) {
        problems.push(`${MANIFEST} names start_url ${starts}, which is not in the repo`);
    }

    for (const icon of manifest.icons ?? []) {
        const src = icon?.src;
        if (!src || isExternal(src)) continue;
        const file = fileFor(root, src);
        if (!fs.existsSync(file)) {
            problems.push(`${MANIFEST} names ${src}, which is not in the repo`);
            continue;
        }
        if (!icon.sizes) continue;
        const actual = pngDimensions(fs.readFileSync(file));
        // Sizes only mean something for a raster; an SVG icon scales to whatever is asked.
        if (actual && !sizesCover(icon.sizes, actual)) {
            problems.push(`${src} is ${actual}, not the ${icon.sizes} the manifest declares`);
        }
    }
    return problems;
}

/// The precache list is the offline app: whatever is not in it cannot load when the
/// network is gone. It is written by hand next to the worker's own logic, while the
/// versions it must carry live only in index.html, so the two are compared here.
const PRECACHE_LIST_RE = /(?:const|let|var)\s+PRECACHE_URLS\s*=\s*(\[[^\]]*\])/;

/// \returns the URLs an offline start needs, spelled the way index.html spells them: the
/// entry point, what it references (queries included), every Case picture, the manifest,
/// the icons it names and the start_url it launches on.
function precacheExpectation(root) {
    const expected = new Set(['index.html']);

    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const ref = match[1];
        if (isExternal(ref) || ref.startsWith('#')) continue;
        expected.add(ref);
    }

    const picDir = path.join(root, 'pic');
    if (fs.existsSync(picDir)) {
        for (const name of fs.readdirSync(picDir).filter(f => f.endsWith('.svg'))) {
            expected.add(`pic/${name}`);
        }
    }

    const read = readManifest(root);
    if (read?.manifest) {
        expected.add(MANIFEST);
        // An icon or a start_url that is not in the tree is already a problem of its own
        // (manifestProblems reports it); expecting a file that does not exist would be the
        // same breakage reported twice.
        const inTree = url => fs.existsSync(fileFor(root, url));
        if (read.manifest.start_url && !isExternal(read.manifest.start_url) && inTree(read.manifest.start_url)) {
            expected.add(read.manifest.start_url);
        }
        for (const icon of read.manifest.icons ?? []) {
            if (icon?.src && !isExternal(icon.src) && inTree(icon.src)) expected.add(icon.src);
        }
    }
    return expected;
}

/// Names the manifest carries that are not in the tree. manifestProblems owns those, so
/// the precache comparison must not report the same missing file a second time.
function manifestMissingNames(root) {
    const read = readManifest(root);
    if (!read?.manifest) return new Set();
    const named = [read.manifest.start_url, ...(read.manifest.icons ?? []).map(icon => icon?.src)]
        .filter(url => url && !isExternal(url));
    return new Set(named.filter(url => !fs.existsSync(fileFor(root, url))));
}

function precacheProblems(root) {
    const workerPath = path.join(root, WORKER);
    if (!fs.existsSync(workerPath)) return [];

    const declaredText = fs.readFileSync(workerPath, 'utf8');
    const match = PRECACHE_LIST_RE.exec(declaredText);
    if (!match) return [`${WORKER} declares no PRECACHE_URLS list — nothing is held for an offline start`];

    let declared;
    try {
        declared = JSON.parse(match[1]);
    } catch {
        return [`${WORKER} PRECACHE_URLS is not a plain list of double-quoted URLs`];
    }

    const expected = precacheExpectation(root);
    const expectedPaths = new Map([...expected].map(url => [pathOf(url), url]));
    const declaredPaths = new Set(declared.map(pathOf));
    const notInTree = manifestMissingNames(root);
    const problems = [];

    for (const url of expected) {
        // A declared entry with the wrong query covers the same file: that is reported once,
        // as the drift, not also as an omission.
        if (!declared.includes(url) && !declaredPaths.has(pathOf(url))) {
            problems.push(`${WORKER} does not precache ${url}`);
        }
    }
    for (const url of declared) {
        if (expected.has(url) || notInTree.has(url)) continue;
        const wanted = expectedPaths.get(pathOf(url));
        // The ?vN query is the asset's identity, so this is the drift that ships an app
        // which never updates: the list caches a file the entry point no longer loads.
        if (wanted && wanted !== url) {
            problems.push(`${WORKER} precaches ${url}, which index.html does not load: index.html loads ${wanted}`);
        } else if (!fs.existsSync(fileFor(root, url))) {
            problems.push(`${WORKER} precaches ${url}, which is not in the repo`);
        } else {
            problems.push(`${WORKER} precaches ${url}, which no part of the app loads`);
        }
    }
    return problems;
}

/// \returns array of human-readable problems found under root; empty means clean
export function lint(root) {
    const problems = [];

    for (const file of SHIPPED.flatMap(name => filesUnder(root, name))) {
        // A lone CR — a carriage return with no line feed after it — is what a rewrite
        // through a shell splices into a file, and it is what makes a browser stop
        // parsing part-way through. A file that is entirely CRLF (scripts/algsmap.js,
        // straight from upstream) is legal and left alone.
        if (/\r(?!\n)/.test(fs.readFileSync(file))) {
            problems.push(`${path.relative(root, file)} contains a lone CR byte — the browser will stop parsing it`);
        }
    }

    for (const dir of JS_DIRS) {
        for (const file of filesUnder(root, dir)) {
            try {
                execFileSync('node', ['--check', file], { encoding: 'utf8' });
            } catch (e) {
                problems.push(`${path.relative(root, file)}: ${(e.stderr || e.message).trim().split('\n')[0]}`);
            }
        }
    }

    const indexPath = path.join(root, 'index.html');
    if (!fs.existsSync(indexPath)) return problems;
    const html = fs.readFileSync(indexPath, 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const ref = match[1];
        if (isExternal(ref) || ref.startsWith('#')) continue;
        if (!fs.existsSync(fileFor(root, ref))) {
            problems.push(`index.html references ${ref}, which is not in the repo`);
        }
    }

    problems.push(...manifestProblems(root));
    problems.push(...precacheProblems(root));

    return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const problems = lint(process.cwd());
    if (problems.length) {
        console.log(problems.join('\n'));
        console.log(`lint failed: ${problems.length} problem(s)`);
        process.exit(1);
    }
    console.log('lint passed: syntax, CR bytes, asset references, manifest and precache list are clean');
}

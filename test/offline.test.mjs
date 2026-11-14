// The Installed app's two promises, proven over the served Pages-style origin: that the
// site can be installed, and that it keeps working once the network goes away. The same
// files opened over file:// are an Offline copy, where no worker may register at all.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import {
    openApp, openServedApp, selectedCases, caseCellIds, brokenImages, isValidScramble,
    waitForWorker, clickGroup, clickPractice, lastCase, closeBrowser,
} from './harness.mjs';
import { pngDimensions, sizesCover } from '../dev/lint.mjs';

after(async () => { await closeBrowser(); });

/// \returns the manifest as a visitor gets it: { href, status, contentType, manifest }
async function servedManifest(app) {
    const href = await app.page.evaluate(() => document.querySelector('link[rel="manifest"]')?.href ?? null);
    assert.ok(href, 'the entry point links no manifest');

    const response = await app.page.request.get(href);
    return {
        href,
        status: response.status(),
        contentType: response.headers()['content-type'] ?? '',
        manifest: JSON.parse(await response.text()),
    };
}

/// \returns true when the manifest names a PNG icon of this size for this purpose
function declaresIcon(manifest, size, purpose) {
    return (manifest.icons ?? []).some(icon =>
        icon.type === 'image/png' && icon.sizes === size && (icon.purpose ?? 'any') === purpose);
}

test('the entry point links a manifest that the served origin returns as JSON', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        const { href, status, contentType, manifest } = await servedManifest(app);
        assert.equal(href, `${app.server.origin}/oll/manifest.json`,
            `the manifest link must resolve under the served subpath, got ${href}`);
        assert.equal(status, 200, 'the manifest is not reachable on the served copy');
        // Pages answers .json with application/json, and Chromium only accepts a manifest
        // whose content type says JSON.
        assert.match(contentType, /application\/json/, `manifest served as ${contentType}`);
        assert.equal(typeof manifest, 'object', 'the manifest does not parse as a JSON object');
    } finally { await app.close(); }
});

test('the manifest carries the members Chromium installs on', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        const { href, manifest } = await servedManifest(app);

        assert.equal(manifest.name, 'OLL Trainer', `name: ${manifest.name}`);
        assert.equal(manifest.short_name, 'OLL Trainer', `short_name: ${manifest.short_name}`);
        assert.ok(typeof manifest.description === 'string' && manifest.description.length > 0,
            'the manifest carries no description');
        assert.equal(manifest.lang, 'en', `lang: ${manifest.lang}`);
        assert.equal(manifest.display, 'standalone',
            `an installed app launches with no browser chrome, got display ${manifest.display}`);

        // The app is served under a subpath, at an origin root, and from a download: a
        // path that starts at the origin would work in only one of those places.
        for (const member of ['start_url', 'scope']) {
            const value = manifest[member];
            assert.ok(typeof value === 'string' && value.length > 0, `the manifest has no ${member}`);
            assert.ok(!value.startsWith('/'), `${member} ${value} is absolute — it must be relative to the manifest`);
            assert.ok(!/^[a-z]+:\/\//i.test(value), `${member} ${value} names another origin`);
            assert.ok(new URL(value, href).pathname.startsWith('/oll/'),
                `${member} ${value} leaves the served subpath`);
        }

        assert.equal(declaresIcon(manifest, '192x192', 'any'), true, 'no 192px PNG icon for any purpose');
        assert.equal(declaresIcon(manifest, '512x512', 'any'), true, 'no 512px PNG icon for any purpose');
        assert.equal(declaresIcon(manifest, '512x512', 'maskable'), true,
            'no 512px maskable icon — Android crops the launcher icon to a shape, and without a maskable variant it crops the art');
    } finally { await app.close(); }
});

test('every icon the manifest names is served as an image of the size it declares', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        const { href, manifest } = await servedManifest(app);

        // A launcher asks for the icon by name and never tells anyone when it gets
        // nothing, so each declared src has to answer on its own.
        const icons = manifest.icons ?? [];
        assert.ok(icons.length > 0, 'the manifest declares no icons to fetch');
        for (const icon of icons) {
            const url = new URL(icon.src, href);
            const response = await app.page.request.get(url.href);
            assert.equal(response.status(), 200, `${icon.src} is not reachable: ${response.status()}`);
            const contentType = response.headers()['content-type'] ?? '';
            assert.match(contentType, /^image\/png/, `${icon.src} is served as ${contentType}`);

            const pixels = pngDimensions(await response.body());
            assert.ok(pixels, `${icon.src} is not a PNG at all, though ${contentType} says it is`);
            assert.ok(sizesCover(icon.sizes, pixels),
                `${icon.src} declares ${icon.sizes} but the bytes carry ${pixels}`);
        }
    } finally { await app.close(); }
});

test('the manifest colours come from the same palettes the app paints with', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        const { manifest } = await servedManifest(app);

        // scripts/ui.js repaints meta[name="theme-color"] from the user's chosen
        // background, so the manifest's light colour has to be that tag's own value.
        // The dark pair is declared ahead of any engine reading it: color_scheme_dark is
        // the W3C themeable-member draft, no browser implements it yet, and it would key
        // off the system theme rather than the app's own Theme preference. What it promises
        // is only that when it lands, a system-dark phone gets a dark splash.
        const meta = await app.page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content);
        assert.equal(meta, '#f4f6f8', `the entry point's theme-color is ${meta}, not the light palette's background`);
        assert.equal(manifest.theme_color, meta, 'theme_color disagrees with the entry point\'s theme-color');
        assert.equal(manifest.background_color, '#f4f6f8', `background_color: ${manifest.background_color}`);
        assert.equal(manifest.color_scheme_dark?.background_color, '#14171c',
            `the dark variant's background_color is ${manifest.color_scheme_dark?.background_color}, not the dark palette's`);
    } finally { await app.close(); }
});

/// Why the worker is not in charge, in the terms a failure can be acted on.
function whyNoWorker(worker) {
    return `no worker took control (scope ${worker.scope}, active ${worker.active},`
        + ` installed-waiting ${worker.installed}, waiting ${worker.waiting})`
        + ' — an install whose precache fails never activates';
}

test('the worker registers and takes control of the served origin', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        const worker = await waitForWorker(app.page);
        assert.ok(worker.active, whyNoWorker(worker));
        assert.match(worker.active, /\/oll\/service-worker\.js$/, `the active worker is ${worker.active}`);
        // Scope is what the app has to live inside: the worker's own directory, so a start
        // anywhere in the app is a start of the installed app.
        assert.equal(worker.scope, `${app.server.origin}/oll/`, 'the worker does not control the app directory');

        // The page that registered is not itself controlled — that is how workers work — so
        // the question a phone actually asks is whether the next launch is intercepted.
        await app.page.reload();
        const controlled = await app.page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
        assert.match(controlled ?? '', /\/oll\/service-worker\.js$/, `after a reload the page is controlled by ${controlled}`);
        // Taking control must not change what an online load sees.
        assert.equal((await caseCellIds(app.page)).length, 57, 'under the worker the Selection grid lost tiles');
        assert.deepEqual(await brokenImages(app.page), [], 'the worker broke a case picture');
        assert.deepEqual(app.errors, [], app.errors.join('; '));
    } finally { await app.close(); }
});

// Two files the cache already holds, with the origin now answering differently for both.
// A versioned URL is the asset's own identity, so the cached copy is the right one forever
// and the origin must never be asked again; a picture has no such anchor, so a cached copy
// is only ever a stale one, and the repair has to land. service-worker.js's VERSIONED_RE
// is the switch between the two, and a regex that stopped matching changes nothing a
// visitor can see — this is what notices.
const SERVED = 'origin-served-9c1f';

test('a versioned asset is never asked for again, a picture is repaired', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        const worker = await waitForWorker(app.page);
        assert.ok(worker.active, whyNoWorker(worker));

        // The page that registered a worker is not itself controlled by it, so this reload
        // is what puts the fetches below in the worker's hands.
        await app.page.reload();

        // The disk still holds both files; only the origin's answer changes. Nothing is
        // written into the repo, and the two copies differ by this marker alone.
        app.server.override('scripts/timer.js', `/* ${SERVED} */`);
        app.server.override('pic/31.svg', `<svg xmlns="http://www.w3.org/2000/svg">${SERVED}</svg>`);
        app.server.resetHits();

        // A page's own fetch() is what the worker answers; page.request.get sails past it.
        // The URL comes from the tag the app actually loads, so this cannot drift to asking
        // for an unversioned file and proving the wrong branch.
        const copies = await app.page.evaluate(async () => {
            const src = document.querySelector('script[src*="timer.js"]').src;
            const bodies = [];
            for (let i = 0; i < 3; i++) bodies.push(await fetch(src).then(r => r.text()));
            return { src, bodies };
        });
        assert.match(copies.src, /\?v\d+$/, `the app loads ${copies.src} — an unversioned file asks the wrong branch`);
        assert.match(copies.bodies[0], /timesArray/, 'the answer is not the script the app precached');

        // A picture is answered from the cache, so the visitor never waits for it, and
        // repaired behind their back: the first ask sees the old bytes, a later one the new.
        const firstAsk = await app.page.evaluate(() => fetch('pic/31.svg').then(r => r.text()));
        assert.ok(!firstAsk.includes(SERVED), 'a picture waited on the network for the cache to be filled');

        await app.page.waitForFunction(marker => fetch('pic/31.svg')
            .then(r => r.text())
            .then(text => text.includes(marker)), SERVED, { timeout: 10000 });
        assert.ok(app.server.hits('pic/31.svg') > 0,
            'the cache never went to the origin for a picture that had changed under it');

        // Nothing the visitor asked for made the origin answer for the versioned file. The
        // repair above is what gives this weight: it waits out a revalidation started at
        // the same moment, so one that the wrong branch had begun is already counted.
        assert.deepEqual(copies.bodies.filter(body => body.includes(SERVED)), [],
            'a versioned asset came back as the served copy: a ?vN URL cannot mean different bytes, so asking about it again only costs the visitor a round trip');
        assert.equal(app.server.hits('scripts/timer.js'), 0,
            `scripts/timer.js was asked of the origin ${app.server.hits('scripts/timer.js')} times in three loads`);
    } finally { await app.close(); }
});

test('the app opens and works after its origin goes away', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        const worker = await waitForWorker(app.page);
        assert.ok(worker.active, whyNoWorker(worker));

        // An edited Selection is a stronger proof than the default one: it has to come back
        // from storage, on a load that no server can answer.
        const before = await selectedCases(app.page);
        await clickGroup(app.page, 'Squares');
        const edited = await selectedCases(app.page);
        assert.notDeepEqual(edited, before, 'editing a group left the Selection alone — nothing to prove about storage');

        await app.page.reload(); // under the worker's control from here
        await app.server.close(); // the origin disappears: refused sockets, not a throttled one

        await app.page.reload();

        assert.deepEqual(await caseCellIds(app.page).then(ids => ids.length), 57,
            'the Selection grid came back with the wrong number of tiles');
        assert.deepEqual(await brokenImages(app.page), [], 'case pictures did not render offline');
        assert.deepEqual(await selectedCases(app.page), edited, 'the Selection did not come back from storage');

        await clickPractice(app.page);
        const drawn = await lastCase(app.page);
        assert.ok(edited.includes(drawn), `Practice drew case ${drawn}, which the Selection does not hold`);
        const { moves, ok } = await isValidScramble(app.page);
        assert.ok(ok && moves.length > 0, `Practice offline did not show a scramble of legal moves: ${moves.join(' ')}`);

        // A solve is the one thing here the visitor keeps: the time goes into storage, so
        // a phone that solved on a flight still knows what it solved when it opens the app
        // again with no signal at all.
        await app.page.keyboard.press('Space');
        await app.page.waitForTimeout(300);
        await app.page.keyboard.press('Space');
        const shown = await app.page.evaluate(() => document.getElementById('timer').textContent.trim());
        assert.match(shown, /^\d+\.\d+$/, `offline, the timer did not stop on a time: "${shown}"`);

        await app.page.reload();
        await clickPractice(app.page);
        const history = await app.page.evaluate(() => document.getElementById('times').textContent);
        assert.match(history, /\d+\.\d+/, `the time solved offline is not in the history: "${history.trim()}"`);

        await app.page.evaluate(() => displayBox(null, window.lastCase));
        const card = await app.page.evaluate(() => {
            const img = document.getElementById('boxImg');
            return { width: img.naturalWidth, src: img.src };
        });
        assert.ok(card.width > 0, `the case card picture did not render offline: ${card.src} came back ${card.width}px wide`);

        assert.deepEqual(app.errors, [], app.errors.join('; '));
        assert.deepEqual(app.failedRequests, [], `the worker left requests to fail: ${app.failedRequests.join('; ')}`);
    } finally { await app.close(); }
});

test('the app cold-starts offline from the address a phone remembers', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        const worker = await waitForWorker(app.page);
        assert.ok(worker.active, whyNoWorker(worker));
        await app.server.close();

        // A launcher opens the scope, not the file inside it: the bare directory URL is what
        // an installed app is asked for, and it is a different URL from the precached
        // entry point.
        await app.page.goto(`${app.server.origin}/oll/`);

        assert.equal((await caseCellIds(app.page)).length, 57, 'the cold start did not reach the Selection');
        assert.deepEqual(await brokenImages(app.page), [], 'case pictures did not render offline');
        assert.deepEqual(app.errors, [], app.errors.join('; '));
    } finally { await app.close(); }
});

/// What the platform says about workers for this document. A page opened from a filesystem
/// path has no origin at all, so asking for its registrations is refused — the refusal is
/// the answer, and the only way a real registration list comes back is a copy that was
/// served rather than opened.
async function workerRegistrations(page) {
    return page.evaluate(async () => {
        try { return (await navigator.serviceWorker.getRegistrations()).map(r => r.scope); }
        catch (e) { return [`refused: ${e.message}`]; }
    });
}

test('a copy opened from a filesystem path registers nothing and says nothing', async () => {
    // The Offline copy must not even ask. Over file:// a rejected registration is not a
    // console message the page can see, so the absence of console output proves nothing:
    // the only reliable witness is the call that never happens.
    const app = await openApp({ // index.html over file:// — the Offline copy
        init: () => {
            window.registerCalls = [];
            navigator.serviceWorker.register = url => {
                window.registerCalls.push(String(url));
                return Promise.resolve({ scope: 'spied' });
            };
        },
    });
    try {
        const calls = await app.page.evaluate(() => window.registerCalls.slice());
        assert.deepEqual(calls, [], `the Offline copy asked to register ${calls.join(', ')}`);

        const registrations = await workerRegistrations(app.page);
        assert.ok(registrations.length === 0 || /^refused:/.test(registrations[0]),
            `the Offline copy has a worker: ${JSON.stringify(registrations)}`);

        // Nothing said at all, not merely nothing that counts as an error: a copy that
        // cannot have a worker has nothing worth reporting either.
        assert.deepEqual(app.log, [], `the Offline copy spoke up: ${app.log.join(' | ')}`);
        assert.deepEqual(app.errors, [], app.errors.join('; '));

        // What it does promise still works, with no worker anywhere near it.
        assert.ok((await selectedCases(app.page)).length > 0, 'the Offline copy has no Selection');
        assert.deepEqual(await brokenImages(app.page), [], 'the Offline copy cannot draw its own pictures');
    } finally { await app.close(); }
});

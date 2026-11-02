// The published site: what a visitor at https://agusmba.github.io/oll_trainer/ actually
// gets. The other suites prove the app against a served copy; this one proves the real
// deployment, so it runs only when the caller asks for it:
//   npm run test:live                          # the hosted site
//   OLL_LIVE_URL=<url> node --test test/live.test.mjs   # any other deployment
// It fails when the deployment is missing or broken, which is exactly the point.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openApp, selectedCases, clickCase, caseCellIds, sidebarHref } from './harness.mjs';

const HOSTED_URL = 'https://agusmba.github.io/oll_trainer/';
const UPSTREAM_REPO = 'https://github.com/Roman-/oll_trainer';

// undefined means "not under test this run": every test skips rather than failing a
// suite that is meant to run offline.
const liveUrl = process.env.OLL_LIVE_URL;

async function openLive() {
    const app = await openApp({ url: liveUrl });
    await app.page.waitForLoadState('networkidle'); // case pictures are fetched over the network
    return app;
}

/// Case pictures that never rendered, by src.
function brokenImages(page) {
    return page.evaluate(() =>
        [...document.querySelectorAll('#cases_selection img')]
            .filter(img => !img.complete || img.naturalWidth === 0)
            .map(img => img.src));
}

test('the published site is live over HTTPS, with no console or page errors', { skip: liveUrl === undefined }, async () => {
    const app = await openLive();
    try {
        assert.match(app.page.url(), /^https:\/\//, `not served over HTTPS: ${app.page.url()}`);
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
        assert.equal(app.failedRequests.length, 0, `failed requests: ${app.failedRequests.join('; ')}`);
    } finally { await app.close(); }
});

test('all 57 Case images resolve on the published site', { skip: liveUrl === undefined }, async () => {
    const app = await openLive();
    try {
        assert.equal((await caseCellIds(app.page)).length, 57, 'case list did not render');
        const broken = await brokenImages(app.page);
        assert.equal(broken.length, 0, `broken case images: ${broken.join(', ')}`);
    } finally { await app.close(); }
});

test('the Selection persists across a reload on the published origin', { skip: liveUrl === undefined }, async () => {
    const app = await openLive();
    try {
        assert.deepEqual(await selectedCases(app.page), [31, 32], 'Selection is not the default');

        await clickCase(app.page, 31); // deselect one of the default Selection
        assert.deepEqual(await selectedCases(app.page), [32]);

        await app.page.reload();
        await app.page.waitForLoadState('networkidle');
        assert.equal(app.page.url(), liveUrl, `reload left the published origin: ${app.page.url()}`);
        assert.deepEqual(await selectedCases(app.page), [32],
            'the Selection must come back from localStorage on the published origin');
        assert.equal(app.errors.length, 0, `errors after reload: ${app.errors.join('; ')}`);
    } finally { await app.close(); }
});

test('Goal and Weights behave on the published origin as they do locally', { skip: liveUrl === undefined }, async () => {
    const app = await openLive();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });

        await app.page.evaluate(() => bumpWeight(10, 2000, window.goal)); // slower than Goal -> missed
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 2, 'a miss should double the weight');
        assert.equal(await app.page.evaluate(() => weightOfCase(20)), 1, 'a Case that did not solve keeps its weight');

        await app.page.evaluate(() => bumpWeight(10, 500, window.goal)); // faster than Goal -> beaten
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 1, 'a beat should halve the weight');
    } finally { await app.close(); }
});

test('the published page credits Roman Strakhov and links the upstream repo', { skip: liveUrl === undefined }, async () => {
    const app = await openLive();
    try {
        const sidebar = await app.page.evaluate(() => document.querySelector('.selection_layout').textContent);
        assert.match(sidebar, /Roman Strakhov/, `the published page does not credit the original author: ${sidebar}`);
        assert.equal(await sidebarHref(app.page, 'Roman Strakhov'), UPSTREAM_REPO,
            'the credit on the published page must reach the original tool');
    } finally { await app.close(); }
});

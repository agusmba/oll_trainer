// The published site: what a visitor at https://agusmba.github.io/oll_trainer/ actually
// gets. The other suites prove the app against a served copy; this one proves the real
// deployment, so it runs only when the caller asks for it:
//   npm run test:live                                  # the hosted site
//   OLL_LIVE_URL=<url> node --test test/live.test.mjs  # any other deployment
// It fails when the deployment is missing or broken, which is exactly the point.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    openApp, selectedCases, lastCase, caseCellIds, brokenImages,
    clickCase, clickPractice, sidebarHref,
} from './harness.mjs';

const UPSTREAM_REPO = 'https://github.com/Roman-/oll_trainer';

// undefined means "not under test this run": every test skips rather than failing a
// suite that is meant to run offline.
const liveUrl = process.env.OLL_LIVE_URL;
const live = { skip: liveUrl === undefined };

async function openLiveApp() {
    const app = await openApp({ url: liveUrl });
    await app.page.waitForLoadState('networkidle'); // case pictures are fetched over the network
    return app;
}

test('the published site is live over HTTPS, with no console or page errors', live, async () => {
    const app = await openLiveApp();
    try {
        assert.match(app.page.url(), /^https:\/\//, `not served over HTTPS: ${app.page.url()}`);
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
        assert.equal(app.failedRequests.length, 0, `failed requests: ${app.failedRequests.join('; ')}`);
    } finally { await app.close(); }
});

test('all 57 Case images resolve on the published site', live, async () => {
    const app = await openLiveApp();
    try {
        assert.equal((await caseCellIds(app.page)).length, 57, 'case list did not render');
        const rendered = await app.page.evaluate(() =>
            [...document.querySelectorAll('#cases_selection img')].length);
        assert.equal(rendered, 57, `case list rendered ${rendered} pictures, not 57`);
        const broken = await brokenImages(app.page);
        assert.equal(broken.length, 0, `broken case images: ${broken.join(', ')}`);
    } finally { await app.close(); }
});

test('the Selection persists across a reload on the published origin', live, async () => {
    const app = await openLiveApp();
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

test('a Goal entered on the published origin bumps the drawn Case weight', live, async () => {
    const app = await openLiveApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); });
        await clickPractice(app.page); // the Goal input lives in the Practice layout
        await app.page.fill('#goal_in', '1000');
        await app.page.keyboard.press('Tab'); // the input applies the Goal on change
        assert.equal(await app.page.evaluate(() => window.goal), 1000,
            `the Goal input did not take effect: window.goal = ${await app.page.evaluate(() => window.goal)}`);

        const drawn = await lastCase(app.page);

        // a slow solve of the drawn Case -> miss, weight doubles
        await app.page.evaluate(() => { document.getElementById('timer').innerHTML = '2.00'; appendStats(); });
        assert.equal(await app.page.evaluate(c => weightOfCase(c), drawn), 2,
            `a miss should double the drawn Case weight, got ${await app.page.evaluate(c => weightOfCase(c), drawn)}`);
        assert.equal(await app.page.evaluate(c => weightOfCase(c == 10 ? 20 : 10), drawn), 1,
            'the Case that did not solve keeps its weight');
    } finally { await app.close(); }
});

test('the published page credits Roman Strakhov and links the upstream repo', live, async () => {
    const app = await openLiveApp();
    try {
        const sidebar = await app.page.evaluate(() => document.querySelector('.selection_layout').textContent);
        assert.match(sidebar, /Roman Strakhov/, `the published page does not credit the original author: ${sidebar}`);
        assert.equal(await sidebarHref(app.page, 'Roman Strakhov'), UPSTREAM_REPO,
            'the credit on the published page must reach the original tool');
    } finally { await app.close(); }
});

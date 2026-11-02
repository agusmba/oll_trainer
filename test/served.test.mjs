// The deploy shape, proven over http://: raw files, served under a subpath the way
// GitHub Pages serves a user site, and nothing processed. App behaviour is proven in
// app.test.mjs, which runs against this same served origin.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { openServedApp, selectedCases, clickCase, caseCellIds, brokenImages } from './harness.mjs';

test('the app is served raw under a Pages-style subpath with no errors', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        assert.equal(app.page.url(), `${app.server.origin}/oll/index.html`, `unexpected url: ${app.page.url()}`);
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
        assert.equal(app.failedRequests.length, 0, `failed requests: ${app.failedRequests.join('; ')}`);
        assert.equal((await caseCellIds(app.page)).length, 57, 'case list did not render under the subpath');
    } finally { await app.close(); }
});

test('the app serves clean at the root of an origin, the Pages project-site shape', async () => {
    const app = await openServedApp({ prefix: '/' });
    try {
        assert.equal(app.page.url(), `${app.server.origin}/index.html`, `unexpected url: ${app.page.url()}`);
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
        assert.equal(app.failedRequests.length, 0, `failed requests: ${app.failedRequests.join('; ')}`);
        assert.equal((await caseCellIds(app.page)).length, 57, 'case list did not render at the origin root');
    } finally { await app.close(); }
});

test('case pictures are served as SVG, so the case list renders them', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        const svg = await app.page.request.get(new URL('pic/31.svg', app.server.url).href);
        assert.equal(svg.status(), 200, 'case picture not served');
        assert.match(svg.headers()['content-type'] ?? '', /image\/svg\+xml/,
            `case picture served as ${svg.headers()['content-type']}`);

        const brokenImgs = await brokenImages(app.page);
        assert.equal(brokenImgs.length, 0, `broken case images: ${brokenImgs.join(', ')}`);
    } finally { await app.close(); }
});

test('the Selection survives a reload that stays inside the subpath', async () => {
    const app = await openServedApp({ prefix: '/oll/' });
    try {
        await clickCase(app.page, 31); // deselect one of the default Selection
        assert.deepEqual(await selectedCases(app.page), [32]);

        await app.page.reload();
        assert.equal(app.page.url(), `${app.server.origin}/oll/index.html`,
            `reload left the subpath: ${app.page.url()}`);
        assert.deepEqual(await selectedCases(app.page), [32],
            'the Selection must come back from localStorage on the http origin');
        assert.equal(app.errors.length, 0, `errors after reload: ${app.errors.join('; ')}`);
        assert.equal(app.failedRequests.length, 0, `failed requests after reload: ${app.failedRequests.join('; ')}`);
    } finally { await app.close(); }
});

test('trunk ships a .nojekyll marker, and the served copy returns it raw', async () => {
    assert.ok(fs.existsSync(path.resolve(import.meta.dirname, '..', '.nojekyll')),
        'no .nojekyll at the repo root — Pages would run Jekyll over the app');

    const app = await openServedApp({ prefix: '/oll/' });
    try {
        const marker = await app.page.request.get(new URL('.nojekyll', app.server.url).href);
        assert.equal(marker.status(), 200, '.nojekyll is not reachable on the served copy');
    } finally { await app.close(); }
});

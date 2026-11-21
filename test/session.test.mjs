// The practice session across a reload: Mode, Goal, Weights and the Recap backlog come
// back from localStorage, the way the Selection and the times history already do. A phone
// browser does not restore form values, so these prove the app persists them itself, not
// that the browser happened to keep an input.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { openApp, clickPractice, clickRecap, lastCase, closeBrowser } from './harness.mjs';
import { serveRepo } from './server.mjs';

const PHONE = { width: 390, height: 844 };

let server;
before(async () => { server = await serveRepo({ prefix: '/oll/' }); });
after(async () => { await server.close(); await closeBrowser(); });

/// Open the app on a phone-sized, touch-driven screen.
async function openPhone() {
    return openApp({ url: server.url, viewport: PHONE, hasTouch: true, isMobile: true });
}

test('a Goal typed on a phone comes back after a reload', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        await app.page.fill('#goal_in', '1200');
        await app.page.keyboard.press('Tab');
        assert.equal(await app.page.evaluate(() => window.goal), 1200);

        await app.page.reload();

        const shown = await app.page.evaluate(() => document.getElementById('goal_in').value);
        assert.equal(await app.page.evaluate(() => window.goal), 1200,
            `the Goal was lost on reload; the goal input shows "${shown}"`);
        assert.equal(await app.page.evaluate(() => document.getElementById('goal_in').valueAsNumber), 1200,
            'the goal input must show the Goal in effect, not a Goal the app is not using');
        assert.equal(app.errors.length, 0, `errors after reload: ${app.errors.join('; ')}`);
    } finally { await app.close(); }
});

test('Practice Mode, Goal and Weights all come back after a reload', async () => {
    const app = await openPhone();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); });
        await clickPractice(app.page);
        await app.page.fill('#goal_in', '1000');
        await app.page.keyboard.press('Tab');

        // one Practice solve, recorded the way the clock records it
        const drawn = await app.page.evaluate(() => {
            document.getElementById('timer').innerHTML = '2.00'; // 2000 ms, slower than the Goal
            appendStats();
            return window.lastCase;
        });
        assert.equal(await app.page.evaluate(c => weightOfCase(c), drawn), 2,
            'precondition: a miss must double the drawn Case\'s Weight');

        await app.page.reload();

        assert.equal(await app.page.evaluate(() => document.querySelector('.practice_layout').style.display), 'initial',
            'the solve screen did not come back — Mode was lost on reload');
        assert.match(await app.page.evaluate(() => document.getElementById('selInfo').textContent), /practice mode/,
            'the info line does not say Practice Mode after a reload');
        assert.equal(await app.page.evaluate(() => window.goal), 1000, 'the Goal was lost on reload');
        const weights = await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]);
        assert.deepEqual(weights, drawn == 10 ? [2, 1] : [1, 2],
            `Weights were lost on reload: ${weights.join(', ')}`);
        assert.equal(app.errors.length, 0, `errors after reload: ${app.errors.join('; ')}`);
    } finally { await app.close(); }
});

test('Recap continues from its backlog after a reload', async () => {
    const app = await openPhone();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20, 30]; saveSelection(); });
        await clickRecap(app.page);
        const before = await app.page.evaluate(() => window.recapBacklog.slice());
        assert.equal(before.length, 2, 'Recap seeds from the Selection and draws the first Case off it');

        await app.page.reload();

        assert.match(await app.page.evaluate(() => document.getElementById('selInfo').textContent), /recap mode/,
            'the app came back in another Mode, so Recap was cut short');
        const after = await app.page.evaluate(() => window.recapBacklog.slice());
        const played = await lastCase(app.page);
        assert.equal(after.length, 1, `the Recap backlog was not carried across the reload: ${after.join(', ')}`);
        assert.ok(!after.includes(played), 'the reload replayed the Case that was already played');
        assert.deepEqual(after, before.filter(c => c != played),
            'the reload must replay exactly the Cases Recap had not reached');
    } finally { await app.close(); }
});

test('Weights earned against one Goal do not come back under another', async () => {
    const app = await openPhone();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); });
        await clickPractice(app.page);
        await app.page.fill('#goal_in', '1000');
        await app.page.keyboard.press('Tab');
        const drawn = await app.page.evaluate(() => {
            document.getElementById('timer').innerHTML = '2.00'; // 2000 ms, slower than the Goal
            appendStats();
            return window.lastCase;
        });
        assert.equal(await app.page.evaluate(c => weightOfCase(c), drawn), 2,
            'precondition: a miss must double the drawn Case\'s Weight');

        // a new Goal makes every Weight stale, so the reload must not resurrect them
        await app.page.fill('#goal_in', '1500');
        await app.page.keyboard.press('Tab');
        await app.page.reload();

        assert.equal(await app.page.evaluate(() => window.goal), 1500, 'the new Goal was lost on reload');
        const weights = await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]);
        assert.deepEqual(weights, [1, 1],
            `Weights earned against the old Goal came back under the new one: ${weights.join(', ')}`);
    } finally { await app.close(); }
});

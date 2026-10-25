import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    openApp, selectedCases, lastCase, isValidScramble, caseCellIds,
    clickCase, clickGroup, clickTrain, clickRecap,
} from './harness.mjs';

test('app loads with no console errors, page errors or failed requests', async () => {
    const app = await openApp();
    try {
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
        assert.equal(app.failedRequests.length, 0, `failed requests: ${app.failedRequests.join('; ')}`);

        const cells = await caseCellIds(app.page);
        assert.equal(cells.length, 57, `expected 57 case cells, got ${cells.length}`);

        const brokenImgs = await app.page.evaluate(() =>
            [...document.querySelectorAll('#cases_selection img')]
                .filter(img => !img.complete || img.naturalWidth === 0)
                .map(img => img.src));
        assert.equal(brokenImgs.length, 0, `broken case images: ${brokenImgs.join(', ')}`);
    } finally { await app.close(); }
});

test('selection defaults to cases 31 and 32 and persists across reload', async () => {
    const app = await openApp();
    try {
        assert.deepEqual(await selectedCases(app.page), [31, 32]);

        await clickCase(app.page, 31); // deselect 31
        assert.deepEqual(await selectedCases(app.page), [32]);
        assert.equal(await app.page.evaluate(() => document.getElementById('itemTd31').className), 'itemUnsel');

        // reload: persisted selection must survive, with no new errors
        await app.page.reload();
        assert.deepEqual(await selectedCases(app.page), [32]);
        assert.equal(app.errors.length, 0, `errors after reload: ${app.errors.join('; ')}`);
    } finally { await app.close(); }
});

test('group header toggles the whole group', async () => {
    const app = await openApp();
    try {
        // group toggle is relative: if any case in the group is selected, the group is cleared
        await app.page.evaluate(() => { window.selCases = []; saveSelection(); renderSelection(); });
        const group = await app.page.evaluate(() => window.algsGroups['P-Shapes'].slice());

        await clickGroup(app.page, 'P-Shapes');
        const sel = await selectedCases(app.page);
        assert.deepEqual(sel.slice().sort((a, b) => a - b), group.slice().sort((a, b) => a - b),
            `clicking the group header should select exactly the group, got ${sel.join(', ')}`);

        await clickGroup(app.page, 'P-Shapes'); // toggle back off
        assert.equal((await selectedCases(app.page)).length, 0);
    } finally { await app.close(); }
});

test('all/none header toggles 57 cases and updates the counter', async () => {
    const app = await openApp();
    try {
        // all/none is relative too: nothing selected means "select all"
        await app.page.evaluate(() => { window.selCases = []; saveSelection(); renderSelection(); });
        await app.page.click('#cases_selection td:has(b:text-is("All Cases (57)"))');
        assert.equal((await selectedCases(app.page)).length, 57);
        assert.equal(await app.page.evaluate(() => document.getElementById('csi').textContent), '57');

        await app.page.click('#cases_selection td:has(b:text-is("All Cases (57)"))');
        assert.equal((await selectedCases(app.page)).length, 0);
        assert.equal(await app.page.evaluate(() => document.getElementById('csi').textContent), '0');
    } finally { await app.close(); }
});

test('Train mode renders a legal scramble and enables the timer', async () => {
    const app = await openApp();
    try {
        await clickTrain(app.page);
        assert.equal(await app.page.evaluate(() => document.querySelector('.practice_layout').style.display), 'initial');

        const { moves, ok } = await isValidScramble(app.page);
        assert.ok(ok, `illegal scramble moves: ${moves.join(' ')}`);
        assert.ok(await app.page.evaluate(() => window.allowStartingTimer));
        assert.match(await app.page.evaluate(() => document.getElementById('selInfo').textContent), /train mode/);
    } finally { await app.close(); }
});

test('empty selection does not start the timer', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => { window.selCases = []; saveSelection(); });
        await clickTrain(app.page);
        assert.match(await app.page.evaluate(() => document.getElementById('scramble').textContent), /select cases/);
        assert.equal(await app.page.evaluate(() => window.allowStartingTimer), false);
    } finally { await app.close(); }
});

test('Recap goes through every selected case exactly once', async () => {
    const app = await openApp();
    try {
        const sel = await selectedCases(app.page); // [31, 32]
        await clickRecap(app.page);

        const seen = [await lastCase(app.page)];
        for (let k = 1; k < sel.length; ++k) {
            await app.page.evaluate(() => showScramble());
            seen.push(await lastCase(app.page));
        }

        assert.deepEqual(seen.slice().sort((a, b) => a - b), sel.slice().sort((a, b) => a - b),
            `recap should cover each selected case once, saw ${seen.join(', ')}`);
        assert.equal(await app.page.evaluate(() => window.recapArray.length), 0);
    } finally { await app.close(); }
});

test('space starts and stops the timer and records one time', async () => {
    const app = await openApp();
    try {
        await clickTrain(app.page);

        await app.page.keyboard.press('Space');
        await app.page.waitForTimeout(300);
        assert.equal(await app.page.evaluate(() => window.running), true);

        await app.page.keyboard.press('Space');
        assert.equal(await app.page.evaluate(() => window.running), false);

        const shown = await app.page.evaluate(() => document.getElementById('timer').textContent);
        assert.match(shown.trim(), /^\d+\.\d+$/, `timer text was "${shown}"`);

        const times = await app.page.evaluate(() => window.timesArray.slice());
        assert.equal(times.length, 1, `expected 1 recorded time, got ${times.length}`);
        assert.ok(await app.page.evaluate(() => document.getElementById('times').textContent.trim().length > 0));
    } finally { await app.close(); }
});

test('empty localStorage does not break the stats list', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => localStorage.clear());
        await app.page.reload();

        assert.ok(await app.page.evaluate(() => Array.isArray(window.timesArray)),
            'timesArray must be an array when nothing is stored');
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 0);
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
    } finally { await app.close(); }
});

test('goal adjusts the weight of the last case; goal 0 leaves weights alone', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.lastCase = 10;
            window.goal = 1000;
        });

        await app.page.evaluate(() => updateSelectedWeights(2000)); // slower than goal -> weight doubles
        assert.equal(await app.page.evaluate(() => window.selCasesWeights[0]), 2);
        assert.equal(await app.page.evaluate(() => window.selCasesWeights[1]), 1);

        await app.page.evaluate(() => updateSelectedWeights(500)); // faster than goal -> weight halves
        assert.equal(await app.page.evaluate(() => window.selCasesWeights[0]), 1);

        await app.page.evaluate(() => { window.goal = 0; updateSelectedWeights(9000); });
        assert.deepEqual(await app.page.evaluate(() => window.selCasesWeights.slice()), [1, 1]);
    } finally { await app.close(); }
});

test('a time equal to the goal halves the weight ("faster or equal" beats the goal)', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.lastCase = 10;
            window.goal = 1000;
        });

        await app.page.evaluate(() => updateSelectedWeights(1000)); // exactly the goal -> beaten
        assert.equal(await app.page.evaluate(() => window.selCasesWeights[0]), 0.5,
            `a solve at exactly the goal should halve its weight, got ${await app.page.evaluate(() => window.selCasesWeights[0])}`);
    } finally { await app.close(); }
});

test('a negative goal leaves weights alone', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.lastCase = 10;
            window.goal = -500; // number input has no min, so this is reachable
        });

        await app.page.evaluate(() => updateSelectedWeights(2000));
        assert.deepEqual(await app.page.evaluate(() => window.selCasesWeights.slice()), [1, 1],
            `a negative goal must disable dynamic weights, got ${await app.page.evaluate(() => window.selCasesWeights.slice().join(', '))}`);
    } finally { await app.close(); }
});

test('weights of a case outside the current selection are not touched', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.lastCase = 31; // solved earlier, no longer selected
            window.goal = 1000;
        });

        await app.page.evaluate(() => updateSelectedWeights(2000));
        const weights = await app.page.evaluate(() => ({
            values: window.selCasesWeights.slice(),
            keys: Object.keys(window.selCasesWeights),
        }));
        assert.deepEqual(weights.values, [1, 1], `weights changed: ${weights.values.join(', ')}`);
        assert.deepEqual(weights.keys, ['0', '1'],
            `a weight was written at an out-of-range index: ${weights.keys.join(', ')}`);
    } finally { await app.close(); }
});

test('the times list never prints an undefined weight', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.goal = 1000;
            window.timesArray = [
                { time: "1.00", ms: 1000, details: "R U R'", index: 0, case: 10 },
                { time: "2.00", ms: 2000, details: "R U R'", index: 1, case: 31 }, // no longer selected
            ];
            displayStats();
        });

        const shown = await app.page.evaluate(() => document.getElementById('times').textContent);
        assert.ok(!shown.includes('undefined'), `times list shows an undefined weight: ${shown}`);
        assert.match(shown, /\[weight: 1\]/, `selected case should show its weight: ${shown}`);
    } finally { await app.close(); }
});

test('the times list is ordered by algsinfo grouping', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.goal = 0;
            window.timesArray = [
                { time: "1.00", ms: 1000, details: "", index: 0, case: 33 },
                { time: "1.00", ms: 1000, details: "", index: 1, case: 21 },
                { time: "1.00", ms: 1000, details: "", index: 2, case: 26 },
                { time: "1.00", ms: 1000, details: "", index: 3, case: 1 },
            ];
            displayStats();
        });

        // read the case number out of each row's onclick="displayBox(event, N)"
        const order = await app.page.evaluate(() =>
            [...document.querySelectorAll('#times .ollNameStats')]
                .map(el => (el.getAttribute('onclick') || '').match(/displayBox\(event,\s*(\d+)/)?.[1]));
        // algsOrder: All Edges Oriented (26,27,21,..) then T-Shapes (33,45) then No Edges (1,..)
        assert.deepEqual(order, ['26', '21', '33', '1'],
            `times list order was ${order.join(', ')}`);
    } finally { await app.close(); }
});

test('recap solves do not change weights', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.goal = 1000;
        });

        await clickRecap(app.page); // recapArray = [10, 20]
        for (let k = 0; k < 2; ++k) {
            if (k > 0) await app.page.evaluate(() => showScramble()); // second solve empties recapArray
            // slow solve of a still-selected case
            await app.page.evaluate(() => {
                document.getElementById('timer').innerHTML = '2.00'; // 2000 ms, slower than goal
                appendStats();
            });
        }

        const weights = await app.page.evaluate(() => window.selCasesWeights.slice());
        assert.deepEqual(weights, [1, 1],
            `recap changed weights: ${weights.join(', ')} (last recap solve runs with recapArray empty)`);
    } finally { await app.close(); }
});

test('zero-weight cases are never picked by randomWeightedElement', async () => {
    const app = await openApp();
    try {
        const picks = await app.page.evaluate(() => {
            const out = [];
            for (let k = 0; k < 50; ++k) out.push(randomWeightedElement([10, 20], [0, 1]));
            return out;
        });
        assert.deepEqual(picks, Array(50).fill(20), `zero-weight case was picked: ${picks.join(', ')}`);
    } finally { await app.close(); }
});

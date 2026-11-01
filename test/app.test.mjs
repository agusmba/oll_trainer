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

test('a selected Case has weight 1; an unselected Case has no weight', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); });
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 1);
        assert.equal(await app.page.evaluate(() => weightOfCase(20)), 1);
        assert.equal(await app.page.evaluate(() => weightOfCase(31)), null,
            'a Case outside the Selection must have no weight');
    } finally { await app.close(); }
});

test('a solve slower than the Goal doubles the Case weight; a faster one halves it', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });

        await app.page.evaluate(() => bumpWeight(10, 2000, window.goal)); // slower than goal -> missed
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 2,
            'a miss should double the weight');
        assert.equal(await app.page.evaluate(() => weightOfCase(20)), 1,
            'a Case that did not solve keeps its weight');

        await app.page.evaluate(() => bumpWeight(10, 500, window.goal)); // faster than goal -> beaten
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 1,
            'a beat should halve the weight');
    } finally { await app.close(); }
});

test('a time equal to the goal halves the weight ("faster or equal" beats the goal)', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.goal = 1000;
        });

        await app.page.evaluate(() => bumpWeight(10, 1000, 1000)); // exactly the goal -> beaten
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 0.5,
            `a solve at exactly the goal should halve its weight, got ${await app.page.evaluate(() => weightOfCase(10))}`);
    } finally { await app.close(); }
});

test('weights saturate at 8 and bottom out at 1/8, so no case dominates or vanishes', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });

        // long slow streak: punishment stops at the ceiling
        await app.page.evaluate(() => { for (let k = 0; k < 20; ++k) bumpWeight(10, 9000, 1000); });
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 8,
            `slow streak should saturate at the ceiling, got ${await app.page.evaluate(() => weightOfCase(10))}`);

        // long goal-beating streak: punishment stops at the floor
        await app.page.evaluate(() => { for (let k = 0; k < 20; ++k) bumpWeight(20, 100, 1000); });
        assert.equal(await app.page.evaluate(() => weightOfCase(20)), 0.125,
            `fast streak should bottom out at 1/8, got ${await app.page.evaluate(() => weightOfCase(20))}`);

        // one slow solve climbs back off the floor: punishment stays recoverable
        await app.page.evaluate(() => bumpWeight(20, 9000, 1000));
        assert.equal(await app.page.evaluate(() => weightOfCase(20)), 0.25);
    } finally { await app.close(); }
});

test('a Goal of 0 or a negative Goal leaves weights alone', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
        });

        // number input has no min, so a negative goal is reachable
        await app.page.evaluate(() => { bumpWeight(10, 2000, 0); bumpWeight(20, 2000, -500); });
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 1, 'goal 0 must disable dynamic weights');
        assert.equal(await app.page.evaluate(() => weightOfCase(20)), 1, 'a negative goal must disable dynamic weights');
    } finally { await app.close(); }
});

test('bumping a Case outside the Selection is a no-op', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.goal = 1000;
        });

        // a Case solved earlier, no longer selected
        await app.page.evaluate(() => bumpWeight(31, 2000, 1000));
        assert.equal(await app.page.evaluate(() => weightOfCase(31)), null,
            'a Case outside the Selection must not gain a weight');
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 1, 'selected Case weight changed');
        assert.equal(await app.page.evaluate(() => weightOfCase(20)), 1, 'selected Case weight changed');
    } finally { await app.close(); }
});

test('pickWeightedCase draws over the Selection by Weight, deterministically for a given rng', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });
        await app.page.evaluate(() => { for (let k = 0; k < 2; ++k) bumpWeight(20, 9000, 1000); }); // 10 -> 1, 20 -> 4

        // weights are normalised implicitly: case 10 covers the first 1/5 of the draw
        const picks = await app.page.evaluate(() => [
            pickWeightedCase(window.selCases, () => 0),
            pickWeightedCase(window.selCases, () => 0.19),
            pickWeightedCase(window.selCases, () => 0.25),
            pickWeightedCase(window.selCases, () => 0.99),
        ]);
        assert.deepEqual(picks, [10, 10, 20, 20], `weighted draw was ${picks.join(', ')}`);

        assert.equal(await app.page.evaluate(() => pickWeightedCase([], () => 0.5)), null,
            'an empty Selection must draw no Case');
    } finally { await app.close(); }
});

test('pickWeightedCase never draws a Case with no Weight', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10]; saveSelection(); });
        // 31 is not in the Selection, so it has no Weight and must not be drawn
        const picks = await app.page.evaluate(() => {
            const out = [];
            for (let k = 0; k < 10; ++k) out.push(pickWeightedCase([10, 31], () => 0.2 + k / 20));
            return out;
        });
        assert.deepEqual(picks, Array(10).fill(10), `unselected Case was drawn: ${picks.join(', ')}`);
    } finally { await app.close(); }
});

test('the heavier Case is drawn wherever it sits in the Selection', async () => {
    const app = await openApp();
    try {
        // weights are keyed by Case, so Selection order is irrelevant
        await app.page.evaluate(() => { window.selCases = [20, 10]; saveSelection(); window.goal = 1000; });
        await app.page.evaluate(() => { for (let k = 0; k < 2; ++k) bumpWeight(10, 9000, 1000); }); // 10 -> 4, 20 -> 1
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 4);

        // total 5: the last 4/5 of the draw belongs to case 10, which sits second here
        const picks = await app.page.evaluate(() => [
            pickWeightedCase(window.selCases, () => 0.25),
            pickWeightedCase(window.selCases, () => 0.4),
            pickWeightedCase(window.selCases, () => 0.99),
        ]);
        assert.deepEqual(picks, [10, 10, 10], `heavier Case not drawn: ${picks.join(', ')}`);
    } finally { await app.close(); }
});

test('the times list prints "[weight: N]" only when a Goal is set and the Case is selected', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.goal = 1000;
            bumpWeight(20, 9000, 1000); // case 20 missed, weight 2
            window.timesArray = [
                { time: "1.00", ms: 1000, details: "R U R'", index: 0, case: 10 },
                { time: "1.50", ms: 1500, details: "R U R'", index: 1, case: 20 },
                { time: "2.00", ms: 2000, details: "R U R'", index: 2, case: 31 }, // no longer selected
            ];
            displayStats();
        });

        const shown = await app.page.evaluate(() => document.getElementById('times').textContent);
        assert.ok(!shown.includes('undefined'), `times list shows an undefined weight: ${shown}`);
        assert.match(shown, /\[weight: 1\]/, `selected case should show its weight: ${shown}`);
        assert.match(shown, /\[weight: 2\]/, `bumped case should show its weight: ${shown}`);
        assert.equal((shown.match(/\[weight:/g) || []).length, 2,
            `an unselected Case printed a weight: ${shown}`);

        // goal off -> no weights printed at all
        await app.page.evaluate(() => { window.goal = 0; displayStats(); });
        const off = await app.page.evaluate(() => document.getElementById('times').textContent);
        assert.ok(!off.includes('[weight:'), `weights printed with the goal off: ${off}`);
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

        const weights = await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]);
        assert.deepEqual(weights, [1, 1],
            `recap changed weights: ${weights.join(', ')} (last recap solve runs with recapArray empty)`);
    } finally { await app.close(); }
});

test('a recorded Practice solve bumps the last Case weight', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });
        await clickTrain(app.page);

        // slow solve of the drawn Case -> miss, weight doubles
        const drawn = await app.page.evaluate(() => {
            document.getElementById('timer').innerHTML = '2.00'; // 2000 ms, slower than the goal
            appendStats();
            return window.lastCase;
        });
        assert.equal(await app.page.evaluate(c => weightOfCase(c), drawn), 2,
            `a miss should double the drawn Case weight, got ${await app.page.evaluate(c => weightOfCase(c), drawn)}`);
        assert.equal(await app.page.evaluate(c => weightOfCase(c == 10 ? 20 : 10), drawn), 1,
            'the Case that did not solve keeps its weight');
    } finally { await app.close(); }
});

test('train draws are weighted by Weight, and never draw a Case outside the Selection', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.goal = 1000;
            for (let k = 0; k < 20; ++k) bumpWeight(10, 9000, 1000); // 10 at the ceiling
            for (let k = 0; k < 20; ++k) bumpWeight(20, 100, 1000); // 20 at the floor
        });
        await clickTrain(app.page);

        const drawn = await app.page.evaluate(() => {
            const out = [];
            for (let k = 0; k < 300; ++k) { showScramble(); out.push(window.lastCase); }
            return out;
        });
        assert.ok(drawn.every(c => c == 10 || c == 20), `drew a Case outside the Selection: ${drawn.join(', ')}`);
        const punished = drawn.filter(c => c == 20).length;
        assert.ok(punished > 0, 'the punished Case vanished from the draw');
        assert.ok(drawn.length - punished > punished * 2,
            `the ceiling Case does not dominate the draw: ${drawn.length - punished}/300 for case 10`);
    } finally { await app.close(); }
});

test('changing the Selection and clearing the session reset every weight', async () => {
    const app = await openApp();
    try {
        app.page.on('dialog', d => d.accept());
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });
        await app.page.evaluate(() => { for (let k = 0; k < 2; ++k) bumpWeight(10, 9000, 1000); }); // 10 -> 4
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 4);

        await clickCase(app.page, 20); // deselect 20: the practice contract changed
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 1,
            'a selection change must reset every weight');
        assert.equal(await app.page.evaluate(() => weightOfCase(20)), null,
            'a deselected Case has no weight');

        await app.page.evaluate(() => bumpWeight(10, 9000, 1000)); // 10 -> 2 again
        await clickTrain(app.page);
        await app.page.evaluate(() => {
            document.getElementById('timer').innerHTML = '2.00'; // slower than the goal
            appendStats();
        });
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 4, 'solve did not bump through the module');
        await app.page.click('#stats a:has-text("clear")'); // clear session
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 0, 'session was not cleared');
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 1,
            'clearing the session must reset every weight');
    } finally { await app.close(); }
});

test('applying a new Goal resets every Weight in the Selection', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });
        await clickTrain(app.page); // goal input lives on the practice page
        await app.page.evaluate(() => { for (let k = 0; k < 2; ++k) bumpWeight(10, 9000, 1000); }); // 10 -> 4
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 4);

        await app.page.fill('#goal_in', '500');
        await app.page.evaluate(() => document.getElementById('goal_in').dispatchEvent(new Event('change')));

        assert.equal(await app.page.evaluate(() => window.goal), 500);
        assert.deepEqual(await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]), [1, 1],
            'a Goal change must reset the whole Selection\'s weights');
    } finally { await app.close(); }
});

test('turning the Goal off (0) resets every Weight and stops printing weights', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.goal = 1000;
            for (let k = 0; k < 2; ++k) bumpWeight(10, 9000, 1000); // 10 -> 4
            window.timesArray = [
                { time: "2.00", ms: 2000, details: "R U R'", index: 0, case: 10 },
            ];
            displayStats();
        });
        await clickTrain(app.page); // goal input lives on the practice page
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 4);
        assert.match(await app.page.evaluate(() => document.getElementById('times').textContent), /\[weight: 4\]/);

        await app.page.fill('#goal_in', '0');
        await app.page.evaluate(() => document.getElementById('goal_in').dispatchEvent(new Event('change')));

        assert.equal(await app.page.evaluate(() => window.goal), 0);
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 1,
            'turning dynamic weights off must reset the Selection\'s weights');
        assert.equal(await app.page.evaluate(() => weightOfCase(20)), 1);
        const shown = await app.page.evaluate(() => document.getElementById('times').textContent);
        assert.ok(!shown.includes('[weight:'), `weights printed with the goal off: ${shown}`);
        assert.match(shown, /2\.00/, `the recorded time disappeared from the list: ${shown}`);
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 1, 'turning the goal off must keep the times history');
    } finally { await app.close(); }
});

test('emptying the Goal turns dynamic weights off and resets every Weight', async () => {
    const app = await openApp();
    try {
        await clickTrain(app.page); // goal input lives on the practice page
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); });
        await app.page.fill('#goal_in', '1000');
        await app.page.keyboard.press('Tab');
        await app.page.evaluate(() => { for (let k = 0; k < 2; ++k) bumpWeight(10, 9000, 1000); }); // 10 -> 4
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 4);

        // an empty number input is NaN: the Goal is off, so the Weights are stale
        await app.page.fill('#goal_in', '');
        await app.page.keyboard.press('Tab');

        assert.ok(Number.isNaN(await app.page.evaluate(() => window.goal)),
            `an emptied goal input should leave Goal unset, got ${await app.page.evaluate(() => window.goal)}`);
        assert.deepEqual(await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]), [1, 1],
            'turning dynamic weights off must reset the Selection\'s weights');
        const shown = await app.page.evaluate(() => document.getElementById('times').textContent);
        assert.ok(!shown.includes('[weight:'), `weights printed with the goal off: ${shown}`);
    } finally { await app.close(); }
});

test('the "reset weights" link uniformises every Weight and leaves the Selection and times history alone', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.goal = 1000;
            for (let k = 0; k < 2; ++k) bumpWeight(10, 9000, 1000); // 10 -> 4
            bumpWeight(20, 9000, 1000);                             // 20 -> 2
            window.timesArray = [
                { time: "2.00", ms: 2000, details: "R U R'", index: 0, case: 10 },
                { time: "3.00", ms: 3000, details: "R U R'", index: 1, case: 20 },
            ];
            displayStats();
        });
        await clickTrain(app.page); // the link sits beside the goal input on the practice page
        assert.deepEqual(await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]), [4, 2]);

        await app.page.click('#resetWeightsLink');

        assert.deepEqual(await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]), [1, 1],
            'the reset weights link must make every Weight uniform');
        assert.deepEqual(await selectedCases(app.page), [10, 20],
            'the reset weights link must not touch the Selection');
        const times = await app.page.evaluate(() => window.timesArray.map(t => [t.case, t.ms]));
        assert.deepEqual(times, [[10, 2000], [20, 3000]],
            'the reset weights link must not touch the times history');

        const shown = await app.page.evaluate(() => document.getElementById('times').textContent);
        assert.equal((shown.match(/\[weight: 1\]/g) || []).length, 2, `weights not uniformised in the list: ${shown}`);
        assert.match(shown, /2\.00/, `lost time 1: ${shown}`);
        assert.match(shown, /3\.00/, `lost time 2: ${shown}`);
    } finally { await app.close(); }
});

test('re-committing the same Goal keeps the Weights earned against it', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); });
        await clickTrain(app.page); // goal input lives on the practice page

        await app.page.fill('#goal_in', '1000');
        await app.page.keyboard.press('Tab');
        assert.equal(await app.page.evaluate(() => window.goal), 1000);

        await app.page.evaluate(() => { for (let k = 0; k < 2; ++k) bumpWeight(10, 9000, 1000); }); // 10 -> 4
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 4);

        // blur with no edit still fires change, so an untouched Goal must not reset the contract
        await app.page.fill('#goal_in', '1000');
        await app.page.keyboard.press('Tab');
        assert.deepEqual(await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]), [4, 1],
            'a Goal that did not change must not reset the weights earned against it');
    } finally { await app.close(); }
});

test('a punished Case stays drawable: bounded weights never drop a Case from the pool', async () => {
    const app = await openApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });
        await app.page.evaluate(() => {
            for (let k = 0; k < 20; ++k) bumpWeight(10, 9000, 1000); // 10 at the ceiling
            for (let k = 0; k < 20; ++k) bumpWeight(20, 100, 1000); // 20 at the floor
        });

        const picks = await app.page.evaluate(() => {
            const out = [];
            for (let k = 0; k < 600; ++k) out.push(pickWeightedCase(window.selCases));
            return out;
        });
        const punished = picks.filter(c => c == 20).length;
        assert.ok(punished > 0, 'the goal-beaten Case vanished from the draw entirely');
        assert.ok(picks.length - punished > punished,
            `the punished Case still dominates the draw: ${punished}/600`);
    } finally { await app.close(); }
});

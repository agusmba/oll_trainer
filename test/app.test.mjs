// The suite runs against a served copy under a Pages-style subpath rather than a
// local file: localStorage, relative asset paths and reloads must hold on an
// http:// origin, the way GitHub Pages serves the app.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
    openApp, selectedCases, lastCase, isValidScramble, caseCellIds, brokenImages,
    clickCase, clickGroup, clickPractice, clickRecap, closeBrowser, onScreen, boxOf, pressHoldRelease,
} from './harness.mjs';
import { serveRepo } from './server.mjs';

let server;
before(async () => { server = await serveRepo({ prefix: '/oll/' }); });
after(async () => { await server.close(); await closeBrowser(); });

/// Open the app over the served http:// origin. \returns what harness.openApp returns.
async function openServedApp() { return openApp({ url: server.url }); }

test('app loads over an http:// origin with no console errors, page errors or failed requests', async () => {
    const app = await openServedApp();
    try {
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
        assert.equal(app.failedRequests.length, 0, `failed requests: ${app.failedRequests.join('; ')}`);

        const cells = await caseCellIds(app.page);
        assert.equal(cells.length, 57, `expected 57 case cells, got ${cells.length}`);

        const brokenImgs = await brokenImages(app.page);
        assert.equal(brokenImgs.length, 0, `broken case images: ${brokenImgs.join(', ')}`);
    } finally { await app.close(); }
});

test('selection defaults to cases 31 and 32 and persists across reload', async () => {
    const app = await openServedApp();
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
    const app = await openServedApp();
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

test('group header count follows a single case click, without leaving Selection Mode', async () => {
    const app = await openServedApp();
    try {
        await app.page.evaluate(() => { window.selCases = []; saveSelection(); renderSelection(); });

        // What a visitor reads on the group header: "n/total", plus its pressed state.
        const header = (groupname) => app.page.evaluate(name => {
            const td = [...document.querySelectorAll('#cases_selection .group-head td')]
                .find(td => td.querySelector('b').textContent === name);
            return {
                count: td.querySelector('.group-count').textContent.trim(),
                pressed: td.getAttribute('aria-pressed'),
                cls: td.className,
            };
        }, groupname);

        assert.deepEqual(await header('P-Shapes'),
            { count: '0/4', pressed: 'false', cls: 'ollgrouptdUnsel' });

        await clickCase(app.page, 31); // 31 is in P-Shapes
        assert.deepEqual(await header('P-Shapes'),
            { count: '1/4', pressed: 'true', cls: 'ollgrouptdSel' },
            'the header must count the group\'s cases as they are clicked, not only after a re-render');

        await clickCase(app.page, 43);
        assert.equal((await header('P-Shapes')).count, '2/4');

        await clickCase(app.page, 31); // deselect again
        assert.equal((await header('P-Shapes')).count, '1/4');

        await clickCase(app.page, 43);
        assert.deepEqual(await header('P-Shapes'),
            { count: '0/4', pressed: 'false', cls: 'ollgrouptdUnsel' },
            'a group with nothing selected reads as unselected');

        // Clicking a case leaves the other groups' headers alone.
        assert.equal((await header('Squares')).count, '0/2');
        await clickCase(app.page, 5);
        assert.equal((await header('Squares')).count, '1/2');
        assert.equal((await header('P-Shapes')).count, '0/4');

        // Keyboard: Enter on a focused Case toggles it and keeps focus on that Case —
        // the header is repainted in place rather than the whole grid rebuilt.
        await app.page.locator('#itemTd5').focus();
        await app.page.keyboard.press('Enter');
        assert.equal((await header('Squares')).count, '0/2');
        assert.equal(await app.page.evaluate(() => document.activeElement.id), 'itemTd5',
            'toggling a Case from the keyboard must not throw away the focus it came from');
    } finally { await app.close(); }
});

test('all/none header toggles 57 cases and updates the counter', async () => {
    const app = await openServedApp();
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

test('Mode switching moves between Selection, Practice and Recap', async () => {
    const app = await openServedApp();
    try {
        assert.equal(await app.page.evaluate(() => document.querySelector('.selection_layout').style.display), 'initial',
            'the app opens in Selection Mode');

        await clickPractice(app.page);
        assert.equal(await app.page.evaluate(() => document.querySelector('.practice_layout').style.display), 'initial');
        assert.equal(await app.page.evaluate(() => document.querySelector('.selection_layout').style.display), 'none');
        assert.match(await app.page.evaluate(() => document.getElementById('selInfo').textContent), /^practice mode:/,
            'the mode pill still carries the leading "|" of the old two-column layout');

        // Practice and Recap are entered from the case list, so leave Practice first
        await app.page.click('#selectBtn');
        assert.equal(await app.page.evaluate(() => document.querySelector('.selection_layout').style.display), 'initial',
            'returning to the case list brings back Selection Mode');

        await clickRecap(app.page);
        assert.match(await app.page.evaluate(() => document.getElementById('selInfo').textContent), /recap mode/);
        const firstRecapCase = await lastCase(app.page);
        assert.equal(await app.page.evaluate(() => window.recapBacklog.length), 1,
            'Recap seeds its backlog from the Selection and draws the first Case off it');
        assert.ok(!(await app.page.evaluate(() => window.recapBacklog)).includes(firstRecapCase),
            'the Recap backlog must not still hold the Case already drawn');
    } finally { await app.close(); }
});

test('Practice Mode renders a legal scramble and enables the timer', async () => {
    const app = await openServedApp();
    try {
        await clickPractice(app.page);
        assert.equal(await app.page.evaluate(() => document.querySelector('.practice_layout').style.display), 'initial');

        const { moves, ok } = await isValidScramble(app.page);
        assert.ok(ok, `illegal scramble moves: ${moves.join(' ')}`);
        assert.ok(await app.page.evaluate(() => window.allowStartingTimer));
        assert.match(await app.page.evaluate(() => document.getElementById('selInfo').textContent), /practice mode/);
        assert.equal(app.failedRequests.length, 0, `failed requests: ${app.failedRequests.join('; ')}`);
    } finally { await app.close(); }
});

test('the scramble box shows the moves under its own title, without repeating it', async () => {
    const app = await openServedApp();
    try {
        await clickPractice(app.page);
        const shown = await app.page.evaluate(() => {
            const el = document.getElementById('scramble');
            return { text: el.textContent.trim(), title: getComputedStyle(el, '::before').content };
        });
        assert.ok(!/^\s*scramble:/i.test(shown.text), `the scramble repeats its own title: "${shown.text}"`);
        assert.match(shown.text, /^(R|L|U|D|F|B)(2|3)?(?=['\s])/,
            `the scramble does not open with a move: "${shown.text}"`);
        assert.match(shown.title, /Scramble/, 'the scramble box has no title of its own');
    } finally { await app.close(); }
});

test('empty selection does not start the timer', async () => {
    const app = await openServedApp();
    try {
        await app.page.evaluate(() => { window.selCases = []; saveSelection(); });
        await clickPractice(app.page);
        assert.match(await app.page.evaluate(() => document.getElementById('scramble').textContent), /select cases/);
        assert.equal(await app.page.evaluate(() => window.allowStartingTimer), false);

        // a press inside a refused selection never arms: no Timer focus, no gate, no solve
        const clock = await boxOf(app.page, '#timer');
        await app.page.mouse.move(clock.x + clock.width / 2, clock.y + clock.height / 2);
        await app.page.mouse.down();
        await app.page.waitForTimeout(650);
        assert.equal((await app.page.textContent('#timer')).trim(), 'ready',
            'a press inside an empty selection armed the clock');
        assert.ok(await onScreen(app.page, '.goal-row'), 'the empty-selection press entered Timer focus');
        await app.page.mouse.up();
        assert.equal(await app.page.evaluate(() => window.running), false,
            'the press-and-hold ran a solve with nothing selected');
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 0,
            'a solve was recorded with nothing selected');
    } finally { await app.close(); }
});

test('Recap goes through every selected case exactly once', async () => {
    const app = await openServedApp();
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
        assert.equal(await app.page.evaluate(() => window.recapBacklog.length), 0);
    } finally { await app.close(); }
});

test('space starts and stops the timer and records one time', async () => {
    const app = await openServedApp();
    try {
        await clickPractice(app.page);

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

test('a key pressed straight after a stop does not start the next solve', async () => {
    const app = await openServedApp();
    try {
        await clickPractice(app.page);
        await app.page.keyboard.press('Space');
        await app.page.waitForTimeout(150);
        await app.page.keyboard.press('Space'); // stop the solve
        const stopped = (await app.page.evaluate(() => document.getElementById('timer').textContent)).trim();

        // the hand that stopped the clock is still on the key
        await app.page.keyboard.press('Space');
        const gap = await app.page.evaluate(() => Date.now() - window.stopMiliseconds);
        assert.ok(gap < 500, `the follow-up key landed ${gap}ms after the stop, outside the window the fix must cover`);
        assert.equal(await app.page.evaluate(() => window.running), false,
            'a start inside the cooldown ran the next solve straight away');
        assert.equal((await app.page.evaluate(() => document.getElementById('timer').textContent)).trim(), stopped,
            'the clock left the stopped time, so the reader lost the time they had just made');
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 1,
            'the follow-up key produced a solve');

        // past the cooldown the clock answers again
        await app.page.evaluate(() => new Promise((r) => setTimeout(r, 600)));
        await app.page.keyboard.press('Space');
        assert.equal(await app.page.evaluate(() => window.running), true,
            'the clock stopped answering once the cooldown passed');
    } finally { await app.close(); }
});

test('the keyboard arms the clock into Timer focus, and Esc cancels the arm', async () => {
    const app = await openServedApp();
    try {
        await clickPractice(app.page);

        await app.page.keyboard.down('Space'); // press down, held
        assert.equal((await app.page.textContent('#timer')).trim(), '0.00',
            'Space press-down never read the armed clock');
        assert.equal(await app.page.evaluate(() => window.running), false,
            'pressing Space started the solve on its own');
        for (const sel of ['.topbar', '#scramble', '.goal-row', '#stats'])
            assert.ok(!(await onScreen(app.page, sel)), `${sel} is on screen during Timer focus`);

        await app.page.keyboard.up('Space');
        assert.equal(await app.page.evaluate(() => window.running), true,
            'the Space release did not start the solve');

        await app.page.keyboard.press('Escape'); // any key stops a running solve
        assert.equal(await app.page.evaluate(() => window.running), false,
            'Esc did not stop the running solve');
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 1,
            'the stopped solve did not record its time');
        assert.ok(await onScreen(app.page, '#scramble'), 'the interface stayed hidden after the stop');

        // Esc on an armed press drops the arm: no solve, and the interface comes back
        await app.page.evaluate(() => new Promise((r) => setTimeout(r, 600))); // past the cooldown
        await app.page.keyboard.down('Space');
        assert.ok(!(await onScreen(app.page, '.goal-row')), 'Space press-down never entered Timer focus');
        await app.page.keyboard.press('Escape');
        await app.page.keyboard.up('Space');
        assert.equal(await app.page.evaluate(() => window.running), false,
            'Esc on an armed press started a solve');
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 1,
            'the cancelled arm recorded a time');
        assert.ok(await onScreen(app.page, '.goal-row'), 'the interface stayed in Timer focus after the cancel');
    } finally { await app.close(); }
});

test('a key held through a stop does not arm the next solve', async () => {
    const app = await openServedApp();
    try {
        await clickPractice(app.page);
        await app.page.keyboard.down('Space');
        await app.page.keyboard.up('Space'); // the release starts the solve
        assert.equal(await app.page.evaluate(() => window.running), true,
            'the Space release did not start the solve');

        await app.page.keyboard.down('Space'); // the stop, with the key kept down
        assert.equal(await app.page.evaluate(() => window.running), false,
            'the held Space did not stop the solve');
        await app.page.evaluate(() => new Promise((r) => setTimeout(r, 600))); // past the Start cooldown
        for (const repeat of [1, 2]) { // the OS auto-repeat lands on the key that is still down
            await app.page.evaluate(() => {
                document.getElementById('bodyid').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
            });
        }
        assert.ok(await onScreen(app.page, '.goal-row'),
            'the held key entered Timer focus at its first repeat');
        assert.notEqual((await app.page.textContent('#timer')).trim(), '0.00',
            'the held key armed the clock at its first repeat');

        await app.page.keyboard.up('Space');
        assert.equal(await app.page.evaluate(() => window.running), false,
            'the held key started a solve on its release');
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 1,
            'the held key recorded a second solve');
    } finally { await app.close(); }
});

test('the words on screen say press and hold, Cancel, and Esc', async () => {
    const app = await openServedApp();
    try {
        await clickPractice(app.page);
        const caption = (await app.page.textContent('#timerCaption')).trim();
        assert.match(caption, /press and release to start/, `the keyboard caption is "${caption}"`);
        assert.match(caption, /Esc cancels/, `the keyboard caption never mentions Esc: "${caption}"`);

        const label = await app.page.getAttribute('#timer', 'aria-label');
        assert.match(label, /press and hold/, `the clock label is "${label}"`);
        assert.match(label, /Cancel/, `the clock label never says Cancel: "${label}"`);

        await app.page.click('#settingsToggle');
        const hint = await app.page.evaluate(() => {
            const row = [...document.querySelectorAll('#settingsSheet .sheet-row')]
                .find(r => r.textContent.includes('Timing'));
            return row ? row.textContent.replace(/\s+/g, ' ') : null;
        });
        assert.ok(hint, 'there is no Timing row in Settings');
        assert.match(hint, /press and hold/i, `the Timing note is "${hint}"`);
        assert.match(hint, /Timer focus/, `the Timing note never names Timer focus: "${hint}"`);
        assert.match(hint, /Esc cancels/i, `the Timing note never mentions Esc: "${hint}"`);
    } finally { await app.close(); }
});

test('the Start gate setting is the user\u0027s, clamped to 0..1000, stored, and quick-taps at 0', async () => {
    const app = await openServedApp();
    try {
        const field = app.page.locator('#startGate_in');
        const apply = async (text) => {
            await field.fill(text);
            await field.evaluate(el => el.dispatchEvent(new Event('change'))); // the page applies on change
        };

        assert.equal(await field.inputValue(), '500', 'the Start gate field does not show the default');
        assert.equal(await app.page.evaluate(() => window.startGateMs), 500,
            'the app does not read the gate from storage at load');

        await clickPractice(app.page);
        await app.page.click('#settingsToggle'); // the sheet is hidden until opened
        await apply('0');
        await app.page.keyboard.press('Escape'); // close the sheet: the clock is under it
        assert.equal(await app.page.evaluate(() => window.startGateMs), 0, 'the change never took effect');
        assert.equal(await app.page.evaluate(() => localStorage.getItem('zbllstartGateMs')), '0',
            'the gate is not stored');

        const clock = await boxOf(app.page, '#timer');
        const cx = clock.x + clock.width / 2, cy = clock.y + clock.height / 2;
        await pressHoldRelease(app.page, cx, cy, 120); // a quick tap
        assert.equal(await app.page.evaluate(() => window.running), true,
            'gate 0: a quick tap never started the solve');
        await app.page.click('#timer'); // stop
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 1,
            'the quick tap did not record its solve');

        await app.page.click('#settingsToggle');
        await apply('2000');
        assert.equal(await field.inputValue(), '1000', 'the field kept a gate above its range');
        assert.equal(await app.page.evaluate(() => localStorage.getItem('zbllstartGateMs')), '1000');
        await apply('');
        assert.equal(await app.page.evaluate(() => window.startGateMs), 500,
            'an empty gate field did not fall back to the default');

        // the gate survives a reload, as the sizes do
        await apply('800');
        await app.page.reload();
        assert.equal(await app.page.evaluate(() => window.startGateMs), 800,
            'the stored gate did not come back');
        assert.equal(await app.page.locator('#startGate_in').inputValue(), '800',
            'the field does not repaint the stored gate');
    } finally { await app.close(); }
});

test('empty localStorage does not break the stats list', async () => {
    const app = await openServedApp();
    try {
        await app.page.evaluate(() => localStorage.clear());
        await app.page.reload();

        assert.ok(await app.page.evaluate(() => Array.isArray(window.timesArray)),
            'timesArray must be an array when nothing is stored');
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 0);
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
    } finally { await app.close(); }
});

test('the times list prints "[weight: N]" only when a Goal is set and the Case is selected', async () => {
    const app = await openServedApp();
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
    const app = await openServedApp();
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

test('Recap solves do not change Weights, including the last Recap case', async () => {
    const app = await openServedApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.goal = 1000;
        });

        await clickRecap(app.page); // Recap backlog = [10, 20]
        for (let k = 0; k < 2; ++k) {
            if (k > 0) await app.page.evaluate(() => showScramble()); // second draw empties the backlog
            // slow solve of a still-selected case
            await app.page.evaluate(() => {
                document.getElementById('timer').innerHTML = '2.00'; // 2000 ms, slower than the Goal
                appendStats();
            });
            assert.match(await app.page.evaluate(() => document.getElementById('selInfo').textContent),
                /recap mode/, `Mode left Recap before its last solve was recorded (k=${k})`);
        }

        const weights = await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]);
        assert.deepEqual(weights, [1, 1],
            `Recap changed Weights: ${weights.join(', ')} (the last Recap solve runs on an empty backlog)`);
    } finally { await app.close(); }
});

test('Recap ends after its last solve and Practice resumes bumping Weights', async () => {
    const app = await openServedApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });
        await clickRecap(app.page);

        // replay every selected Case; the last Recap solve must still not touch Weights
        for (let k = 0; k < 2; ++k) {
            if (k > 0) await app.page.evaluate(() => showScramble()); // second draw empties the backlog
            await app.page.evaluate(() => {
                document.getElementById('timer').innerHTML = '2.00'; // slower than the Goal
                appendStats();
            });
        }
        assert.deepEqual(await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]), [1, 1],
            `a Recap solve touched Weights: ${await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)].join(', '))}`);

        // the next draw is Practice, and the info line says so
        await app.page.evaluate(() => showScramble());
        assert.match(await app.page.evaluate(() => document.getElementById('selInfo').textContent), /practice mode/,
            'the info line must agree with what the draw is doing once Recap ends');

        await app.page.evaluate(() => {
            document.getElementById('timer').innerHTML = '2.00';
            appendStats();
        });
        const drawn = await lastCase(app.page);
        assert.equal(await app.page.evaluate(c => weightOfCase(c), drawn), 2,
            `Practice draws must resume bumping Weights after Recap, got ${await app.page.evaluate(c => weightOfCase(c), drawn)}`);
    } finally { await app.close(); }
});

test('a recorded Practice solve bumps the last Case weight', async () => {
    const app = await openServedApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });
        await clickPractice(app.page);

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

test('Practice draws are weighted by Weight, and never draw a Case outside the Selection', async () => {
    const app = await openServedApp();
    try {
        await app.page.evaluate(() => {
            window.selCases = [10, 20];
            saveSelection();
            window.goal = 1000;
            for (let k = 0; k < 20; ++k) bumpWeight(10, 9000, 1000); // 10 at the ceiling
            for (let k = 0; k < 20; ++k) bumpWeight(20, 100, 1000); // 20 at the floor
        });
        await clickPractice(app.page);

        const drawn = await app.page.evaluate(() => {
            // A fixed draw sequence (mulberry32). Weights are bounded at 8 and 1/8,
            // so the punished Case is drawn about once in 65 times: with Math.random
            // the loop below misses it altogether roughly one run in a hundred, and
            // "punished > 0" is only an assertion when the sequence is known.
            let state = 0x9e3779b9;
            Math.random = () => {
                state = (state + 0x6d2b79f5) | 0;
                let t = Math.imul(state ^ (state >>> 15), 1 | state);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
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
    const app = await openServedApp();
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
        await clickPractice(app.page);
        await app.page.evaluate(() => {
            document.getElementById('timer').innerHTML = '2.00'; // slower than the goal
            appendStats();
        });
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 4, 'solve did not bump through the module');
        await app.page.click('#stats a:has-text("clear")'); // clear session
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 0, 'session was not cleared');
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 1,
            'clearing the session must reset every weight');
        assert.equal((await app.page.evaluate(() => document.getElementById('times').textContent)).trim(), '',
            'the times list on screen still shows the cleared session');

        // the clear has to survive a reload: the stored history is what a reload reads back
        await app.page.reload();
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 0,
            'the cleared session came back from localStorage on reload');
        assert.equal((await app.page.evaluate(() => document.getElementById('times').textContent)).trim(), '',
            'the cleared session is still on screen after a reload');
    } finally { await app.close(); }
});

test('applying a new Goal resets every Weight in the Selection', async () => {
    const app = await openServedApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); window.goal = 1000; });
        await clickPractice(app.page); // goal input lives on the practice page
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
    const app = await openServedApp();
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
        await clickPractice(app.page); // goal input lives on the practice page
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
    const app = await openServedApp();
    try {
        await clickPractice(app.page); // goal input lives on the practice page
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); });
        await app.page.fill('#goal_in', '1000');
        await app.page.keyboard.press('Tab');
        await app.page.evaluate(() => { for (let k = 0; k < 2; ++k) bumpWeight(10, 9000, 1000); }); // 10 -> 4
        assert.equal(await app.page.evaluate(() => weightOfCase(10)), 4);

        // an empty number input is NaN: the Goal is off, so the Weights are stale
        await app.page.fill('#goal_in', '');
        await app.page.keyboard.press('Tab');

        assert.equal(await app.page.evaluate(() => window.goal), 0,
            `an emptied goal input must read as Goal 0 (weights off), got ${await app.page.evaluate(() => window.goal)}`);
        assert.deepEqual(await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]), [1, 1],
            'turning dynamic weights off must reset the Selection\'s weights');
        const shown = await app.page.evaluate(() => document.getElementById('times').textContent);
        assert.ok(!shown.includes('[weight:'), `weights printed with the goal off: ${shown}`);
    } finally { await app.close(); }
});

test('the "reset weights" link uniformises every Weight and leaves the Selection and times history alone', async () => {
    const app = await openServedApp();
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
        await clickPractice(app.page); // the link sits beside the goal input on the practice page
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
    const app = await openServedApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); });
        await clickPractice(app.page); // goal input lives on the practice page

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

test('a reload brings back the Goal in Practice Mode, so Weights go live again', async () => {
    const app = await openServedApp();
    try {
        await app.page.evaluate(() => { window.selCases = [10, 20]; saveSelection(); });
        await clickPractice(app.page);
        await app.page.fill('#goal_in', '1200');
        await app.page.keyboard.press('Tab');
        assert.equal(await app.page.evaluate(() => window.goal), 1200);

        await app.page.reload();

        // Mode and the Goal are app-persisted, so the solve screen comes back on its own,
        // repainted to the Goal the store holds; the app must not lean on the browser
        // restoring the goal input for it.
        assert.equal(await app.page.evaluate(() => window.mode), 'practice',
            'the solve screen did not come back on reload');
        assert.equal(await app.page.evaluate(() => document.getElementById('goal_in').valueAsNumber), 1200,
            'the goal input must show the Goal in effect, not a Goal the app is not using');
        assert.equal(await app.page.evaluate(() => window.goal), 1200,
            'the Goal in effect must be the Goal the input shows');

        // weights come back uniform, not carried over (ADR-0001), and a solve bumps them
        assert.deepEqual(await app.page.evaluate(() => [weightOfCase(10), weightOfCase(20)]), [1, 1]);
        await app.page.evaluate(() => {
            document.getElementById('timer').innerHTML = '2.00'; // slower than the adopted goal
            appendStats();
        });
        const drawn = await app.page.evaluate(() => window.lastCase);
        assert.equal(await app.page.evaluate(c => weightOfCase(c), drawn), 2,
            `a solve after reload must bump against the adopted Goal, got ${await app.page.evaluate(c => weightOfCase(c), drawn)}`);
        assert.match(await app.page.evaluate(() => document.getElementById('times').textContent), /\[weight: 2\]/,
            'the times list must print weights again after a reload');
    } finally { await app.close(); }
});

test('a punished Case stays drawable: bounded weights never drop a Case from the pool', async () => {
    const app = await openServedApp();
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

// The interface on a phone. These prove the layout and the touch gestures rather than
// the practice rules: what fits on the screen, what a finger can hit, and what a tap
// does. They run against the same served origin as app.test.mjs.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
    openApp, clickCase, clickPractice, brokenImages, caseCellIds,
    tapCenter, viewport, boxOf, closeBrowser,
} from './harness.mjs';
import { serveRepo } from './server.mjs';

const PHONE = { width: 390, height: 844 };
const TOUCH = { viewport: PHONE, hasTouch: true, isMobile: true };

let server;
before(async () => { server = await serveRepo({ prefix: '/oll/' }); });
after(async () => { await server.close(); await closeBrowser(); });

/// Open the app on a phone-sized, touch-driven screen.
async function openPhone() {
    const app = await openApp({ url: server.url, ...TOUCH });
    app.screen = await viewport(app.page);
    return app;
}

/// \returns true when nothing on the page sticks out past the screen
async function scrollsSideways(page) {
    return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

test('the case grid fits a phone screen: it reflows instead of scrolling sideways', async () => {
    const app = await openPhone();
    try {
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
        assert.equal((await caseCellIds(app.page)).length, 57, 'the grid did not render');
        assert.equal((await brokenImages(app.page)).length, 0, 'a case picture did not render');
        assert.ok(!(await scrollsSideways(app.page)),
            'Selection Mode scrolls sideways on a phone — the grid must reflow');

        // every Case cell is a tap target that fits on the screen
        const cells = await app.page.evaluate(() => [...document.querySelectorAll('#cases_selection td[id^="itemTd"]')]
            .map(td => td.getBoundingClientRect().width));
        const tooSmall = cells.filter(w => w < 44);
        assert.equal(tooSmall.length, 0, `case cells too small to tap: ${tooSmall.join(', ')}`);
    } finally { await app.close(); }
});

test('Practice Mode fits a phone screen without scrolling sideways', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        assert.ok(!(await scrollsSideways(app.page)),
            'Practice Mode scrolls sideways on a phone — the solve must stack');
        const scramble = await boxOf(app.page, '#scramble');
        assert.ok(scramble.width <= app.screen.width, `scramble box is ${scramble.width} wide`);
    } finally { await app.close(); }
});

test('a long scramble wraps inside its box instead of overflowing the screen', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        await app.page.evaluate(() => {
            document.getElementById('scramble').innerHTML =
                'scramble: R U2 R\' U2 R\' U\' R2 U\' R\' U\' R U\' R2 U2 R\' U\' R\' U2 R\' U\' R\' F R F\' U2\' (R\' F R F\')';
        });
        const box = await boxOf(app.page, '#scramble');
        assert.ok(box.width <= app.screen.width, `scramble box is ${box.width} wide on a ${app.screen.width}px screen`);
        assert.ok(!(await scrollsSideways(app.page)), 'a long scramble pushes the page wider than the screen');
    } finally { await app.close(); }
});

test('Practice and Recap sit in the thumb zone at the bottom of the phone screen', async () => {
    const app = await openPhone();
    try {
        for (const id of ['#practiceButton', '#recapButton']) {
            const box = await boxOf(app.page, id);
            assert.ok(box, `${id} is not rendered`);
            assert.ok(box.height >= 52, `${id} is ${box.height}px tall - too short for a thumb`);
            assert.ok(box.y + box.height <= app.screen.height + 1,
                `${id} ends at ${box.y + box.height}, past the ${app.screen.height}px screen`);
            assert.ok(box.y >= app.screen.height * 0.7,
                `${id} sits at y=${box.y}, not near the bottom where the thumb rests`);
        }
        // side by side, so both actions are reachable without scrolling
        const practice = await boxOf(app.page, '#practiceButton');
        const recap = await boxOf(app.page, '#recapButton');
        assert.ok(practice.x < recap.x, 'Practice and Recap are stacked instead of side by side');
    } finally { await app.close(); }
});

test('the controls on the solve screen meet the touch size', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        await app.page.fill('#goal_in', '1000');
        await app.page.keyboard.press('Tab');
        await app.page.evaluate(() => {
            document.getElementById('timer').innerHTML = '2.00';
            appendStats();
        });

        for (const sel of ['#selectBtn', '#goal_in', '#resetWeightsLink', '#settingsToggle', '#themeToggle']) {
            const box = await boxOf(app.page, sel);
            assert.ok(box, `${sel} is not rendered`);
            assert.ok(box.height >= 44, `${sel} is ${box.height}px tall - below the 44px touch minimum`);
            assert.ok(box.width >= 44, `${sel} is ${box.width}px wide - below the 44px touch minimum`);
        }

        const timer = await boxOf(app.page, '#timer');
        assert.ok(timer.height >= 160, `the clock is only ${timer.height}px tall - too small to hit with a hand on the cube`);
        assert.ok(timer.width >= app.screen.width * 0.8, 'the clock does not span the screen, so a tap can miss it');

        const chip = await boxOf(app.page, '#times .timeResult, #times .timeResultBold');
        assert.ok(chip && chip.height >= 40, `a recorded time is ${chip && chip.height}px tall - too small to tap to delete`);
    } finally { await app.close(); }
});

test('press and release on the clock starts and stops the timer, as a StackMat does', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        assert.match(await app.page.textContent('#timer'), /tap to start/,
            'a touch screen should read the clock as a tap target');

        await tapCenter(app.page, '#timer');
        await app.page.waitForTimeout(250);
        assert.equal(await app.page.evaluate(() => window.running), true,
            'a tap on the clock did not start the timer');

        await tapCenter(app.page, '#timer');
        assert.equal(await app.page.evaluate(() => window.running), false,
            'a second tap did not stop the timer');
        const shown = await app.page.textContent('#timer');
        assert.match(shown.trim(), /^\d+\.\d+$/, `timer text was "${shown}"`);
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 1,
            'the solve was not recorded');
    } finally { await app.close(); }
});

test('a tap on a case picture selects it on a phone', async () => {
    const app = await openPhone();
    try {
        await tapCenter(app.page, '#itemTd31'); // default Selection holds 31 and 32
        assert.deepEqual(await app.page.evaluate(() => window.selCases.slice()), [32],
            'tapping a selected Case did not deselect it');
        assert.equal(await app.page.evaluate(() => document.getElementById('itemTd31').className), 'itemUnsel');
        await tapCenter(app.page, '#itemTd1');
        assert.deepEqual(await app.page.evaluate(() => window.selCases.slice()), [32, 1]);
    } finally { await app.close(); }
});

test('the settings sheet opens over the solve screen and Esc closes it', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        assert.equal(await app.page.evaluate(() => document.getElementById('settingsSheet').hidden), true,
            'the settings sheet starts closed');

        await tapCenter(app.page, '#settingsToggle');
        assert.equal(await app.page.evaluate(() => document.getElementById('settingsSheet').hidden), false,
            'tapping Settings did not open the sheet');
        assert.equal(await app.page.getAttribute('#settingsToggle', 'aria-expanded'), 'true',
            'Settings must say it is expanded');

        const panel = await boxOf(app.page, '.sheet-panel');
        assert.ok(panel && panel.y + panel.height <= app.screen.height + 1,
            `the sheet runs off the screen (${panel && panel.y} + ${panel && panel.height} > ${app.screen.height})`);

        // sizes still reach the clock from inside the sheet
        await tapCenter(app.page, '#settingsSheet button[aria-label="Increase timer size"]');
        assert.ok(await app.page.evaluate(() => window.timerSize > 60),
            'the timer size control inside the sheet did not reach the clock');

        await app.page.keyboard.press('Escape');
        assert.equal(await app.page.evaluate(() => document.getElementById('settingsSheet').hidden), true,
            'Esc did not close the sheet');
        assert.equal(await app.page.getAttribute('#settingsToggle', 'aria-expanded'), 'false');
    } finally { await app.close(); }
});

test('the keys a dialog is holding never reach the clock behind it', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        await tapCenter(app.page, '#settingsToggle');

        for (const key of ['Space', 'KeyA', 'Enter']) {
            await app.page.keyboard.press(key);
            assert.equal(await app.page.evaluate(() => window.running), false,
                `${key} pressed while the sheet was open started the clock behind it`);
        }
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 0,
            'a key pressed in the dialog recorded a time');

        await tapCenter(app.page, '#settingsDone');
        await app.page.keyboard.press('Space');
        assert.equal(await app.page.evaluate(() => window.running), true,
            'once the dialog is closed, Space must start the clock again');
        await app.page.keyboard.press('Space');
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 1);
    } finally { await app.close(); }
});

test('Tab walks the settings sheet and stays inside it', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        await tapCenter(app.page, '#settingsToggle');
        assert.equal(await app.page.evaluate(() => document.activeElement.id), 'settingsDone',
            'opening the sheet should put focus on its Done button');

        for (let k = 0; k < 8; ++k) {
            await app.page.keyboard.press('Tab');
            const inside = await app.page.evaluate(() =>
                !!document.activeElement && !!document.activeElement.closest('#settingsSheet .sheet-panel'));
            assert.ok(inside, `after ${k + 1} Tabs focus left the sheet at ${await app.page.evaluate(() => document.activeElement.id || document.activeElement.tagName)}`);
        }
    } finally { await app.close(); }
});

test('the case peek opens as a sheet within the screen and closes on Esc', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        await app.page.evaluate(() => displayBox(null, window.lastCase));
        assert.equal(await app.page.evaluate(() => document.getElementById('hintWindow').style.display), 'flex',
            'the case card did not open');

        const box = await boxOf(app.page, '#box');
        assert.ok(box && box.y >= 0 && box.y + box.height <= app.screen.height + 1,
            `the case card runs off the screen (${box && box.y} + ${box && box.height})`);
        assert.match(await app.page.textContent('#boxalg'), /[RLUDFB]/, 'the alg is not shown in the case card');
        assert.ok(await app.page.evaluate(() => document.getElementById('boxImg').complete
            && document.getElementById('boxImg').naturalWidth > 0), 'the case picture did not render in the card');

        await app.page.keyboard.press('Escape');
        assert.equal(await app.page.evaluate(() => document.getElementById('hintWindow').style.display), 'none');
    } finally { await app.close(); }
});

test('the theme switch repaints the app and survives a reload', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        assert.equal(await app.page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');

        const lightBg = await app.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await tapCenter(app.page, '#themeToggle');
        assert.equal(await app.page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark',
            'tapping the theme switch did not move to dark');
        const darkBg = await app.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        assert.notEqual(darkBg, lightBg, 'the repaint did not reach the page background');
        assert.match(await app.page.textContent('#themeToggle'), /Dark/,
            'the theme switch should say which theme is showing');

        await app.page.reload();
        assert.equal(await app.page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark',
            'the theme must come back from storage on reload');
        assert.equal(app.errors.length, 0, `errors after reload: ${app.errors.join('; ')}`);
    } finally { await app.close(); }
});

test('a tap inside a settings field does not reach the timer', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        await app.page.fill('#goal_in', '1200');
        assert.equal(await app.page.evaluate(() => window.running), false,
            'typing in the Goal field started the timer');
        assert.equal(await app.page.evaluate(() => window.goal), 0,
            'the Goal only takes effect once the field is committed');
        await app.page.keyboard.press('Tab');
        assert.equal(await app.page.evaluate(() => window.goal), 1200);
    } finally { await app.close(); }
});

test('the solve screen keeps its order on a phone: where you are, the scramble, the clock, the Goal, the times', async () => {
    const app = await openPhone();
    try {
        await clickPractice(app.page);
        const order = ['.topbar', '#scramble', '#timer', '.goal-row', '#stats'];
        const tops = [];
        for (const sel of order) {
            const box = await boxOf(app.page, sel);
            assert.ok(box, `${sel} is not rendered`);
            tops.push(box.y);
        }
        for (let i = 1; i < tops.length; ++i)
            assert.ok(tops[i] > tops[i - 1], `${order[i]} sits above ${order[i - 1]} (y=${tops[i]} vs ${tops[i - 1]})`);
    } finally { await app.close(); }
});

test('a Case toggles from the keyboard: focus reaches it, Enter presses it', async () => {
    const app = await openPhone();
    try {
        await app.page.focus('#itemTd31');
        assert.match(await app.page.getAttribute('#itemTd31', 'aria-label'), /^31 \S/,
            'a Case cell should be named by its number and case name');
        assert.equal(await app.page.getAttribute('#itemTd31', 'aria-pressed'), 'true',
            'a selected Case must read as pressed');

        await app.page.keyboard.press('Enter');
        assert.deepEqual(await app.page.evaluate(() => window.selCases.slice()), [32],
            'Enter on a focused Case did not deselect it');
        assert.equal(await app.page.getAttribute('#itemTd31', 'aria-pressed'), 'false');
        assert.equal(await app.page.evaluate(() => document.getElementById('itemTd31').className), 'itemUnsel');

        await app.page.keyboard.press('Enter');
        assert.deepEqual(await app.page.evaluate(() => window.selCases.slice()), [32, 31]);
    } finally { await app.close(); }
});

test('a group header is a toggle that says how much of the group is selected', async () => {
    const app = await openPhone();
    try {
        const header = app.page.locator('#cases_selection td[onclick*=selectOllGroup]').first();
        await header.focus();
        assert.equal(await header.getAttribute('role'), 'button');
        assert.match(await header.textContent(), /\d+\/\d+/, 'the header should count selected out of total');
        await app.page.keyboard.press('Enter');
        assert.equal(await header.getAttribute('aria-pressed'), 'true',
            'selecting the group should press its header toggle');
    } finally { await app.close(); }
});

test('keys cannot time a solve while Selection Mode is on screen', async () => {
    const app = await openPhone();
    try {
        for (const key of ['Space', 'KeyA', 'Enter']) {
            await app.page.keyboard.press(key);
            assert.equal(await app.page.evaluate(() => window.running), false,
                `${key} in Selection Mode started a hidden timer`);
        }
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 0,
            'a key in Selection Mode recorded a time');

        await clickPractice(app.page);
        await app.page.keyboard.press('Space');
        assert.equal(await app.page.evaluate(() => window.running), true,
            'Practice Mode must still answer Space');
        await app.page.keyboard.press('Space');
        assert.equal(await app.page.evaluate(() => window.timesArray.length), 1);
    } finally { await app.close(); }
});

test('no width from a small phone to a desktop scrolls sideways in any Mode', async () => {
    const app = await openApp({ url: server.url, viewport: { width: 390, height: 800 } });
    try {
        for (const width of [320, 360, 390, 700, 1024, 1440]) {
            await app.page.setViewportSize({ width, height: 800 });
            for (const mode of ['selection', 'practice', 'recap']) {
                await app.page.evaluate(m => changeMode(m), mode);
                assert.ok(!(await scrollsSideways(app.page)),
                    `${mode} Mode scrolls sideways at ${width}px wide`);
            }
            assert.equal((await caseCellIds(app.page)).length, 57, `the grid lost cases at ${width}px`);
        }
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
    } finally { await app.close(); }
});

test('a desktop screen puts the times beside the clock instead of under it', async () => {
    const app = await openApp({ url: server.url, viewport: { width: 1440, height: 900 } });
    try {
        await clickPractice(app.page);
        const timer = await boxOf(app.page, '#timer');
        const stats = await boxOf(app.page, '#stats');
        assert.ok(stats.x > timer.x + timer.width - 1,
            `the times panel (x=${stats.x}) is not to the right of the clock (ends at ${timer.x + timer.width})`);
        assert.ok(!(await scrollsSideways(app.page)), 'Practice Mode scrolls sideways on a desktop');
    } finally { await app.close(); }
});

test('the solve screen and the case grid use the whole window width', async () => {
    const app = await openApp({ url: server.url, viewport: { width: 1920, height: 900 } });
    try {
        await clickPractice(app.page);
        const screen = await viewport(app.page);
        const shell = await boxOf(app.page, '.app-shell');
        assert.ok(Math.abs(shell.width - screen.width) <= 2,
            `the practice shell is ${shell.width}px wide inside a ${screen.width}px window`);

        const stats = await boxOf(app.page, '#stats');
        assert.ok(stats.x + stats.width >= screen.width - 45,
            `the times panel stops at ${stats.x + stats.width}, leaving the right edge unused`);

        await app.page.evaluate(() => changeMode('selection'));
        const grid = await boxOf(app.page, '.selection-inner');
        assert.ok(Math.abs(grid.width - screen.width) <= 2,
            `the Selection column is ${grid.width}px wide inside a ${screen.width}px window`);
    } finally { await app.close(); }
});

test('the Goal strip keeps its own height and hands the rest to the history', async () => {
    const app = await openApp({ url: server.url, viewport: { width: 1440, height: 900 } });
    try {
        await clickPractice(app.page);
        const goal = await boxOf(app.page, '.goal-row');
        const times = await boxOf(app.page, '#times');
        assert.ok(goal.height <= 110, `the Goal strip takes ${goal.height}px of the column`);
        assert.ok(times.height >= 380, `the times history only gets ${times.height}px`);
        assert.ok(await app.page.evaluate(() => document.scrollingElement.scrollHeight
            <= window.innerHeight + 1), 'the solve screen scrolls past its own height');
    } finally { await app.close(); }
});

test('when the topbar runs short, only the status pill drops a line', async () => {
    const app = await openApp({ url: server.url, viewport: { width: 1440, height: 800 } });
    try {
        await clickPractice(app.page);

        // Roomy enough that the pill fits beside the buttons: one line, and the
        // pill sits right of "Select cases".
        for (const width of [1440, 900, 560]) {
            await app.page.setViewportSize({ width, height: 800 });
            const bar = await boxOf(app.page, '.topbar');
            const select = await boxOf(app.page, '#selectBtn');
            const pill = await boxOf(app.page, '#selInfo');
            assert.ok(bar.height <= 56, `at ${width}px the topbar wraps with room to spare (${bar.height}px)`);
            assert.ok(pill.x > select.x + select.width, `at ${width}px the pill is not beside the button`);
        }

        // Too short for the pill: it drops, and the buttons stay on the first line,
        // still against the right edge.
        for (const width of [520, 390, 360]) {
            await app.page.setViewportSize({ width, height: 800 });
            const bar = await boxOf(app.page, '.topbar');
            const select = await boxOf(app.page, '#selectBtn');
            const pill = await boxOf(app.page, '#selInfo');
            const theme = await boxOf(app.page, '#themeToggle');
            const settings = await boxOf(app.page, '#settingsToggle');
            assert.ok(bar.height > 56, `at ${width}px the topbar should have wrapped the pill`);
            assert.ok(theme.y < select.y + select.height && settings.y < select.y + select.height,
                `at ${width}px the theme and settings buttons left the first line`);
            assert.ok(pill.y >= select.y + select.height - 1,
                `at ${width}px the status pill did not drop below the buttons`);
            assert.ok(settings.x + settings.width >= (await viewport(app.page)).width - 45,
                `at ${width}px the buttons lost their right alignment`);
        }
    } finally { await app.close(); }
});

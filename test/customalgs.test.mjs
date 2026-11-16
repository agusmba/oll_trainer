// Custom algs on the Case card: the user can edit both Reference alg slots in place,
// move the Preferred star from one to the other, and bring a Case's built-in alg back
// from inside the slot's edit field. Everything is proven through the card itself and
// a full reload over the served origin.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { openApp, closeBrowser } from './harness.mjs';
import { serveRepo } from './server.mjs';

let server;
before(async () => { server = await serveRepo({ prefix: '/oll/' }); });
after(async () => { await server.close(); await closeBrowser(); });

/// Open the Case card for case i and wait for its alg slots to render.
async function openCard(page, i) {
    await page.evaluate(n => displayBox(null, n), i);
    await page.waitForSelector('#boxalg .alg-slot');
}

/// \returns the visible text of the k-th (0-based) alg slot on the card
function slotText(page, k) {
    return page.evaluate(n => {
        const slot = document.querySelectorAll('#boxalg .alg-slot')[n];
        return slot ? slot.querySelector('.alg-text').textContent : null;
    }, k);
}

/// Click the k-th slot's alg text, type a new alg into the field that replaces it,
/// and commit with Enter.
async function editSlot(page, k, alg) {
    await page.click(`#boxalg .alg-slot:nth-of-type(${k + 1}) .alg-text`);
    await page.waitForSelector('#boxalg input.alg-edit');
    await page.fill('#boxalg input.alg-edit', alg);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#boxalg input.alg-edit', { state: 'detached' });
}

const BUILTIN_31 = "(R' U' F) (U R U' R') F' R";

test('editing the first alg slot shows the edit in place', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        assert.equal(await slotText(app.page, 0), BUILTIN_31);

        await editSlot(app.page, 0, "R U R' U' R U2 R'");
        assert.equal(await slotText(app.page, 0), "R U R' U' R U2 R'");
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
        assert.equal(app.failedRequests.length, 0, `failed requests: ${app.failedRequests.join('; ')}`);
    } finally { await app.close(); }
});

test('a tap elsewhere in the card commits the edit and brings the whole row back', async () => {
    const app = await openApp({ url: server.url, viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
        await openCard(app.page, 31);
        await app.page.click('#boxalg .alg-slot:nth-of-type(1) .alg-text');
        await app.page.waitForSelector('#boxalg input.alg-edit');
        await app.page.fill('#boxalg input.alg-edit', "R U R' U' R U2 R'");

        await app.page.click('#boxTitle'); // a spot in the card that can take no focus
        await app.page.waitForSelector('#boxalg input.alg-edit', { state: 'detached' });

        assert.equal(await slotText(app.page, 0), "R U R' U' R U2 R'",
            'losing focus to the card must still save the edit');
        assert.ok((await slotViews(app.page))[0].star,
            'the row must return complete, star and all, not as a bare field');
        assert.equal(await app.page.evaluate(() =>
            getComputedStyle(document.getElementById('hintWindow')).display), 'flex',
            'a tap inside the card must not close it');
    } finally { await app.close(); }
});

test('a phone-sized card holds its shape when a row becomes a field and back', async () => {
    const app = await openApp({ url: server.url, viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
        await openCard(app.page, 31);
        const where = () => app.page.evaluate(() => {
            const box = document.getElementById('box');
            const px = el => Math.round(el.getBoundingClientRect().top);
            return [px(box), Math.round(box.getBoundingClientRect().height),
                    Math.round(document.getElementById('boxalg').getBoundingClientRect().height),
                    px(document.getElementById('boxsetup'))];
        });
        const before = await where();

        await app.page.click('#boxalg .alg-slot:nth-of-type(1) .alg-text');
        await app.page.waitForSelector('#boxalg input.alg-edit');
        assert.deepEqual(await where(), before,
            'the field must take exactly the box the text target had, so nothing on the card moves');

        await app.page.keyboard.press('Escape');
        await app.page.waitForSelector('#boxalg input.alg-edit', { state: 'detached' });
        assert.deepEqual(await where(), before, 'leaving the edit must put the card back where it was');
    } finally { await app.close(); }
});

test('a Custom alg survives a full reload', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        await editSlot(app.page, 0, "y R U R' U' R U2 R'");

        await app.page.reload();
        await openCard(app.page, 31);
        assert.equal(await slotText(app.page, 0), "y R U R' U' R U2 R'");
    } finally { await app.close(); }
});

test('an empty second slot is editable and its Custom alg survives a reload', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31); // case 31 ships no second alg
        assert.match((await slotText(app.page, 1)).toLowerCase(), /no alg/);

        await editSlot(app.page, 1, "R U r' U2 R U' R'");
        assert.equal(await slotText(app.page, 1), "R U r' U2 R U' R'");

        await app.page.reload();
        await openCard(app.page, 31);
        assert.equal(await slotText(app.page, 1), "R U r' U2 R U' R'");
    } finally { await app.close(); }
});

test('Esc abandons an edit without touching the stored alg or closing the card', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        await app.page.click('#boxalg .alg-slot:nth-of-type(1) .alg-text');
        await app.page.waitForSelector('#boxalg input.alg-edit');
        await app.page.fill('#boxalg input.alg-edit', "F R f' R' U R U' R'");
        await app.page.keyboard.press('Escape');
        await app.page.waitForSelector('#boxalg input.alg-edit', { state: 'detached' });

        assert.equal(await slotText(app.page, 0), BUILTIN_31);
        assert.equal(await app.page.evaluate(() =>
            document.getElementById('hintWindow').style.display), 'flex',
            'Esc inside an edit must not close the card');
    } finally { await app.close(); }
});

test('a Custom alg offers its built-in back in one tap, and only when it is Custom', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        await app.page.click('#boxalg .alg-slot:nth-of-type(2) .alg-text');
        await app.page.waitForSelector('#boxalg input.alg-edit');
        assert.equal(await app.page.locator('#boxalg .alg-restore').count(), 0,
            'a built-in slot has no built-in to restore');
        await app.page.keyboard.press('Escape');
        await app.page.waitForSelector('#boxalg input.alg-edit', { state: 'detached' });

        await editSlot(app.page, 1, "y2 F (R U R' U') f'");
        await app.page.click('#boxalg .alg-slot:nth-of-type(2) .alg-text');
        await app.page.waitForSelector('#boxalg .alg-restore');
        assert.ok(((await app.page.locator('#boxalg .alg-restore').getAttribute('aria-label')) ?? '').length > 1,
            'a mark with no word beside it has to name itself');
        await app.page.fill('#boxalg input.alg-edit', "R U R' U'"); // half-typed text the restore discards
        await app.page.click('#boxalg .alg-restore');
        await app.page.waitForSelector('#boxalg input.alg-edit', { state: 'detached' });

        assert.match((await slotText(app.page, 1)).toLowerCase(), /no alg/,
            'restoring must return the slot to its built-in, which for this Case is none');
        assert.equal(await app.page.evaluate(() =>
            JSON.parse(localStorage.getItem('ollCustomAlgs'))['31'] ?? null), null,
            'a Case back on its built-ins must stop being customized in the store');
        assert.equal(await slotText(app.page, 0), BUILTIN_31,
            'restoring one slot must leave the other alone');
    } finally { await app.close(); }
});

test('marking an alg moves nothing else on the card: there is no Reset to appear', async () => {
    const app = await openApp({ url: server.url, viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
        await openCard(app.page, 32);
        const tops = () => app.page.evaluate(() => [...document.querySelectorAll('#boxalg .alg-slot')]
            .map(slot => Math.round(slot.getBoundingClientRect().top)));
        const before = await tops();

        await app.page.click('#boxalg .alg-slot:nth-of-type(2) a.alg-star');
        assert.deepEqual(await tops(), before,
            'moving the mark must not add or move a row');
        assert.equal(await app.page.locator('#boxalg .alg-reset').count(), 0,
            'the card must not offer a Reset');
    } finally { await app.close(); }
});

test('the Setup line keeps deriving from the built-in alg however the slots are edited', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        const setup = await app.page.textContent('#boxsetup');

        await editSlot(app.page, 0, "R U R'");
        await editSlot(app.page, 1, "y2 R U2 R'");
        assert.equal(await app.page.textContent('#boxsetup'), setup,
            'Custom algs must not move the Setup line');

        await app.page.reload();
        await openCard(app.page, 31);
        assert.equal(await app.page.textContent('#boxsetup'), setup);
    } finally { await app.close(); }
});

test('editing algs never writes through to the built-in Case data', async () => {
    const app = await openApp({ url: server.url });
    try {
        const before = await app.page.evaluate(() =>
            JSON.stringify([algsInfo[31].a, algsInfo[31].a2]));

        await openCard(app.page, 31);
        await editSlot(app.page, 0, "totally replaced");
        await editSlot(app.page, 1, "also replaced");

        assert.equal(await app.page.evaluate(() =>
            JSON.stringify([algsInfo[31].a, algsInfo[31].a2])), before,
            'the shipped algsInfo entry must stay read-only');
    } finally { await app.close(); }
});

const BUILTIN_32_A = "R U B' (U' R' U) (R B R')";
const BUILTIN_32_A2 = "S (R U R' U') (R' F R f')";

/// \returns one view per slot, always in built-in order: its text, its star as the
/// markup shows it, and whether the row carries the Preferred mark
function slotViews(page) {
    return page.evaluate(() => [...document.querySelectorAll('#boxalg .alg-slot')].map(slot => {
        const star = slot.querySelector('.alg-star');
        return {
            text: slot.querySelector('.alg-text').textContent,
            star: star.textContent.trim(),
            starIsControl: star.tagName === 'A',
            preferred: slot.classList.contains('alg-slot-preferred'),
        };
    }));
}

test('slot one is Preferred by default: starred and marked, the other slot offers its star', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 32); // a Case whose built-in second alg is non-empty
        const views = await slotViews(app.page);
        assert.equal(views.length, 2, 'the card must offer exactly two alg slots');
        assert.equal(views[0].text, BUILTIN_32_A);
        assert.equal(views[0].star, '\u2605', 'the Preferred alg shows the filled star');
        assert.equal(views[0].starIsControl, false, 'the mark must not be a dead control');
        assert.equal(views[0].preferred, true);
        assert.equal(views[1].text, BUILTIN_32_A2);
        assert.equal(views[1].star, '\u2606', 'the other slot offers the mark as an outline star');
        assert.equal(views[1].starIsControl, true);
        assert.equal(views[1].preferred, false);
    } finally { await app.close(); }
});

test('tapping the other slot\'s star moves the mark, and the rows stay where they were', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 32);
        await app.page.click('#boxalg .alg-slot:nth-of-type(2) a.alg-star');
        const views = await slotViews(app.page);
        assert.equal(views[0].text, BUILTIN_32_A, 'the first row must not move');
        assert.equal(views[0].preferred, false);
        assert.equal(views[0].star, '\u2606', 'the mark must have left the first slot');
        assert.equal(views[1].text, BUILTIN_32_A2, 'the second row must not move');
        assert.equal(views[1].preferred, true);
        assert.equal(views[1].star, '\u2605');
        assert.equal(views[1].starIsControl, false, 'the Preferred star must not be a dead control');
    } finally { await app.close(); }
});

test('a star tap only marks: it never opens the edit field', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 32);
        await app.page.click('#boxalg .alg-slot:nth-of-type(2) a.alg-star');
        assert.equal(await app.page.locator('#boxalg input.alg-edit').count(), 0,
            'marking an alg must not start an edit');
        assert.equal(await slotText(app.page, 1), BUILTIN_32_A2, 'the marking must not change the text');
    } finally { await app.close(); }
});

test('the mark survives a reload, and the other star hands it back', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 32);
        await app.page.click('#boxalg .alg-slot:nth-of-type(2) a.alg-star');

        await app.page.reload();
        await openCard(app.page, 32);
        assert.equal((await slotViews(app.page))[1].preferred, true,
            'the Preferred alg must still be marked after a reload');

        await app.page.click('#boxalg .alg-slot:nth-of-type(1) a.alg-star');
        assert.equal((await slotViews(app.page))[0].preferred, true,
            'the first slot must be able to take the mark back');
        assert.equal(await app.page.evaluate(() =>
            JSON.parse(localStorage.getItem('ollCustomAlgs'))?.['32'] ?? null), null,
            'the default mark must store no preference at all');
    } finally { await app.close(); }
});

test('the card\'s alg controls are at least the touch minimum tall', async () => {
    const app = await openApp({ url: server.url, viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
        await openCard(app.page, 32);
        for (const sel of ['.alg-text', 'a.alg-star']) {
            const box = await app.page.locator(`#boxalg ${sel}`).first().boundingBox();
            assert.ok(box && box.height >= 44, `${sel} must be at least 44px tall, measured ${box?.height}`);
            if (sel === 'a.alg-star')
                assert.ok(box.width >= 44, `the star must be at least 44px wide, measured ${box.width}`);
        }
        await editSlot(app.page, 0, "y R U R' U' R U2 R'");
        await app.page.click('#boxalg .alg-slot:nth-of-type(1) .alg-text');
        await app.page.waitForSelector('#boxalg .alg-restore');
        const box = await app.page.locator('#boxalg .alg-restore').boundingBox();
        assert.ok(box.height >= 44, `the restore link must be at least 44px tall, measured ${box.height}`);
    } finally { await app.close(); }
});

test('the keyboard stays inside the card after star, restore and abandoning an edit', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 32);

        await app.page.focus('#boxalg .alg-slot:nth-of-type(2) a.alg-star');
        await app.page.keyboard.press('Enter');
        assert.equal((await slotViews(app.page))[1].preferred, true,
            'Enter on the star must mark that alg');
        assert.match(await app.page.evaluate(() => document.activeElement.className),
            /alg-text/, 'the star must leave focus on a slot, not on the body');

        await editSlot(app.page, 0, "y R U R' U'"); // committed; the slot is Custom now
        await app.page.click('#boxalg .alg-slot:nth-of-type(1) .alg-text');
        await app.page.waitForSelector('#boxalg .alg-restore');
        await app.page.focus('#boxalg .alg-restore');
        await app.page.keyboard.press('Enter');
        await app.page.waitForSelector('#boxalg input.alg-edit', { state: 'detached' });
        assert.equal(await slotText(app.page, 0), BUILTIN_32_A,
            'Enter on the restore must bring the built-in back');
        assert.match(await app.page.evaluate(() => document.activeElement.className),
            /alg-text/, 'restore must leave focus on a slot, not on the body');

        await app.page.click('#boxalg .alg-slot:nth-of-type(2) .alg-text'); // now the abandon path
        await app.page.waitForSelector('#boxalg input.alg-edit');
        await app.page.keyboard.press('Escape');
        await app.page.waitForSelector('#boxalg input.alg-edit', { state: 'detached' });
        assert.match(await app.page.evaluate(() => document.activeElement.className),
            /alg-text/, 'Esc must abandon back onto the slot');
    } finally { await app.close(); }
});

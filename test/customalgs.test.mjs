// Custom algs on the Case card: the user can edit both Reference alg slots in
// place, mark one Preferred, and Reset the Case back to its built-ins. Everything is
// proven through the card itself and a full reload over the served origin.

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

test('Reset appears only once something is customized and restores the built-ins in one tap', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        assert.equal(await app.page.locator('#boxalg .alg-reset').count(), 0,
            'a never-customized Case must not offer Reset');

        await editSlot(app.page, 1, "y2 F (R U R' U') f'");
        await app.page.click('#boxalg .alg-reset');
        await app.page.waitForFunction(() => !document.querySelector('#boxalg .alg-reset'));

        assert.equal(await slotText(app.page, 0), BUILTIN_31);
        assert.match((await slotText(app.page, 1)).toLowerCase(), /no alg/);
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

/// \returns one view per slot in display order: its text, its Preferred badge, its prefer link
function slotViews(page) {
    return page.evaluate(() => [...document.querySelectorAll('#boxalg .alg-slot')].map(slot => ({
        text: slot.querySelector('.alg-text').textContent,
        badge: slot.querySelector('.alg-badge')?.textContent?.trim() ?? null,
        prefer: slot.querySelector('.alg-prefer')?.textContent?.trim() ?? null,
    })));
}

test('slot one is Preferred by default: badged first, the other slot offers prefer', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 32); // a Case whose built-in second alg is non-empty
        const views = await slotViews(app.page);
        assert.equal(views.length, 2, 'the card must offer exactly two alg slots');
        assert.equal(views[0].text, BUILTIN_32_A);
        assert.equal(views[0].badge, 'preferred');
        assert.equal(views[1].text, BUILTIN_32_A2);
        assert.equal(views[1].badge, null);
        assert.equal(views[1].prefer, 'prefer');
    } finally { await app.close(); }
});

test('tapping prefer promotes that alg: marked and shown first', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 32);
        await app.page.click('#boxalg .alg-slot:nth-of-type(2) .alg-prefer');
        const views = await slotViews(app.page);
        assert.equal(views[0].text, BUILTIN_32_A2);
        assert.equal(views[0].badge, 'preferred');
        assert.equal(views[1].text, BUILTIN_32_A);
        assert.equal(views[1].prefer, 'prefer');
    } finally { await app.close(); }
});

test('the preference and its order survive a reload; Reset returns to the default order', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 32);
        await app.page.click('#boxalg .alg-slot:nth-of-type(2) .alg-prefer');

        await app.page.reload();
        await openCard(app.page, 32);
        assert.equal((await slotViews(app.page))[0].text, BUILTIN_32_A2,
            'the Preferred alg must come first again after a reload');

        await app.page.click('#boxalg .alg-reset');
        assert.equal((await slotViews(app.page))[0].text, BUILTIN_32_A);
        assert.equal(await app.page.locator('#boxalg .alg-reset').count(), 0,
            'Reset must hide once the Case is back on its built-ins');
    } finally { await app.close(); }
});

test('the card\'s alg controls are at least the touch minimum tall', async () => {
    const app = await openApp({ url: server.url, viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
        await openCard(app.page, 32);
        for (const sel of ['.alg-text', '.alg-prefer']) {
            const box = await app.page.locator(`#boxalg ${sel}`).first().boundingBox();
            assert.ok(box && box.height >= 44, `${sel} must be at least 44px tall, measured ${box?.height}`);
        }
        await editSlot(app.page, 0, "y R U R' U' R U2 R'");
        const box = await app.page.locator('#boxalg .alg-reset').boundingBox();
        assert.ok(box.height >= 44, `the reset link must be at least 44px tall, measured ${box.height}`);
    } finally { await app.close(); }
});

test('the keyboard stays inside the card after prefer, reset and abandoning an edit', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 32);

        await app.page.focus('#boxalg .alg-slot:nth-of-type(2) .alg-prefer');
        await app.page.keyboard.press('Enter');
        assert.match(await app.page.evaluate(() => document.activeElement.className),
            /alg-text/, 'prefer must leave focus on a slot, not on the body');

        await app.page.focus('#boxalg .alg-reset');
        await app.page.keyboard.press('Enter');
        assert.match(await app.page.evaluate(() => document.activeElement.className),
            /alg-text/, 'reset must leave focus on a slot, not on the body');

        await editSlot(app.page, 0, "y R U R' U'"); // committed; now try the abandon path
        await app.page.click('#boxalg .alg-slot:nth-of-type(2) .alg-text');
        await app.page.waitForSelector('#boxalg input.alg-edit');
        await app.page.keyboard.press('Escape');
        await app.page.waitForSelector('#boxalg input.alg-edit', { state: 'detached' });
        assert.match(await app.page.evaluate(() => document.activeElement.className),
            /alg-text/, 'Esc must abandon back onto the slot');
    } finally { await app.close(); }
});

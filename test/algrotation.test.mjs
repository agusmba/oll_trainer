// The Preferred alg governs the Case picture: when it opens with a y-rotation the
// picture turns by that rotation — directions verified against a rendered pic/31.svg,
// where y is 90 degrees clockwise on screen — and the rotation stays printed in the alg
// text, faint. The other slot's star is what moves the mark, and the picture turns with
// it. Nothing else turns it: leading x/z rotations and any rotation in the
// non-Preferred alg leave it upright, and the turn respects reduced motion.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { openApp, closeBrowser } from './harness.mjs';
import { serveRepo } from './server.mjs';

let server;
before(async () => { server = await serveRepo({ prefix: '/oll/' }); });
after(async () => { await server.close(); await closeBrowser(); });

// A CSS rotate(Ndeg) resolves to these matrices, so the assertions read the rotation
// the browser actually applied, not the string the app wrote.
const DEGREES = {
    none: 'none',
    90: 'matrix(0, 1, -1, 0, 0, 0)',
    180: 'matrix(-1, 0, 0, -1, 0, 0)',
    270: 'matrix(0, -1, 1, 0, 0, 0)',
};

async function openCard(page, i) {
    await page.evaluate(n => displayBox(null, n), i);
    await page.waitForSelector('#boxalg .alg-slot');
}

/// Overwrite the k-th (0-based) slot through the card's own editing and commit with Enter.
async function editSlot(page, k, alg) {
    await page.click(`#boxalg .alg-slot:nth-of-type(${k + 1}) .alg-text`);
    await page.waitForSelector('#boxalg input.alg-edit');
    await page.fill('#boxalg input.alg-edit', alg);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#boxalg input.alg-edit', { state: 'detached' });
}

// The turn is animated, so a reading taken right after a star tap lands mid-flight:
// settle the picture first, then read what the browser ended up applying.
async function pictureTransform(page) {
    await page.evaluate(async () => {
        const img = document.getElementById('boxImg');
        await Promise.all(img.getAnimations().map(a => a.finished.catch(() => {})));
    });
    return page.evaluate(() => getComputedStyle(document.getElementById('boxImg')).transform);
}

test('a Preferred alg starting with y turns the picture 90 degrees clockwise and renders the y faint', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        assert.equal(await pictureTransform(app.page), DEGREES.none,
            'the built-in alg of Case 31 has no y-rotation, so the picture must start upright');

        const alg = "y R U R' U' R U2 R'";
        await editSlot(app.page, 0, alg);

        assert.equal(await pictureTransform(app.page), DEGREES[90]);
        const faint = await app.page.evaluate(() =>
            [...document.querySelectorAll('#boxalg .alg-slot:first-of-type .alg-faint')]
                .map(el => el.textContent));
        assert.deepEqual(faint, ['y '], 'the applied rotation should render faint');
        assert.equal(await app.page.evaluate(() =>
            document.querySelector('#boxalg .alg-slot .alg-text').textContent), alg,
            'the rotation must still read in the alg text');
        assert.equal(app.errors.length, 0, `errors: ${app.errors.join('; ')}`);
        assert.equal(app.failedRequests.length, 0, `failed requests: ${app.failedRequests.join('; ')}`);
    } finally { await app.close(); }
});

test('y2, y\' and y2\' turn the picture 180, 270 and 180 degrees', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        for (const [alg, degrees] of [
            ["y2 R U R' U' R U2 R'", 180],
            ["y' R U R' U' R U2 R'", 270],
            ["y2' R U R' U' R U2 R'", 180], // y2' is the same turn as y2
        ]) {
            await editSlot(app.page, 0, alg);
            assert.equal(await pictureTransform(app.page), DEGREES[degrees],
                `${alg} should rotate the picture ${degrees} degrees`);
        }
    } finally { await app.close(); }
});

test('a parenthesized or padded leading y still counts', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        await editSlot(app.page, 0, "(y) R U R' U' R U2 R'");
        assert.equal(await pictureTransform(app.page), DEGREES[90]);
        assert.equal(await app.page.evaluate(() =>
            document.querySelector('#boxalg .alg-slot .alg-faint').textContent), '(y) ');
    } finally { await app.close(); }
});

test('a built-in alg that opens with y2 turns the picture with no edits at all', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 5); // built-in a: y2 R' F2 r U r' F R
        assert.equal(await pictureTransform(app.page), DEGREES[180]);
        assert.equal(await app.page.evaluate(() =>
            document.querySelector('#boxalg .alg-slot .alg-faint').textContent), 'y2 ');
    } finally { await app.close(); }
});

test('a leading x rotation never touches the picture', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        await editSlot(app.page, 0, "x' R U R' U' R U2 R'");
        assert.equal(await pictureTransform(app.page), DEGREES.none);
        assert.equal(await app.page.locator('#boxalg .alg-faint').count(), 0,
            'an x rotation is never applied to the picture, so nothing renders faint');
    } finally { await app.close(); }
});

test('the same rotation in the non-Preferred alg leaves the picture upright and the text bold', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        await editSlot(app.page, 1, "y R U R' U' R U2 R'"); // slot two: never preferred by default
        assert.equal(await pictureTransform(app.page), DEGREES.none);
        assert.equal(await app.page.locator('#boxalg .alg-faint').count(), 0);
    } finally { await app.close(); }
});

test('moving the Preferred mark takes the picture with it, and back', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 32);
        await editSlot(app.page, 1, "y2 R U R' U' R U2 R'");
        assert.equal(await pictureTransform(app.page), DEGREES.none,
            'a y-rotation in the non-Preferred alg must not turn the picture');

        await app.page.click('#boxalg .alg-slot:nth-of-type(2) a.alg-star');
        assert.equal(await pictureTransform(app.page), DEGREES[180],
            'marking that alg must turn the picture to its leading rotation');

        await app.page.reload();
        await openCard(app.page, 32);
        assert.equal(await pictureTransform(app.page), DEGREES[180],
            'the rotated picture must come back rotated after a reload');

        await app.page.click('#boxalg .alg-slot:nth-of-type(1) a.alg-star');
        assert.equal(await pictureTransform(app.page), DEGREES.none,
            'marking an alg with no leading rotation must set the picture upright again');
    } finally { await app.close(); }
});

test('the turn is animated by default and still when the reader asks for less motion', async () => {
    const app = await openApp({ url: server.url });
    try {
        await openCard(app.page, 31);
        const timed = () => app.page.evaluate(() =>
            getComputedStyle(document.getElementById('boxImg')).transitionProperty);
        assert.equal(await timed(), 'transform', 'the turn should be animated by default');
        await app.page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await timed(), 'none', 'reduced motion must take the animation away');
    } finally { await app.close(); }
});

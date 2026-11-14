// The Weights core — the half/double rule, the 8 and 1/8 clamps (ADR-0001) and the
// weighted draw — proven headless: scripts/weights.js is pure logic, so it runs in a
// node:vm sandbox instead of a chromium context. The wiring into the app stays in
// app.test.mjs, where the page's own globals (weightOfCase, bumpWeight) are still read
// through page.evaluate and the draw is exercised through showScramble.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SOURCE = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'scripts', 'weights.js'), 'utf8');

/// A fresh weights module, so a Weight map from one test cannot leak into the next the
/// way a fresh page context used to isolate it.
function loadWeights() {
    const ctx = vm.createContext({ Math });
    ctx.window = ctx; // the app reads these globals off window; in a sandbox, window is the sandbox
    vm.runInContext(SOURCE, ctx);
    const fn = name => vm.runInContext(name, ctx);
    return {
        /// Puts a Selection's Weights at 1 — exactly what saveSelection() triggers in the app.
        select: cases => {
            ctx.selCases = cases.slice();
            fn('resetWeights')();
        },
        weightOf: caseNum => fn('weightOfCase')(caseNum),
        bump: (caseNum, ms, goal) => fn('bumpWeight')(caseNum, ms, goal),
        pick: (cases, rng) => fn('pickWeightedCase')(cases, rng),
    };
}

test('a selected Case has weight 1; an unselected Case has no weight', () => {
    const w = loadWeights();
    w.select([10, 20]);
    assert.equal(w.weightOf(10), 1);
    assert.equal(w.weightOf(20), 1);
    assert.equal(w.weightOf(31), null, 'a Case outside the Selection must have no weight');
});

test('a solve slower than the Goal doubles the Case weight; a faster one halves it', () => {
    const w = loadWeights();
    w.select([10, 20]);
    w.bump(10, 2000, 1000); // slower than goal -> missed
    assert.equal(w.weightOf(10), 2, 'a miss should double the weight');
    assert.equal(w.weightOf(20), 1, 'a Case that did not solve keeps its weight');
    w.bump(10, 500, 1000); // faster than goal -> beaten
    assert.equal(w.weightOf(10), 1, 'a beat should halve the weight');
});

test('a time equal to the goal halves the weight ("faster or equal" beats the goal)', () => {
    const w = loadWeights();
    w.select([10, 20]);
    w.bump(10, 1000, 1000); // exactly the goal -> beaten
    assert.equal(w.weightOf(10), 0.5,
        `a solve at exactly the goal should halve its weight, got ${w.weightOf(10)}`);
});

test('weights saturate at 8 and bottom out at 1/8, so no case dominates or vanishes', () => {
    const w = loadWeights();
    w.select([10, 20]);

    // long slow streak: punishment stops at the ceiling
    for (let k = 0; k < 20; ++k) w.bump(10, 9000, 1000);
    assert.equal(w.weightOf(10), 8, `slow streak should saturate at the ceiling, got ${w.weightOf(10)}`);

    // long goal-beating streak: punishment stops at the floor
    for (let k = 0; k < 20; ++k) w.bump(20, 100, 1000);
    assert.equal(w.weightOf(20), 0.125, `fast streak should bottom out at 1/8, got ${w.weightOf(20)}`);

    // one slow solve climbs back off the floor: punishment stays recoverable
    w.bump(20, 9000, 1000);
    assert.equal(w.weightOf(20), 0.25);
});

test('a Goal of 0 or a negative Goal leaves weights alone', () => {
    const w = loadWeights();
    w.select([10, 20]);

    // number input has no min, so a negative goal is reachable
    w.bump(10, 2000, 0);
    w.bump(20, 2000, -500);
    assert.equal(w.weightOf(10), 1, 'goal 0 must disable dynamic weights');
    assert.equal(w.weightOf(20), 1, 'a negative goal must disable dynamic weights');
});

test('bumping a Case outside the Selection is a no-op', () => {
    const w = loadWeights();
    w.select([10, 20]);

    // a Case solved earlier, no longer selected
    w.bump(31, 2000, 1000);
    assert.equal(w.weightOf(31), null, 'a Case outside the Selection must not gain a weight');
    assert.equal(w.weightOf(10), 1, 'selected Case weight changed');
    assert.equal(w.weightOf(20), 1, 'selected Case weight changed');
});

test('pickWeightedCase draws over the Selection by Weight, deterministically for a given rng', () => {
    const w = loadWeights();
    w.select([10, 20]);
    for (let k = 0; k < 2; ++k) w.bump(20, 9000, 1000); // 10 -> 1, 20 -> 4

    // weights are normalised implicitly: case 10 covers the first 1/5 of the draw
    const picks = [0, 0.19, 0.25, 0.99].map(r => w.pick([10, 20], () => r));
    assert.deepEqual(picks, [10, 10, 20, 20], `weighted draw was ${picks.join(', ')}`);

    assert.equal(w.pick([], () => 0.5), null, 'an empty Selection must draw no Case');
});

test('pickWeightedCase never draws a Case with no Weight', () => {
    const w = loadWeights();
    w.select([10]);

    // 31 is not in the Selection, so it has no Weight and must not be drawn
    const picks = Array.from({ length: 10 }, (_, k) => w.pick([10, 31], () => 0.2 + k / 20));
    assert.deepEqual(picks, Array(10).fill(10), `unselected Case was drawn: ${picks.join(', ')}`);
});

test('the heavier Case is drawn wherever it sits in the Selection', () => {
    const w = loadWeights();

    // weights are keyed by Case, so Selection order is irrelevant
    w.select([20, 10]);
    for (let k = 0; k < 2; ++k) w.bump(10, 9000, 1000); // 10 -> 4, 20 -> 1
    assert.equal(w.weightOf(10), 4);

    // total 5: the last 4/5 of the draw belongs to case 10, which sits second here
    const picks = [0.25, 0.4, 0.99].map(r => w.pick([20, 10], () => r));
    assert.deepEqual(picks, [10, 10, 10], `heavier Case not drawn: ${picks.join(', ')}`);
});

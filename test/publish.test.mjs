// What a visitor at the deployed URL sees: who wrote the original tool, and links
// that reach this fork rather than upstream. Proven on the served page, not the file.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openServedApp } from './harness.mjs';

const FORK_REPO = 'https://github.com/agusmba/oll_trainer';
const UPSTREAM_REPO = 'https://github.com/Roman-/oll_trainer';

/// href of the sidebar anchor whose visible text is `label`, or null if absent.
function sidebarHref(page, label) {
    return page.evaluate(text => {
        const link = [...document.querySelectorAll('.selection_layout a')].find(a => a.textContent.trim() === text);
        return link ? link.href : null;
    }, label);
}

/// hrefs of every anchor on the page.
function pageLinks(page) {
    return page.evaluate(() => [...document.querySelectorAll('a')].map(a => a.href));
}

test('the sidebar credits Roman Strakhov as the original author', async () => {
    const app = await openServedApp();
    try {
        const text = await app.page.evaluate(() => document.querySelector('.selection_layout').textContent);
        assert.match(text, /Roman Strakhov/, `sidebar does not credit the original author: ${text}`);

        const creditHref = await sidebarHref(app.page, 'Roman Strakhov');
        assert.equal(creditHref, UPSTREAM_REPO,
            `the credit must reach the original tool, got ${creditHref}`);
    } finally { await app.close(); }
});

test('the sidebar repo and offline-download links point at the fork', async () => {
    const app = await openServedApp();
    try {
        assert.equal(await sidebarHref(app.page, 'click'), FORK_REPO,
            'the GitHub repo link must point at the fork');
        assert.equal(await sidebarHref(app.page, 'zip'), `${FORK_REPO}/archive/main.zip`,
            'the offline download must come from the fork');
    } finally { await app.close(); }
});

test("bug reports land on the fork's issues, not the upstream forum thread", async () => {
    const app = await openServedApp();
    try {
        const hrefs = await pageLinks(app.page);
        assert.ok(!hrefs.some(h => h.includes('speedsolving.com')),
            `a link still points at the forum thread: ${hrefs.join(', ')}`);
        assert.ok(hrefs.includes(`${FORK_REPO}/issues`), `no bug-report link to the fork's issues: ${hrefs.join(', ')}`);

        // both affordances — the practice page footer and the sidebar — must be usable
        const mentions = await app.page.evaluate(issuesUrl =>
            [...document.querySelectorAll(`a[href="${issuesUrl}"]`)].map(a => a.textContent.trim()),
            `${FORK_REPO}/issues`);
        assert.ok(mentions.length >= 2, `only one bug-report affordance: ${mentions.join(', ')}`);
    } finally { await app.close(); }
});

// The lint gate itself, proven on throwaway trees rather than on this repo: a file the
// browser would choke on, and a reference to an asset that is not there.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { lint } from '../dev/lint.mjs';

function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-'));
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'styles'));
    fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'var allowStartingTimer;\n');
    fs.writeFileSync(path.join(dir, 'styles', 'main.css'), 'body {}\n');
    fs.writeFileSync(path.join(dir, 'index.html'),
        `<link href="styles/main.css?v1">\n<script src="scripts/timer.js?v3"></script>\n`);
    return dir;
}

const clean = dir => fs.rmSync(dir, { recursive: true, force: true });

test('a clean tree passes', () => {
    const dir = fixture();
    try {
        assert.deepEqual(lint(dir), []);
    } finally { clean(dir); }
});

test('a lone CR in a shipped file is reported', () => {
    const dir = fixture();
    try {
        // The failure this scan exists for: a rewrite that spliced a carriage return in
        // with no line feed after it, leaving a statement the browser stops parsing.
        fs.writeFileSync(path.join(dir, 'scripts', 'ui.js'), 'function applystyle() {\r}\n');
        const problems = lint(dir);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /scripts\/ui\.js contains a lone CR byte/);
    } finally { clean(dir); }
});

test('a file that is entirely CRLF is left alone', () => {
    const dir = fixture();
    try {
        // scripts/algsmap.js ships as CRLF from upstream: legal line endings, not damage.
        fs.writeFileSync(path.join(dir, 'scripts', 'algsmap.js'), 'var algsMap = {\r\n};\r\n');
        assert.deepEqual(lint(dir), []);
    } finally { clean(dir); }
});

test('a file the browser would fail to parse is reported', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'function displayStats() { const a = (b;\n');
        const problems = lint(dir);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /scripts\/timer\.js: /);
    } finally { clean(dir); }
});

test('a reference to an asset that is not in the repo is reported', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'index.html'),
            `<link href="styles/selection.css?v1">\n<script src="scripts/timer.js?v3"></script>\n`);
        const problems = lint(dir);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /references styles\/selection\.css/);
    } finally { clean(dir); }
});

test('links to other sites are not treated as repo files', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'index.html'),
            fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
                + `<a href="https://agusmba.github.io/oll_trainer/">repo</a>\n<a href="#anchor">anchor</a>\n`);
        assert.deepEqual(lint(dir), []);
    } finally { clean(dir); }
});

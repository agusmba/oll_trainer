import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bumpVersion } from '../dev/bump-version.mjs';

const CLI = path.resolve(import.meta.dirname, '../dev/bump-version.mjs');

function git(args, cwd) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/// A throwaway repo: trunk at scripts/?v3, styles/?v1, plus a branch off it.
function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-version-'));
    git(['init', '-q', '-b', 'main'], dir);
    git(['config', 'user.email', 'test@example.com'], dir);
    git(['config', 'user.name', 'Test'], dir);
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'styles'));
    fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'export const v = 0;\n');
    fs.writeFileSync(path.join(dir, 'styles', 'main.css'), 'body {}\n');
    fs.writeFileSync(path.join(dir, 'index.html'),
        `<link href="styles/main.css?v1">\n<script src="scripts/timer.js?v3"></script>\n`);
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'trunk'], dir);
    git(['checkout', '-q', '-b', 'feature'], dir);
    return dir;
}

function versions(dir) {
    return fs.readFileSync(path.join(dir, 'index.html'), 'utf8').match(/\?v\d+/g);
}

const clean = dir => fs.rmSync(dir, { recursive: true, force: true });

/// Run the CLI as a subprocess: \returns { code, out }
function runCli(args, cwd) {
    try {
        return { code: 0, out: execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }) };
    } catch (e) {
        return { code: e.status, out: e.stdout ?? '' };
    }
}

test('branch raises each changed asset group by exactly one over trunk', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'export const v = 2;\n');
        git(['add', '-A'], dir);
        git(['commit', '-q', '-m', 'work'], dir);

        const result = bumpVersion({ cwd: dir });
        assert.equal(result.status, 'changed');
        assert.deepEqual(versions(dir), ['?v1', '?v4'], 'styles untouched, scripts v3 -> v4');
    } finally { clean(dir); }
});

test('a long-lived branch bumps once, no matter how much work lands after', () => {
    const dir = fixture();
    try {
        for (let i = 1; i <= 5; i++) {
            fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), `export const v = ${i};\n`);
            git(['add', '-A'], dir);
            git(['commit', '-q', '-m', `work ${i}`], dir);
            bumpVersion({ cwd: dir });
        }
        assert.deepEqual(versions(dir), ['?v1', '?v4'], 'still one bump over trunk');

        // uncommitted and untracked work counts as changed, and still bumps once
        fs.writeFileSync(path.join(dir, 'scripts', 'weights.js'), 'export const w = 1;\n');
        fs.writeFileSync(path.join(dir, 'index.html'),
            fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
                .replace('</script>', '</script>\n<script src="scripts/weights.js?v4"></script>'));
        bumpVersion({ cwd: dir });
        assert.deepEqual(versions(dir), ['?v1', '?v4', '?v4']);
    } finally { clean(dir); }
});

test('an over-bumped branch is normalised back down to trunk + 1', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'index.html'),
            fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replaceAll('?v3', '?v9'));
        fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'export const v = 2;\n');

        bumpVersion({ cwd: dir });
        assert.deepEqual(versions(dir), ['?v1', '?v4']);
    } finally { clean(dir); }
});

test('a group with no changes keeps trunk\'s version', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'index.html'),
            fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replaceAll('?v1', '?v5'));
        bumpVersion({ cwd: dir });
        assert.deepEqual(versions(dir), ['?v1', '?v3'], 'both groups back to trunk versions');
    } finally { clean(dir); }
});

test('--dry-run reports without touching index.html', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'export const v = 2;\n');
        const result = bumpVersion({ cwd: dir, dryRun: true });
        assert.equal(result.entries.find(e => e.dir === 'scripts').target, 4);
        assert.deepEqual(versions(dir), ['?v1', '?v3'], 'file untouched');
    } finally { clean(dir); }
});

test('trunk raises each changed asset group by one over HEAD', () => {
    const dir = fixture();
    try {
        git(['checkout', '-q', 'main'], dir);

        // nothing changed since HEAD: no bump
        assert.equal(bumpVersion({ cwd: dir }).status, 'already-bumped');
        assert.deepEqual(versions(dir), ['?v1', '?v3']);

        fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'export const v = 2;\n');
        assert.equal(bumpVersion({ cwd: dir }).status, 'changed');
        assert.deepEqual(versions(dir), ['?v1', '?v4']);
    } finally { clean(dir); }
});

test('trunk bumps once, and the committed bump becomes the next base', () => {
    const dir = fixture();
    try {
        git(['checkout', '-q', 'main'], dir);
        fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'export const v = 2;\n');

        bumpVersion({ cwd: dir });
        bumpVersion({ cwd: dir });
        assert.deepEqual(versions(dir), ['?v1', '?v4'], 'idempotent before the commit lands');

        git(['add', '-A'], dir);
        git(['commit', '-q', '-m', 'trunk work'], dir);
        assert.deepEqual(versions(dir), ['?v1', '?v4'], 'committed bump leaves versions alone');

        // the committed bump is now the base: scripts stays, styles gets its own bump
        fs.writeFileSync(path.join(dir, 'styles', 'main.css'), 'body { color: red }\n');
        bumpVersion({ cwd: dir });
        assert.deepEqual(versions(dir), ['?v2', '?v4']);
    } finally { clean(dir); }
});

test('an over-bumped trunk group is normalised back down to HEAD + 1', () => {
    const dir = fixture();
    try {
        git(['checkout', '-q', 'main'], dir);
        fs.writeFileSync(path.join(dir, 'index.html'),
            fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replaceAll('?v3', '?v9'));
        fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'export const v = 2;\n');

        bumpVersion({ cwd: dir });
        assert.deepEqual(versions(dir), ['?v1', '?v4']);
    } finally { clean(dir); }
});

test('--check gates trunk too: fails while versions are wrong, passes once they are right', () => {
    const dir = fixture();
    try {
        git(['checkout', '-q', 'main'], dir);
        fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'export const v = 2;\n');

        const failing = runCli(['--check'], dir);
        assert.equal(failing.code, 1);
        assert.match(failing.out, /raised to 4.*\[was 3\]/);
        assert.deepEqual(versions(dir), ['?v1', '?v3'], '--check never writes');

        assert.equal(runCli([], dir).code, 0);
        assert.deepEqual(versions(dir), ['?v1', '?v4']);
        assert.equal(runCli(['--check'], dir).code, 0);
    } finally { clean(dir); }
});

test('--check is a gate: fails while versions are wrong, passes once they are right', () => {
    const dir = fixture();
    try {
        fs.writeFileSync(path.join(dir, 'scripts', 'timer.js'), 'export const v = 2;\n');
        git(['add', '-A'], dir);
        git(['commit', '-q', '-m', 'work'], dir);

        const failing = runCli(['--check'], dir);
        assert.equal(failing.code, 1);
        assert.match(failing.out, /raised to 4.*\[was 3\]/);
        assert.deepEqual(versions(dir), ['?v1', '?v3'], '--check never writes');

        assert.equal(runCli([], dir).code, 0);
        assert.deepEqual(versions(dir), ['?v1', '?v4']);
        assert.equal(runCli(['--check'], dir).code, 0);
    } finally { clean(dir); }
});

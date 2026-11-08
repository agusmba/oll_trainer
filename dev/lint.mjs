// Deterministic checks over the shipped files and the dev tooling.
//
// These are the mistakes a browser only discovers at runtime: a file the browser
// stops parsing mid-statement, a reference to an asset that is not there. Cache-bust
// versions are a separate check (dev/bump-version.mjs --check); `npm run check` chains
// both, and .githooks/pre-commit and CI run it.
//
// Dev-only: not part of the shipped app.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const JS_DIRS = ['scripts', 'dev', 'test'];
// Files the browser loads. CR bytes in one of them is the failure this scan exists for:
// a rewrite through a shell can splice \r in, and the browser stops parsing while the
// file still looks fine to a reader.
const SHIPPED = ['index.html', 'scripts', 'styles', 'pic'];
const EXT_RE = /\.(js|mjs|css|svg|html)$/;

function filesUnder(root, name) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) return [];
    if (fs.statSync(p).isFile()) return [p];
    return fs.readdirSync(p).filter(f => EXT_RE.test(f)).map(f => path.join(p, f));
}

/// \returns array of human-readable problems found under root; empty means clean
export function lint(root) {
    const problems = [];

    for (const file of SHIPPED.flatMap(name => filesUnder(root, name))) {
        // A lone CR — a carriage return with no line feed after it — is what a rewrite
        // through a shell splices into a file, and it is what makes a browser stop
        // parsing part-way through. A file that is entirely CRLF (scripts/algsmap.js,
        // straight from upstream) is legal and left alone.
        if (/\r(?!\n)/.test(fs.readFileSync(file))) {
            problems.push(`${path.relative(root, file)} contains a lone CR byte — the browser will stop parsing it`);
        }
    }

    for (const dir of JS_DIRS) {
        for (const file of filesUnder(root, dir)) {
            try {
                execFileSync('node', ['--check', file], { encoding: 'utf8' });
            } catch (e) {
                problems.push(`${path.relative(root, file)}: ${(e.stderr || e.message).trim().split('\n')[0]}`);
            }
        }
    }

    const indexPath = path.join(root, 'index.html');
    if (!fs.existsSync(indexPath)) return problems;
    const html = fs.readFileSync(indexPath, 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const ref = match[1];
        if (/^[a-z]+:\/\//i.test(ref) || ref.startsWith('#')) continue;
        const target = path.join(root, ref.split('?')[0]);
        if (!fs.existsSync(target)) {
            problems.push(`index.html references ${ref}, which is not in the repo`);
        }
    }

    return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const problems = lint(process.cwd());
    if (problems.length) {
        console.log(problems.join('\n'));
        console.log(`lint failed: ${problems.length} problem(s)`);
        process.exit(1);
    }
    console.log('lint passed: syntax, CR bytes and asset references are clean');
}

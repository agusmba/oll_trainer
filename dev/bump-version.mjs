// Cache-busting versions for the assets referenced in index.html.
//
// The app ships plain files with no build step, so a changed asset only reaches
// already-loaded browsers when its ?vN query changes. The rule this module
// enforces: a branch may raise a version by exactly ONE over the version in
// trunk at the branch point. A long-lived branch never raises it again; the
// single bump lands in trunk at merge, and trunk becomes the next base. Work
// committed straight on trunk raises by exactly ONE over trunk's HEAD instead.
//
// Versions live in index.html, grouped by asset directory (scripts/, styles/).
// A group is bumped only when files in that directory changed since the branch
// point — and it is normalised back down if the branch over-bumped it.
//
// Dev-only: not part of the shipped app. Run `npm run bump-version`.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const INDEX_HTML = 'index.html';

// First ref that exists wins. Local trunk is the working trunk in practice.
const TRUNK_CANDIDATES = ['main', 'master', 'origin/HEAD', 'origin/main', 'upstream/master'];

// Matches src="scripts/timer.js?v7" / href="styles/main.css?v2".
const ASSET_RE = /(src|href)="([^"?]+)\?v(\d+)"/g;

function git(args, cwd) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function gitOk(args, cwd) {
    return gitText(args, cwd) !== null;
}

/// \returns stdout, or null when the command fails
function gitText(args, cwd) {
    try { return execFileSync('git', args, { cwd, encoding: 'utf8' }); } catch { return null; }
}

/// \returns Map<directory, highest version> for the asset refs in html
function assetVersions(html) {
    const byDir = new Map();
    for (const match of html.matchAll(ASSET_RE)) {
        const dir = path.posix.dirname(match[2]);
        const version = Number(match[3]);
        byDir.set(dir, byDir.has(dir) ? Math.max(byDir.get(dir), version) : version);
    }
    return byDir;
}

/// Rewrite every asset ref in html to its group's target version.
function rewriteVersions(html, targets) {
    return html.replace(ASSET_RE, (whole, attr, ref) => {
        const target = targets.get(path.posix.dirname(ref));
        return target === undefined ? whole : `${attr}="${ref}?v${target}"`;
    });
}

/// Files under dir that differ from ref, including untracked and unstaged ones.
function changedFiles(ref, dir, cwd) {
    const tracked = git(['diff', '--name-only', ref, '--', dir], cwd).split('\n').filter(Boolean);
    const untracked = git(['ls-files', '--others', '--exclude-standard', '--', dir], cwd).split('\n').filter(Boolean);
    return [...tracked, ...untracked];
}

/// \returns true when trunk's newest commit changed files in dir but left dir's version unraised
function missedBumpInHead(root, dir) {
    if (!gitOk(['rev-parse', '--verify', '--quiet', 'HEAD~1^{commit}'], root)) return false;
    const headVersion = assetVersions(gitText(['show', `HEAD:${INDEX_HTML}`], root) ?? '').get(dir);
    const parentHtml = gitText(['show', `HEAD~1:${INDEX_HTML}`], root);
    if (headVersion === undefined || parentHtml === null) return false;
    if (assetVersions(parentHtml).get(dir) === headVersion) {
        return git(['diff', '--name-only', 'HEAD~1', 'HEAD', '--', dir], root).split('\n').filter(Boolean).length > 0;
    }
    return false;
}

/// \returns { status, message, trunk, base, entries } — entries describe each asset group.
export function bumpVersion({ cwd = process.cwd(), dryRun = false } = {}) {
    const root = git(['rev-parse', '--show-toplevel'], cwd).trim();

    const trunk = TRUNK_CANDIDATES.find(ref => gitOk(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], root));
    if (!trunk) {
        return { status: 'no-trunk', message: 'no trunk branch to compare against (tried main, master, origin/HEAD)', entries: [] };
    }

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], root).trim();
    const onTrunk = branch === trunk || branch === 'HEAD';

    // The base a bump is measured over: a branch's branch point in trunk, or
    // trunk's own HEAD when work lands directly on trunk. Once a bump is
    // committed, that commit is the next base.
    const base = onTrunk
        ? git(['rev-parse', 'HEAD'], root).trim()
        : git(['merge-base', 'HEAD', trunk], root).trim();

    const html = fs.readFileSync(path.join(root, INDEX_HTML), 'utf8');
    const current = assetVersions(html);
    if (current.size === 0) {
        return { status: 'no-versions', message: `no ?vN asset versions found in ${INDEX_HTML}`, trunk, base, entries: [] };
    }

    const baseHtml = gitText(['show', `${base}:${INDEX_HTML}`], root) ?? '';
    const baseVersions = assetVersions(baseHtml);
    const baseFallback = baseVersions.size ? Math.max(...baseVersions.values()) : 0;

    const entries = [];
    for (const [dir, version] of current) {
        const baseVersion = baseVersions.has(dir) ? baseVersions.get(dir) : baseFallback;
        const missed = onTrunk && missedBumpInHead(root, dir);
        const changed = changedFiles(base, dir, root);
        const target = changed.length > 0 || missed ? baseVersion + 1 : baseVersion;
        entries.push({ dir, baseVersion, version, target, changed, changedCount: changed.length, missed });
    }

    const needsChange = entries.some(e => e.version !== e.target);
    if (!dryRun && needsChange) {
        const targets = new Map(entries.map(e => [e.dir, e.target]));
        fs.writeFileSync(path.join(root, INDEX_HTML), rewriteVersions(html, targets));
    }
    return { status: needsChange ? 'changed' : 'already-bumped', trunk, base, onTrunk, entries, applied: !dryRun && needsChange };
}

function describe(entry) {
    const reason = entry.changedCount > 0
        ? `${entry.changedCount} file(s) changed`
        : entry.missed ? 'last trunk commit changed files here without a bump' : 'nothing changed';
    const verb = entry.changedCount > 0 || entry.missed ? `raised to ${entry.target} (${reason})` : `kept at ${entry.target} (${reason})`;
    const mark = entry.version === entry.target ? '' : `  [was ${entry.version}]`;
    return `${entry.dir}: base v${entry.baseVersion}, ${verb}${mark}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const dryRun = args.includes('--dry-run') || check;

    const result = bumpVersion({ dryRun });
    if (result.entries.length === 0) {
        console.log(result.message ?? 'nothing to do');
        // nothing to enforce on trunk, and no repo shape to check: only a missing
        // trunk or a missing version convention is a real failure.
        process.exit(result.status === 'no-trunk' || result.status === 'no-versions' ? 1 : 0);
    }
    for (const entry of result.entries) console.log(describe(entry));

    if (result.status === 'already-bumped') {
        console.log(result.onTrunk
            ? result.entries.some(e => e.changedCount > 0 || e.missed)
                ? `versions already correct for ${result.trunk} HEAD + 1`
                : `nothing changed since ${result.trunk} HEAD: versions already correct`
            : `versions already correct for ${result.trunk} + 1`);
    }
    else if (check) console.log(`versions wrong — run: npm run bump-version`);
    else console.log(dryRun ? 'dry run — index.html untouched' : `wrote ${INDEX_HTML}`);
    // --check is a gate, not a write: it fails only when versions are wrong.
    if (check && result.status === 'changed') process.exit(1);
}

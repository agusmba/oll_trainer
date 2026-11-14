// Dev-only: serves the repo over http:// so the suite can run against an HTTP
// origin, the way GitHub Pages serves the app — raw files, under a subpath,
// nothing processed. The app itself ships plain files with no server.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

// GitHub Pages serves .svg as image/svg+xml; the browser only renders a case
// picture when the response says so. It answers .json as application/json, and
// Chromium only accepts a manifest whose content type says JSON.
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
};

/// Serve the repo over http://127.0.0.1 on a free port, under `prefix`.
/// A pathname under the prefix maps to the same path in the repo root; a
/// directory serves its index.html. Nothing outside the root is reachable.
/// `close` drops in-flight connections too, so a suite can take the origin away
/// for good — the way a phone loses a network — rather than wait for keep-alive
/// sockets to idle out.
/// `override(file, body)` makes the origin answer `body` for a repo-relative
/// `file` the disk still holds, so a test can ask which copy replied — cache or
/// network — without writing into the repo. `hits(file)` counts the requests the
/// origin actually got for that file since `resetHits`.
/// \returns { origin, url, override, hits, resetHits, close } — url is <origin><prefix>index.html
export async function serveRepo({ prefix = '/oll/' } = {}) {
    const root = process.cwd();
    const mount = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const overrides = new Map();
    const counts = new Map();
    const serve = (res, file, body) => {
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
        res.end(body);
    };

    const server = http.createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
        if (!pathname.startsWith(mount)) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('not under the mount prefix');
            return;
        }

        const rel = pathname.slice(mount.length);
        const target = path.resolve(root, rel);
        if (target !== root && !target.startsWith(root + path.sep)) {
            res.writeHead(403, { 'content-type': 'text/plain' });
            res.end('outside the served root');
            return;
        }

        let file = target;
        if (rel === '' || rel.endsWith('/') || fs.existsSync(file) && fs.statSync(file).isDirectory()) {
            file = path.join(target, 'index.html');
        }
        const key = path.relative(root, file);
        counts.set(key, (counts.get(key) ?? 0) + 1);

        const over = overrides.get(key);
        if (over !== undefined) {
            serve(res, file, over);
            return;
        }
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end(`no such file: ${rel}`);
            return;
        }

        serve(res, file, fs.readFileSync(file));
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return {
        origin,
        url: `${origin}${mount}index.html`,
        override: (file, body) => overrides.set(file.replace(/^\.\//, ''), body),
        hits: file => counts.get(file.replace(/^\.\//, '')) ?? 0,
        resetHits: () => counts.clear(),
        close: async () => {
            server.closeAllConnections?.();
            await new Promise(resolve => server.close(resolve));
        },
    };
}

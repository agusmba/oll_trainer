// Dev-only: serves the repo over http:// so the suite can run against an HTTP
// origin, the way GitHub Pages serves the app — raw files, under a subpath,
// nothing processed. The app itself ships plain files with no server.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

// GitHub Pages serves .svg as image/svg+xml; the browser only renders a case
// picture when the response says so.
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
};

/// Serve the repo over http://127.0.0.1 on a free port, under `prefix`.
/// A pathname under the prefix maps to the same path in the repo root; a
/// directory serves its index.html. Nothing outside the root is reachable.
/// \returns { origin, url, close } — url is <origin><prefix>index.html
export async function serveRepo({ prefix = '/oll/' } = {}) {
    const root = process.cwd();
    const mount = prefix.endsWith('/') ? prefix : `${prefix}/`;
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
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end(`no such file: ${rel}`);
            return;
        }

        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
        res.end(fs.readFileSync(file));
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, url: `${origin}${mount}index.html`, close: () => new Promise(resolve => server.close(resolve)) };
}

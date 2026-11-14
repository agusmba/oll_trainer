// The Installed app's offline story: every file the app loads is held in the cache, so a
// phone that loses the network still opens, still draws its Cases, still times solves.
// index.html registers this over http(s) only — opening the app from a filesystem path is
// the Offline copy, which needs no worker and must not claim one.
//
// The precache list is a check target, not just a list: dev/lint.mjs compares it against
// what index.html actually loads and what the repo really contains, so shipping an asset
// without adding it here fails `npm run check` instead of shipping an app that breaks the
// moment someone flies. Keep the entries double-quoted and comment-free: the check reads
// the array as JSON.

// Every cache this worker owns starts with the prefix: Pages hosts all of an account's
// project sites on one origin, a worker's caches are origin-wide, and activate must not
// empty a cache belonging to another site.
const CACHE_PREFIX = 'oll-trainer-';
const CACHE = `${CACHE_PREFIX}1`;

// Where an offline start begins. A navigation with nothing cached and no network has only
// this one file to fall back to; a bare directory URL is the same document by another name.
const ENTRY = 'index.html';

// Three kinds of request, three answers, and the difference between them is how a file
// ages. ?vN is written into index.html by dev/bump-version.mjs and is the asset's
// identity: one URL can never come to mean different bytes, so a cached hit for a
// versioned asset needs no revalidation ever. The Case pictures and this manifest carry no
// query and do change in place, so they are served from the cache and repaired behind the
// visitor's back. The document itself always goes to the network first, because an
// installed app following trunk has to see what the browser tab sees.
// The spelling is `?v5`, not `?v=5` — the same query dev/bump-version.mjs's ASSET_RE
// writes. "a versioned asset is never asked for again" in offline.test.mjs is what keeps
// this pattern matched against the app's real URLs rather than a guessed one.
const VERSIONED_RE = /[?&]v\d+/;

const PRECACHE_URLS = [
    "index.html",
    "manifest.json",
    "styles/main.css?v5",
    "styles/selection.css?v5",
    "styles/timer.css?v5",
    "scripts/algsinfo.js?v10",
    "scripts/algsmap.js?v10",
    "scripts/weights.js?v10",
    "scripts/saveload.js?v10",
    "scripts/selection.js?v10",
    "scripts/timer.js?v10",
    "scripts/ui.js?v10",
    "scripts/practice.js?v10",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "pic/1.svg",
    "pic/2.svg",
    "pic/3.svg",
    "pic/4.svg",
    "pic/5.svg",
    "pic/6.svg",
    "pic/7.svg",
    "pic/8.svg",
    "pic/9.svg",
    "pic/10.svg",
    "pic/11.svg",
    "pic/12.svg",
    "pic/13.svg",
    "pic/14.svg",
    "pic/15.svg",
    "pic/16.svg",
    "pic/17.svg",
    "pic/18.svg",
    "pic/19.svg",
    "pic/20.svg",
    "pic/21.svg",
    "pic/22.svg",
    "pic/23.svg",
    "pic/24.svg",
    "pic/25.svg",
    "pic/26.svg",
    "pic/27.svg",
    "pic/28.svg",
    "pic/29.svg",
    "pic/30.svg",
    "pic/31.svg",
    "pic/32.svg",
    "pic/33.svg",
    "pic/34.svg",
    "pic/35.svg",
    "pic/36.svg",
    "pic/37.svg",
    "pic/38.svg",
    "pic/39.svg",
    "pic/40.svg",
    "pic/41.svg",
    "pic/42.svg",
    "pic/43.svg",
    "pic/44.svg",
    "pic/45.svg",
    "pic/46.svg",
    "pic/47.svg",
    "pic/48.svg",
    "pic/49.svg",
    "pic/50.svg",
    "pic/51.svg",
    "pic/52.svg",
    "pic/53.svg",
    "pic/54.svg",
    "pic/55.svg",
    "pic/56.svg",
    "pic/57.svg"
];

self.addEventListener('install', event => {
    // addAll is all-or-nothing: one missing file and this worker never activates, which is
    // louder than half an offline app nobody would notice. No skipWaiting — a returning
    // visitor finishes their visit on the copy they started with and gets the new one on a
    // fresh launch, so an update never yanks the screen out from under a solve in progress.
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', event => {
    // Only one cache name is ever live. Dropping the rest of this worker's own names is
    // what makes a rename in this file — the honest response to a strategy change — leave
    // nothing behind. Names outside the prefix belong to another app on this origin.
    event.waitUntil(caches.keys().then(names => Promise.all(
        names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE)
            .map(name => caches.delete(name)))));
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // Nothing this app loads belongs to another origin, and standing between a visitor and
    // someone else's site is not this worker's job: the sidebar's links go off-site and are
    // passed to the network untouched.
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        // The one request that has to reach Pages when Pages is there — offline, the cached
        // entry point is what an installed app opens on.
        event.respondWith(fromNetworkFirst(request));
    } else if (VERSIONED_RE.test(url.search)) {
        event.respondWith(fromCacheForever(request));
    } else {
        // Pictures and the manifest: the cache answers now, the network fixes later.
        const refresh = revalidate(request);
        event.respondWith(fromCacheFirst(request, refresh));
        // The refresh lands after the response is on its way; waitUntil is what keeps this
        // worker alive long enough to finish the write.
        event.waitUntil(refresh);
    }
});

/// The asset is either in the cache or it is not: a versioned URL cannot have gone stale,
/// so asking the network first would only add a round trip to every single load.
async function fromCacheForever(request) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;

    // No hit is the precache list being wrong, which `npm run check` is meant to prevent;
    // the fetch below says so by throwing, and the visitor sees the asset fail to load.
    const fresh = await fetch(request);
    hold(cache, request, fresh);
    return fresh;
}

async function fromNetworkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const fresh = await fetch(request);
        hold(cache, request, fresh);
        return fresh;
    } catch {
        // Nothing to reach: an offline start, or an origin that stopped answering.
        return await cache.match(request) ?? await cache.match(ENTRY) ?? Response.error();
    }
}

/// Goes to the network without waiting to be asked, so the visitor never blocks on it. A
/// picture that changed is therefore wrong for one visit rather than never repaired.
async function revalidate(request) {
    const cache = await caches.open(CACHE);
    try {
        const fresh = await fetch(request);
        hold(cache, request, fresh);
        return fresh;
    } catch {
        // Offline, or the file is gone. What the cache holds stays valid.
        return null;
    }
}

async function fromCacheFirst(request, refresh) {
    const hit = await (await caches.open(CACHE)).match(request);
    if (hit) return hit;

    // Nothing cached means this visit pays for the network like any other load.
    return await refresh ?? Response.error();
}

/// A response the cache refuses (a redirect to another URL, an opaque body) must not cost
/// the visitor the file they are loading right now, so the write is not awaited and its
/// failure is not raised. The cost of losing that write is one more network trip later.
function hold(cache, request, response) {
    if (!response.ok || response.redirected) return;
    cache.put(request, response.clone()).catch(() => {});
}

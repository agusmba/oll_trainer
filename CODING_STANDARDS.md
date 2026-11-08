# Coding Standards

Mechanical rules are enforced, not written down: `npm run check` (dev/lint.mjs plus
dev/bump-version.mjs --check) catches unparsable JS, lone CR bytes in shipped files,
references to assets that are not in the repo, and cache-bust version drift. CI runs
`npm run check && npm test`, and the pre-commit hook runs `npm run check`. Read this file
when reviewing a diff; it holds the calls no check can make.

## Layout and hidden dependencies

- JavaScript lives in `scripts/`, stylesheets in `styles/`, one SVG per Case in
  `pic/NN.svg`. A new asset must be referenced from `index.html` and gets its directory's
  `?vN` from `npm run bump-version`.
- `index.html` loads scripts in dependency order: `ui.js` after `timer.js`, because
  timer.js's key handlers read `overlayOpen()` and `trapFocus()` from ui.js. Reordering
  the tags breaks timing silently, with no error at load.
- The app has no build step and no module system: files talk through globals on `window`,
  so a rename in one file is a runtime failure in another.

## Interface conventions

- Style from the tokens at the top of `styles/main.css`; do not add one-off colours,
  radii or sizes. `scripts/ui.js` repaints the theme by writing `--bg`, `--fg`, `--link`
  on `:root`.
- Every touch target is at least `--tap` (44px). A mouse-only control may be 34px — the
  `pointer: fine` rules are where that is allowed.
- Mobile-first: the base rules serve a phone. The two-column layout is
  `@media (min-width: 700px) and (min-height: 520px)`, because two columns need height as
  well as width; a wide-but-short screen stacks instead.
- No `:hover` styling on coarse pointers. A tap leaves hover state on a touch screen, so
  hover effects must be scoped to `pointer: fine`.
- Viewport units: write the `vh` rule before the `svh`/`dvh` one, and keep the
  `@supports not (height: 1svh)` fallback blocks in `styles/timer.css` and
  `styles/selection.css` — the app is used on browsers that do not know `svh`.
- The Settings sheet and the Case card are `<dialog>` elements owned by `scripts/ui.js`.
  `scripts/timer.js` must not time while either is open; it asks `overlayOpen()`.
- Motion stays behind `prefers-reduced-motion`.

## JavaScript

- camelCase, verb-prefixed function names (`loadSelection`, `saveLocal`), descriptive
  variable names (`timerActivatingButton`, `recapBacklog`).
- Anything that survives a reload goes in localStorage; a read that can come back null
  gets a fallback value.

## Tests

- Tests are dev-only and go through `test/harness.mjs`. Assert on what a visitor sees —
  measured boxes, served responses, keyboard and pointer gestures — not on internals.
- A layout test names the screen it means: viewport size, and touch or mouse.

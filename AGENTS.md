# OLL Trainer Guidelines

OLL Trainer is a web tool for practising OLL algorithms in speedcubing: pick Cases, solve
them, record times. It ships plain files with no build step — open `index.html` to run it,
and it works offline once downloaded. Word for the domain: `GLOSSARY.md`.

## Checks

- `npm run check` — unparsable JS, lone CR bytes in shipped files, asset references that
  are not in the repo, cache-bust version drift. Wired as a pre-commit hook (`npm install`
  sets `core.hooksPath`); CI runs `npm run check && npm test`.
- `npm test` — headless chromium over a served copy. Files run one at a time
  (`--test-concurrency=1`): each drives its own browser, and several at once is enough to
  get the run OOM-killed on this machine. `npm run test:responsive` is the phone/tablet
  suite alone.
- Cache-bust: after changing anything under `scripts/` or `styles/`, run
  `npm run bump-version`. Never edit `?vN` by hand; `dev/bump-version.mjs` holds the rule.

## Layout questions

- `npm run probe [w] [h] [solves]` prints measured geometry plus app state (Mode, Goal,
  weights, history length) as text. Answer a position question with this, not with images.
- `npm run shots [--only <name>] [--thumb]` writes screenshots to `/tmp/oll-shots` when
  appearance is the question; `--thumb` is a fraction of the size.
- Case images are SVG. Render before looking at one:
  `rsvg-convert -w 300 pic/31.svg -o /tmp/case.png`
- Where the interface lives: `styles/main.css` (tokens, touch minimum),
  `styles/selection.css` (Selection grid), `styles/timer.css` (solve screen),
  `scripts/ui.js` (theme and dialogs).

## Writing tests

Read `test/harness.mjs` first. `openApp` and `openServedApp` take Playwright context
options (`viewport`, `hasTouch`, `isMobile`); `tapCenter`, `boxOf`, `viewport` and
`recordTimes` are the helpers.

## Standards

`CODING_STANDARDS.md` — file layout, interface conventions, naming, localStorage, what a
test should assert. Read it when reviewing a diff, not while implementing.

## Agent skills

Skill instructions are installed locally under `.agents/skills/` and are not committed
(gitignored); they are vendored from `mattpocock/skills` and recorded in
`skills-lock.json`. Reinstall them with the Agent Skills installer if `.agents/skills/` is
missing. The repo-side config those skills read is committed under `local-docs/agents/`.

- **Issue tracker** — GitHub issues on the fork `agusmba/oll_trainer` (`gh` CLI), and the
  claim/implement/close lifecycle: `local-docs/agents/issue-tracker.md`. Read it before
  starting or closing a ticket; the implementer closes, merge auto-close is a safety net.
- **Triage labels** — `local-docs/agents/triage-labels.md`.
- **Domain docs** — single context: `GLOSSARY.md` at the repo root, ADRs under
  `local-docs/adr/`; see `local-docs/agents/domain.md`. There is no `docs/` directory:
  where a skill defaults to `docs/` or `docs/adr/`, use `local-docs/` and
  `local-docs/adr/`.

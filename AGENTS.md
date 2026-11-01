# OLL Trainer Guidelines

## Project Overview
OLL Trainer is a web-based tool for practicing OLL algorithms in speedcubing. The application allows users to select specific cases to practice and measures solving times.

## Build/Test Commands
- To run locally, simply open index.html in a browser
- Site can be used offline once downloaded
- Tests are dev-only (`test/`, headless chromium over index.html); the commands live in `package.json`. The browser is fetched once into `~/.cache/ms-playwright`, outside the repo.
- Case images are SVG. Render before looking at one: `rsvg-convert -w 300 pic/31.svg -o /tmp/case.png`
- Cache-busting versions are managed by the dev-only helper `dev/bump-version.mjs`: `npm run bump-version` (see below), `npm run bump-version:check` to verify.

## Code Style Guidelines
### Organization
- JavaScript files in `/scripts/` directory
- CSS files in `/styles/` directory
- SVG images for OLL cases are in `/pic/` directory

### Naming Conventions
- Use camelCase for variables and functions
- Function names should use verb prefixes (e.g., `loadSelection`, `saveLocal`)
- Use descriptive variable names (e.g., `timerActivatingButton`, `recapBacklog`)

### JavaScript Patterns
- Use localStorage for data persistence
- Implement null checks with fallback values

### Cache-busting versions
- index.html references each script and stylesheet with a `?vN` query, so a changed asset reaches browsers that already loaded the page. N is one counter per directory (`scripts/`, `styles/`).
- Never edit `?vN` by hand. After changing files under `scripts/` or `styles/`, run `npm run bump-version`.
- The rule the helper enforces: a branch may raise a version by exactly ONE over trunk at its branch point, however long the branch runs. It is idempotent: it normalises an over-bumped branch back down to trunk + 1, leaves directories with no changes at trunk's version, and does nothing on trunk. The single bump lands in trunk at merge, and trunk becomes the next base.

## Agent skills

Skill instructions are installed locally under `.agents/skills/` and are not committed (gitignored); they are vendored from `mattpocock/skills` and recorded in `skills-lock.json`. Reinstall them with the Agent Skills installer if `.agents/skills/` is missing. The repo-side config that those skills read is committed under `local-docs/agents/`.

### Issue tracker

Issues live as GitHub issues on the fork `agusmba/oll_trainer` (`gh` CLI). See `local-docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `local-docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the repo root, ADRs under `local-docs/adr/`. See `local-docs/agents/domain.md`. This repo has no `docs/` directory; if a skill defaults to `docs/` or `docs/adr/`, use `local-docs/` and `local-docs/adr/` instead.
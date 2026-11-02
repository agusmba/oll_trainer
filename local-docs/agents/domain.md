# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`local-docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `local-docs/<context>/adr/` for context-scoped decisions.

> **Path override.** The vendored skills default to `docs/agents/` and `docs/adr/`; this repo uses no `docs/` directory. Config lives in **`local-docs/agents/`**, ADRs in **`local-docs/adr/`** — never create `docs/`. `GLOSSARY.md` stays at the repo root.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is **single-context**:

```
/
├── GLOSSARY.md
├── index.html
├── scripts/
├── styles/
├── pic/
└── local-docs/
    ├── agents/
    │   ├── issue-tracker.md
    │   ├── triage-labels.md
    │   └── domain.md
    └── adr/
        ├── 0001-weighted-case-selection.md
        └── 0002-...md
```

Multi-context (only if a `GLOSSARY-MAP.md` ever appears at the root): `local-docs/adr/` holds system-wide decisions, `local-docs/<context>/adr/` holds context-specific ones, and each context keeps its own `GLOSSARY.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

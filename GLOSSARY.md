# OLL Trainer

A web tool for timing OLL case solves: the user selects cases, solves scrambled ones against a goal time, and the trainer biases which cases reappear based on how often each case is beaten.

## Language

**Case**:
An OLL case, identified by its number 1–57.
_Avoid_: problem, alg (an "alg" is the algorithm text for a case, not the case itself)

**Selection**:
The set of cases the user has chosen to practice. Persisted across sessions.
_Avoid_: selected cases array

**Goal**:
A target solve time in ms. A solve at or under the Goal beats it. Session-scoped — never persisted by the app.
_Avoid_: target, par

**Weight**:
How often a Case is drawn relative to the other cases in the current Selection. A Weight belongs to the (Case, Selection) pair, not to the Case alone: it is earned against the current Selection and Goal, is bounded so a Case can neither vanish nor dominate, and resets whenever the practice contract changes. Session-scoped — never persisted.
_Avoid_: probability, frequency

**Practice contract**:
The trio of Selection + Goal + Weight. Changing any member resets the Weight of the whole Selection.
_Avoid_: session (overloaded — the times history is a separate thing)

**Case card**:
The dialog that shows one Case while solving: its picture, name, the alg and the setup the scramble came from. Opened from a Case name in the times history or from a tile of the Selection summary. Lives in the markup as `hintWindow` / `box`, which is the picture's window, not the Case itself.
_Avoid_: hint, peek, popup

**Selection summary**:
The band of tiles above the times history on the solve screen: one tile per Case in the Selection, filled by Weight — red drawn more often, green less — and holding that Case's mean solve. A Case with no times still gets a tile, ringed and reading "-", because the fill is the draw, not the result. Tiles open the Case card. Lives in the markup as `caseSummary`.
_Avoid_: heat map, chart, leaderboard

**Settings sheet**:
The modal holding Theme, Colours, sizes and the timing notes. A sheet because it is dismissed, not submitted: Esc and Done both close it, and nothing else takes keys while it is open.
_Avoid_: sidebar, options panel

**Theme**:
Light or dark, chosen as a preference (`light`, `dark`, `auto`) and resolved to one of the two palettes — the background, text and link colours the Theme writes. A custom colour is an explicit choice that a later Theme change replaces.
_Avoid_: colour scheme, mode (belongs to Mode)

**Mode**:
The single stored state of what the trainer is doing: Selection, Practice, or Recap. Mode is set explicitly; it is never inferred from whether a list is empty.
_Avoid_: train, mode flags, recapInProgress

**Practice**:
The Mode where cases are drawn from the Selection by Weight and timed; each solve adjusts its case's Weight.
_Avoid_: train, training mode

**Recap**:
The Mode that replays every selected Case exactly once, in random order, without touching Weights. When the Recap backlog empties, Recap ends and Mode becomes Practice.

**Recap backlog**:
The cases Recap has not yet replayed. Its emptiness ends Recap; it is not a mode signal.
_Avoid_: recapArray as a flag

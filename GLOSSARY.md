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

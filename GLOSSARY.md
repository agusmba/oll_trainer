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
A target solve time in ms. A solve at or under the Goal beats it. The app persists the Goal: a reload brings back the Goal the reader left, not the app's default.
_Avoid_: target, par

**Weight**:
How often a Case is drawn relative to the other cases in the current Selection. A Weight belongs to the (Case, Selection) pair, not to the Case alone: it is earned against the current Selection and Goal, is bounded so a Case can neither vanish nor dominate, and resets whenever the practice contract changes. The app persists the Weights earned against one contract, and a reload restores them for exactly that Goal and Selection; any other store is uniform Weights.
_Avoid_: probability, frequency

**Practice contract**:
The trio of Selection + Goal + Weight. Changing any member resets the Weight of the whole Selection.
_Avoid_: session (overloaded — the times history is a separate thing)

**Practice session**:
The practice state the app keeps across a reload: Mode, Goal, Weights and the Recap backlog, alongside the Selection, the times history and the Custom algs. Weights come back only for the contract they were earned against, so a reload that changes the Goal or the Selection brings back uniform Weights.
_Avoid_: session (the clear-session button clears the times history alone)

**Start cooldown**:
The window after a stop during which a start on the clock is ignored: the hand that stopped the clock keeps moving — a second finger, or the same finger tapping twice — and its tail is not a new solve. 500 ms, measured from the stop.
_Avoid_: debounce, anti-ghost tap

**Start gate**:
The sustained touch that turns an armed clock into a start: 500 ms of a held press, after which the release starts the solve. A quick tap is not a solve. The keyboard is exempt: Space press-and-release starts.
_Avoid_: long press, intention, minimum touch

**Timer focus**:
The solve screen reduced to the clock alone: entered when the Start gate is met (on the keyboard, at Space press-down), left at the stop, when the Goal, times and topbar come back. Not a dialog: nothing opens during Timer focus and nothing traps the keyboard.
_Avoid_: fullscreen mode, focus mode, zen mode

**Cancel area**:
The band that appears on the Timer focus screen when an armed finger drags: releasing on it abandons the arm, releasing elsewhere starts the solve, and moving away leaves it. Dismissed by moving, never submitted.
_Avoid_: cancel popup, cancel button, abort dialog

**Case card**:
The dialog that shows one Case while solving: its picture, name, the alg and the setup the scramble came from. Opened from a Case name in the times history or from a tile of the Selection summary. Lives in the markup as `hintWindow` / `box`, which is the picture's window, not the Case itself.
_Avoid_: hint, peek, popup

**Reference alg**:
The algorithm text a Case card shows for its Case; at most two per Case.
The built-in ones ship with the app; a Custom one replaces a built-in until it is restored.
_Avoid_: solution, formula

**Custom alg**:
A user-edited Reference alg, kept per Case across sessions. A mark in the slot's edit
field clears it back to the built-in in one tap; text that says the same as the
built-in stops being a Custom alg by itself.
_Avoid_: user alg, override

**Preferred alg**:
The Reference alg a Case marks as primary: its row carries the filled star and the
accent rule, and the other slot's outline star is the only way to move the mark, so a
Case always has one — the first of the two by default. It governs how the Case's
picture is shown: if it opens with a y-rotation (`y`, `y'`, `y2`, `y2'`), the picture
turns to match and that leading rotation is shown faint, indicating it has already
been applied to the picture.
_Avoid_: favorite, default alg

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

**Installed app**:
The hosted site added to a device by the browser: it launches without browser chrome, keeps following trunk, and holds that device's Selection and times — shared with the site opened in the browser on the same device, and separate on every other one.
_Avoid_: PWA, the app (the site is the app either way), home-screen shortcut, offline mode

**Offline copy**:
A downloaded snapshot of the app, run from a machine rather than served: it stays frozen at whatever it was downloaded from, and copies opened in one browser behave as a single app holding one Selection and set of times.
_Avoid_: offline version, local version, the zip, "works offline"

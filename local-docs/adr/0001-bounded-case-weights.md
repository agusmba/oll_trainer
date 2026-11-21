# Bounded case weights

**Status**: the [1/8, 8] clamp, the half/double rule and the contract-keyed reset stand. Superseded by ADR-0002: "never persisted", and adopting whatever the goal input shows at load.

Case weights steer which cases reappear in Practice: each solve beats the Goal (time at or under it) by halving the case's weight, or misses it by doubling. Left unbounded, twenty slow solves push a weight to ~1M and one case dominates every draw, while a goal-beating streak halves toward zero in floating point and the case silently stops appearing around 2⁻¹⁶ — punished out of existence without ever being explicitly removed. We decided to clamp weights to the range [1/8, 8] at adjustment time, so punishment is visible and recoverable (one slow solve climbs back off the floor) and no case can dominate the draw.

Weights belong to the (Case, Selection) pair, not the Case: the whole Selection's weights reset whenever the practice contract changes — selection change, goal change, or session clear. We also decided weights and the goal are **never persisted by the app**; if persistence ever lands, it stores only the bounded map, beside the selection. An unbounded persisted weight is a cross-session landmine: a 1M weight survives reload and dominates practice before the user has solved anything.

**Superseded by ADR-0002**: the Goal and the bounded Weight map are now persisted, keyed to the Goal and Selection they were earned against. The landmine is answered by the key, not by refusing to store.

The Goal is not app-persisted either, but browsers restore form values across a reload, so the goal input can come back holding the previous Goal. We decided the app adopts whatever that input shows at load rather than forcing it to 0: an adopted Goal is harmless because Weights are rebuilt uniform on load, and showing a Goal the app is not using would read as a bug. Persisting the Goal beside the selection, as colours are, is a possible future step.

**Superseded by ADR-0002**: the Goal is app-persisted and the goal input is repainted from the store, so the app no longer adopts whatever the input shows.

Considered: leaving weights unbounded; decaying toward 1 between solves; letting halved cases drop out of the pool entirely. Rejected — unbounded skews the draw, decay dilutes the signal, and dropping a case removes it from the Selection the user explicitly asked to practice.

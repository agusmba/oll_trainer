
/// \value stringified json object or standard type
/// \returns true if succeed
function saveLocal(name, value) {
    // If the platform supports localStorage, then save the value
    try {
        localStorage.setItem(name, value);
        return true;
    }
    catch(e) {
        // Most likely cause of errors is a very old browser that doesn't support localStorage (fail silently)
        console.warn("saving error");
        return false;
    }
}

/// \returns loaded value or specified defaultValue in case of error
function loadLocal(name, defaultValue) {
    // If the platform supports localStorage, then load the selection
    try {
        return localStorage.getItem(name);
    }
    catch(e) {
        // Either no selection in localStorage or browser does not support localStorage (fail silently)
        console.warn("can\'t load from localstorage");
        return defaultValue;
    }
}

function saveSelection() {
    // Weights are earned against the current Selection, so a selection change resets them
    resetWeights();
    return saveLocal('ollSelection', JSON.stringify(window.selCases));
}

function loadSelection() {
    window.selCases = JSON.parse(loadLocal('ollSelection', '[31,32]'));
    if (window.selCases == null)
        window.selCases = [31,32];
    resetWeights(); // uniform at load; loadWeights() brings the earned ones back once the Goal is known
}

/* Goal: the target solve time, one member of the practice contract. A phone browser
   restores no form values across a reload, so the app keeps the Goal in localStorage
   itself and repaints the goal input from the store at load. */

/// \param goal in ms, 0 meaning dynamic weights off
function saveGoal(goal) {
    saveLocal('ollGoal', JSON.stringify(goal));
}

/// \returns the stored Goal, 0 when nothing is stored
function loadGoalValue() {
    var stored = JSON.parse(loadLocal('ollGoal', '0'));
    return (typeof stored == "number" && !isNaN(stored)) ? stored : 0;
}

/* Weights: saved alongside the practice contract (Goal + Selection) they were earned
   against, which is the contract ADR-0001 says makes every Weight stale the moment it
   changes. A store that does not match the current Goal and Selection is no store. */

function saveWeights() {
    saveLocal('ollWeights', JSON.stringify({
        goal: window.goal,
        selection: window.selCases,
        pairs: weightsToStore(),
    }));
}

/// Restores the Weights saved against the current Goal and Selection; any other store
/// leaves them uniform, which is what a changed contract means.
function loadWeights() {
    var stored = JSON.parse(loadLocal('ollWeights', '[]'));
    if (stored == null || stored.goal != window.goal || !sameSet(stored.selection, window.selCases))
        resetWeights();
    else
        weightsFromStore(stored.pairs);
}

/// \returns true when the two lists hold the same Case numbers, in any order
function sameSet(a, b) {
    if (a == null || b == null || a.length != b.length)
        return false;
    var sortedA = a.slice().sort(function (x, y) { return x - y; });
    var sortedB = b.slice().sort(function (x, y) { return x - y; });
    for (var i = 0; i < sortedA.length; i++)
        if (sortedA[i] != sortedB[i])
            return false;
    return true;
}

/* Session: Mode, plus the Recap backlog — the Cases Recap has not replayed. Together
   with the Goal, the Weights, the Selection and the times history, this is the practice
   state that survives a reload. */

function saveSession() {
    saveLocal('ollMode', window.mode);
    saveLocal('ollRecap', JSON.stringify(window.recapBacklog));
}

/// \returns the stored Mode, "selection" when nothing is stored or the store is not a Mode
function loadMode() {
    var stored = loadLocal('ollMode', 'selection');
    return (stored == "practice" || stored == "recap") ? stored : "selection";
}

/// \returns the stored Recap backlog, [] when nothing is stored
function loadRecapBacklog() {
    var stored = JSON.parse(loadLocal('ollRecap', '[]'));
    return stored == null ? [] : stored;
}

/* Custom algs: user edits to a Case's Reference algs. One store for every Case,
   alongside the Selection: { caseNumber: { a, a2, pref } }, where a slot key is
   present only once that slot differs from its built-in, and pref only once the
   user has marked a Preferred alg. A Case with no entry is all built-ins. */

/// \returns the Custom alg store, {} for whoever has never edited an alg
function loadCustomAlgs() {
    var store = JSON.parse(loadLocal('ollCustomAlgs', '{}'));
    if (store == null)
        store = {};
    return store;
}

function saveCustomAlgs(store) {
    saveLocal('ollCustomAlgs', JSON.stringify(store));
}

/// \returns the entry keeping i off its built-ins, or null when the Case is all built-ins
function caseAlgEntry(i) {
    return loadCustomAlgs()[i] || null;
}

/// Drops the entry when no key is left in it, so "has an entry" stays "is customized".
function saveCaseAlgEntry(store, i, entry) {
    if (Object.keys(entry).length == 0)
        delete store[i];
    else
        store[i] = entry;
    saveCustomAlgs(store);
}

/// Writes a Custom alg into the given slot ("a" or "a2"). Text that says the same as
/// the built-in is no longer a Custom alg, so it clears the slot back to built-in.
/// \param text of the alg, exactly as the user typed it
function setCustomAlg(i, slot, text) {
    var store = loadCustomAlgs();
    var entry = Object.assign({}, store[i] || {});
    if (text === algsInfo[i][slot])
        delete entry[slot];
    else
        entry[slot] = text;
    saveCaseAlgEntry(store, i, entry);
}

/// Marks one slot Preferred ("a" or "a2"); marking the default slot is no preference
/// at all, so it clears the choice back to the default.
function setPreferredAlg(i, pref) {
    var store = loadCustomAlgs();
    var entry = Object.assign({}, store[i] || {});
    if (pref == "a")
        delete entry.pref;
    else
        entry.pref = "a2";
    saveCaseAlgEntry(store, i, entry);
}


/// The Case as the card should show it: each slot the Custom alg where there is one
/// and the built-in otherwise, pref the Preferred slot, defaulting to "a". This never
/// touches algsInfo — the Setup line and the Selection read built-ins directly.
/// \returns { a, a2, pref } for the Case
function caseAlgs(i) {
    var entry = caseAlgEntry(i) || {};
    return {
        a: entry.a != null ? entry.a : algsInfo[i]["a"],
        a2: entry.a2 != null ? entry.a2 : algsInfo[i]["a2"],
        pref: entry.pref == "a2" ? "a2" : "a",
    };
}



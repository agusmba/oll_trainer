
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
    saveSelection();
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

/// One step back to the shipped data: both built-in Reference algs and the default
/// preference, which is slot one.
function resetCaseAlgs(i) {
    var store = loadCustomAlgs();
    delete store[i];
    saveCustomAlgs(store);
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



/// The only place Mode is written. Mode is stored, never inferred from whether a list
/// is empty: the Recap backlog shrinks as Recap goes through the cases, so it cannot
/// answer "am I in Recap?" on the last case.
/// \param mode "selection", "practice" or "recap"
function setMode(mode)
{
    window.mode = mode;

    var pr = document.getElementsByClassName("practice_layout");
    for (var i = 0; i < pr.length; i++)
        pr[i].style.display = (mode == "selection") ? 'none' : 'initial';

    var se = document.getElementsByClassName("selection_layout");
    for (var i = 0; i < se.length; i++)
        se[i].style.display = (mode == "selection") ? 'initial' : 'none';

    saveSession(); // Mode is stored here, the only place Mode is written
}

/// The UI entry point for changing Mode: store it, seed the Recap backlog, and draw the
/// first Case. \param mode "selection", "practice" or "recap"
/// \param backlog optional Recap Cases to carry; the default seeds a fresh Recap from the
/// Selection. A reload hands back the Cases Recap has not replayed, and a Case the
/// Selection no longer holds is dropped from that carry.
function changeMode(mode, backlog)
{
    // Recap replays the Selection once; Practice has no backlog to carry.
    window.recapBacklog = (mode == "recap") ? casesInSelection(backlog ? backlog : window.selCases.slice()) : [];
    setMode(mode);

    if (mode == "selection")
        renderSelection();
    else
        showScramble();
}

/// \returns the Cases of `cases` that are in the current Selection
function casesInSelection(cases)
{
    var out = [];
    for (var i = 0; i < cases.length; i++)
        if (window.selCases.indexOf(cases[i]) != -1)
            out.push(cases[i]);
    return out;
}

/// The Weights come back after the Goal is restored, because a stored Weight is only valid
/// for the contract it was earned against: timer.js's loadGoal() has already put the stored
/// Goal in place. The times list is reprinted so the restored Weights are what the reader sees.
function restoreWeights()
{
    loadWeights();
    displayStats();
}
window.addEventListener("load", restoreWeights);

/// \returns random integer from 0 to h
function randomNum(h) {
    return Math.floor(Math.random() * h);
}

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

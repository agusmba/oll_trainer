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
}

/// The UI entry point for changing Mode: store it, seed the Recap backlog, and draw
/// the first Case. \param mode "selection", "practice" or "recap"
function changeMode(mode)
{
    setMode(mode);
    // Recap replays the Selection once; Practice has no backlog to carry.
    window.recapBacklog = (mode == "recap") ? window.selCases.slice() : [];

    if (mode == "selection")
        renderSelection();
    else
        showScramble();
}

/// \returns random integer from 0 to h
function randomNum(h) {
    return Math.floor(Math.random() * h);
}

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

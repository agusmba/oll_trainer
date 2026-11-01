// Weights module. A Weight belongs to the (Case, Selection) pair: a Case has no Weight
// until it is selected, and every Weight is bounded so a Case can neither vanish from the
// draw nor dominate it (ADR-0001). Session-scoped — never persisted.

var weightMin = 1 / 8;
var weightMax = 8;

/// case number -> weight; the only place a Weight is stored
var weightMap = new Map();

/// Rebuilds the Weight map at 1 for the current Selection. Called whenever the practice
/// contract changes (selection change, session clear).
function resetWeights()
{
    weightMap = new Map();
    for (var i = 0; i < window.selCases.length; i++)
        weightMap.set(window.selCases[i], 1);
}

/// \returns true when goal is set and dynamic weights are live (goal <= 0 or unset means off)
function goalActive(goal)
{
    return !isNaN(goal) && goal > 0;
}

/// Applies one solve to caseNum's Weight: a solve at or under goal beats it and halves the
/// Weight, a slower one doubles it. No-op when goal <= 0 (dynamic weights off).
/// \param ms solve time in milliseconds
function bumpWeight(caseNum, ms, goal)
{
    if (!goalActive(goal))
        return;
    if (!weightMap.has(caseNum))
        return; // a Weight only exists for a Case in the Selection

    var w = weightMap.get(caseNum);
    w = ms <= goal ? w / 2 : w * 2;
    // clamp at adjustment time (ADR-0001): punishment stays visible and recoverable
    if (w > weightMax) w = weightMax;
    if (w < weightMin) w = weightMin;
    weightMap.set(caseNum, w);
}

/// Draws a Case from cases by Weight, normalising the weights implicitly. Cases with no
/// Weight (outside the Selection) take no part in the draw.
/// \param cases Selection to draw from
/// \param rng optional random [0,1) generator; defaults to Math.random
/// \returns drawn Case number, or null when there is nothing to draw
function pickWeightedCase(cases, rng)
{
    if (!cases)
        return null;

    var drawable = [];
    var total = 0;
    for (var i = 0; i < cases.length; i++) {
        var w = weightOfCase(cases[i]);
        if (w === null)
            continue;
        drawable.push(cases[i]);
        total += w;
    }
    if (drawable.length == 0)
        return null;

    var target = (rng ? rng() : Math.random()) * total;
    var acc = 0;
    for (var i = 0; i < drawable.length; i++) {
        acc += weightOfCase(drawable[i]);
        if (target < acc)
            return drawable[i];
    }
    return drawable[drawable.length - 1]; // only reachable when rng returns exactly 1
}

/// \returns the Weight of caseNum, or null when caseNum is not in the Selection
function weightOfCase(caseNum)
{
    if (!weightMap.has(caseNum))
        return null;
    return weightMap.get(caseNum);
}

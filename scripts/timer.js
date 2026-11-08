var allowStartingTimer;
var timesArray = JSON.parse(loadLocal("olltimesarray", "[]"));
if (timesArray == null) // todo fix when figure out why JSON.parse("[]") returns 0
    timesArray = [];
var lastScramble = "";
var lastCase = 0;
var goal = 0;

displayStats(); // after loading

/// invokes generateScramble() and sets scramble string
function showScramble()
{
    window.allowStartingTimer = false;
    var s;
    if (window.selCases.length == 0) {
        s = "no cases selected - open select cases and pick some OLLs to practice";
        document.getElementById("selInfo").innerHTML = "";
    }
    else {
        s = "scramble: " + generateScramble();
        window.allowStartingTimer = true;
    }

    document.getElementById("scramble").innerHTML = s;
}

function randomElement(arr)
{
    return arr[Math.floor(Math.random()*arr.length)];
}

function confirmUnsel(i) {
    if (confirm("Do you want to unselect this case?")) {
        var index = window.selCases.indexOf(i);
        if (index != -1) {
            window.selCases.splice(index, 1);
            saveSelection();
        } else
            document.getElementById("last_scramble").innerHTML = "wasn\'t  removed lol";
        document.getElementById("last_scramble").innerHTML = i + " was removed";
        showScramble();
    }
}


function displayPracticeInfo() {
    var s = "";
    if (window.mode == "recap")
        s += " | recap mode: <b>" + window.recapBacklog.length + "</b> cases left";
    else
        s += " | practice mode: <b>" + window.selCases.length + "</b> cases selected";

    document.getElementById("selInfo").innerHTML = s;
}

function generateScramble()
{
    if (window.lastScramble != "")
        document.getElementById("last_scramble").innerHTML = "last scramble: " + window.lastScramble +
            " <span onclick='displayBox(event,"+lastCase+")' class='ollNameStats'>("+algsInfo[lastCase]["name"] + ") </span><a role='button' tabindex='0' class='settings' onclick='confirmUnsel("+lastCase+")'>unselect</a>";
    // get random case
    var caseNum = 0;
    if (window.mode == "recap" && window.recapBacklog.length == 0) {
        // Recap's backlog is empty, so Recap is over: the solve that just ran was its
        // last Recap solve (Weights were not touched), and the draw from here is Practice.
        setMode("practice");
    }

    if (window.mode == "recap") {
        // select the case
        caseNum = randomElement(window.recapBacklog);
        // remove it from the backlog
        const index = window.recapBacklog.indexOf(caseNum);
        window.recapBacklog.splice(index, 1);

    } else { // practice
        caseNum = pickWeightedCase(window.selCases);
    }
    // read Mode after the draw decided it, so the info line agrees with what is on screen
    displayPracticeInfo();
    var alg = inverse_scramble(randomElement(window.ollMap[caseNum]));
    var rotation = randomElement(["", "y", "y2", "y'"]);
    var finalAlg = applyRotationForAlgorithm(alg, rotation);

    window.lastScramble = finalAlg;
    window.lastCase = caseNum;

    return finalAlg;
}

// http://stackoverflow.com/questions/15604140/replace-multiple-strings-with-multiple-other-strings
function replaceAll(str,mapObj) {
    if (!mapObj)
        return str;
    var re = new RegExp(Object.keys(mapObj).join("|"),"gi");

    return str.replace(re, function(matched){
        return mapObj[matched];
    });
}

// returns new string with transformed algorithm.
// Returnes sequence of moves that get the cube to the same position as (alg + rot) does, but without cube rotations.
// Example: applyRotationForAlgorithm("R U R'", "y") = "F U F'"
function applyRotationForAlgorithm(alg, rot)
{
    var mapObj;
    if (rot=="y")
        mapObj = {R:"F",F:"L",L:"B",B:"R"};
    if (rot=="y'")
        mapObj = {R:"B",B:"L",L:"F",F:"R"};
    if (rot=="y2")
        mapObj = {R:"L",L:"R",B:"F",F:"B"};

    return replaceAll(alg, mapObj);
}

function inverse_scramble(s)
{
	// deleting parantheses and double spaces
    s = s.replaceAll('[', " ");
    s = s.replaceAll(']', " ");
    s = s.replaceAll('(', " ");
    s = s.replaceAll(')', " ");
    while(s.indexOf("  ") != -1)
            s = s.replaceAll("  ", " ");

    var arr = s.split(" ");
    var result = "";
    for (var i = 0; i < arr.length; i++)
    {
        var it = arr[i];
        if (it.length == 0)
            continue;
        if (it[it.length - 1] == '2')
            result = it + " " + result;
        else if (it[it.length - 1] == '\'')
            result = it.substr(0, it.length - 1) + " " + result;
        else
            result = it + "' " + result;
    }

    return result.substr(0, result.length-1);
}

/*        TIMER        */

var startMilliseconds, stopMiliseconds; // date and time when timer was started
var allowed = true; // allowed var is for preventing auto-repeat when you hold a button
var running = false; var waiting = false;
var timer = document.getElementById("timer");

/// \returns true when the primary input is a finger rather than a pointer: a coarse
/// pointer, or touch points on a browser that reports no pointer. The clock is the same
/// either way; only the instructions written under it change.
function isTouchPrimary()
{
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
        return true;
    return navigator.maxTouchPoints > 0;
}

welcomeMessage = isTouchPrimary() ? "tap to start" : "ready";
timer.innerHTML = welcomeMessage;
document.getElementById("timerCaption").innerHTML = isTouchPrimary()
    ? "press and release to start &middot; press again to stop"
    : "space: press and release to start &middot; any key to stop";

/// Short haptic when a solve stops on a touch screen, so the finger resting on the
/// clock knows the time is in without reading the screen.
function buzz()
{
    if (navigator.vibrate)
        navigator.vibrate(35);
}

var timerActivatingButton = 32; // 17 for ctrl
var timeout;

function msToHumanReadable(duration) {
    if (!Number.isFinite(duration))
        return "-";
    var milliseconds = parseInt((duration%1000)/10)
        , seconds = parseInt((duration/1000)%60)
        , minutes = parseInt((duration/(1000*60))%60)
        , hours = parseInt((duration/(1000*60*60))%24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10 && (minutes > 0 || hours > 0)) ? "0" + seconds : seconds;
    milliseconds = (milliseconds < 10) ? "0" + milliseconds : milliseconds;

    hoursString = (hours == 0) ? "" : hours + ":";
    minutesString = (minutes == 0) ? "" : minutes + ":";

    return hoursString + minutesString + seconds + "." + milliseconds;
}

function displayTime() {
    if (running)
    {
        var d = new Date();
        var diff = d.getTime() - window.startMilliseconds;
        if (diff >= 0)
            timer.innerHTML = msToHumanReadable(diff);
    }
}

/// \returns true when the key is being typed into a field, where it belongs to that
/// field and must not reach the timer
function isTypingTarget(target)
{
    if (!target)
        return false;
    var tag = target.tagName;
    return tag == "INPUT" || tag == "TEXTAREA" || tag == "SELECT" || target.isContentEditable;
}

/// handles keypup and keydown events. Starts timer etc.
document.getElementById("bodyid").addEventListener("keydown", function(event) {

    if (isTypingTarget(event.target))
        return; // typing a Goal is not a timing gesture

    if (overlayOpen())
        return; // the keys belong to the open dialog, not to the clock behind it

    if (window.mode == "selection")
        return; // the clock is off screen; a stray key here must not time a solve

    // prevent space scrolling
    if (event.keyCode === 32) { 
        event.preventDefault();
    }

    // delete hotkey - remove last
    if (event.keyCode == 46 && !running)
    {
        if (!!window.event.shiftKey)
            confirmClear();
        else
            confirmRemLast();
        return;
    }

    if (!allowed || !window.allowStartingTimer)
        return; // preventing auto-repeat and empty scrambles

    if (event.keyCode != 16) // shift
        allowed = false;

    if (running)
    {
        // stop timer on any button
        timerStop();
        return;
    }
    else if (event.keyCode == timerActivatingButton)
    {
        timerSetReady();
        return;
    }
});

/// keyup event for starting the timer
document.getElementById("bodyid").addEventListener("keyup", function(event) {
    allowed = true;
    if (overlayOpen() || window.mode == "selection")
        return; // whatever took the keydown owns this release too
    if (!window.allowStartingTimer)
        return; // preventing auto-repeat
    if (!running && !waiting && (event.keyCode == timerActivatingButton)) {
        timerStart();
    }
    else {
        timerAfterStop();
    }
});

/// Press-and-release on the clock arms it and starts it, the way a StackMat does: the
/// finger covers the timer while solving, lifts to start, presses again to stop.
/// Pointer Events cover finger, pen and mouse alike; touch events are the fallback for
/// browsers without them, so the clock answers to one gesture source only.
if (window.PointerEvent) {
    timer.addEventListener("pointerdown", function(event) {
        event.preventDefault();
        handleTouchStart();
    }, false);
    timer.addEventListener("pointerup", function(event) {
        event.preventDefault();
        handleTouchEnd();
    }, false);
    timer.addEventListener("pointercancel", function(event) { timerDisarm(); }, false);
} else {
    timer.addEventListener("touchstart", handleTouchStart, false);
    timer.addEventListener("touchend", handleTouchEnd, false);
}

timer.addEventListener("contextmenu", function(event) { event.preventDefault(); }, false);

/// Drops an arm that never became a solve: the pointer left the clock before releasing.
function timerDisarm() {
    if (!running && !waiting) {
        timer.classList.remove("is-ready");
        timer.innerHTML = welcomeMessage;
    }
}

function handleTouchEnd() {
    if (!window.allowStartingTimer)
        return; // preventing auto-repeat
    if (!running && !waiting) {
        timerStart();
    }
    else {
        timerAfterStop();
    }
}

function handleTouchStart() {
    if (running)
        timerStop();
    else {
        timerSetReady(); // set green back
    }
}

function timerStop() {
    waiting = true;
    running = false;
    clearTimeout(timeout);

    var d = new Date();
    stopMiliseconds = d.getTime();
    timer.innerHTML = msToHumanReadable(stopMiliseconds - startMilliseconds);
    timer.classList.remove("is-ready");
    timer.classList.add("is-stopped");
    buzz();

    appendStats();
    showScramble();
}

function timerSetReady() {
    waiting = false;
    timer.innerHTML = "0.00";
    timer.classList.remove("is-stopped");
    timer.classList.add("is-ready");
}

function timerStart() {
    var d = new Date();
    startMilliseconds = d.getTime();
    running = true;
    timeout = setInterval(displayTime, 10);
    timer.classList.remove("is-ready");
    timer.classList.remove("is-stopped");
}

function timerAfterStop() {
    timer.classList.remove("is-stopped");
}


// Sizes are the user's, kept in localStorage, but handed to CSS as a custom property the
// stylesheet clamps against the viewport: a size picked on a desktop still fits a phone.
var defTimerSize = 60;
var defScrambleSize = 25;
var minTimerSize = 24;
var minScrambleSize = 12;
var timerSize = parseInt(loadLocal("zblltimerSize", ""+defTimerSize));
if (isNaN(timerSize) || timerSize <= 0)
    timerSize = defTimerSize;
var scrambleSize = parseInt(loadLocal("zbllscrambleSize", ""+defScrambleSize));
if (isNaN(scrambleSize) || scrambleSize <= 0)
    scrambleSize = defScrambleSize;

/// \param item "timer" or "scramble"
function applySize(item)
{
    var el = document.getElementById(item);
    if (!el)
        return;
    el.style.setProperty("--" + item + "-size", window[item + "Size"] + "px");
}

adjustSize('scramble', 0);
adjustSize('timer', 0);

/// \param item "timer" or "scramble" \param inc pixels to add, negative to shrink
function adjustSize(item, inc)
{
    if (item != 'timer' && item != 'scramble')
        return;
    var min = item == 'timer' ? minTimerSize : minScrambleSize;
    window[item + "Size"] = Math.max(min, window[item + "Size"] + inc);
    applySize(item);
    saveLocal("zbll" + item + "Size", ""+window[item + "Size"]);
}

function resetDefaults()
{
    window.timerSize = defTimerSize;
    window.scrambleSize = defScrambleSize;
    adjustSize('scramble', 0);
    adjustSize('timer', 0);
}

/* STATS */

// http://stackoverflow.com/questions/1787322/htmlspecialchars-equivalent-in-javascript
function escapeHtml(text) {
  var map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };

  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

/// [0: ResultInstance, 1: ResultInstance, ...]

// invoked right after the timer stopped
function appendStats()
{
    // assuming the time can be grabbed from timer label, and the case - window.lastCase
    var result = makeResultInstance();
    window.timesArray.push(result);
    // Practice steers the draw by Weight; Recap replays the Selection, so its solves
    // must not skew the Weights earned against the Goal.
    if (window.mode == "practice") bumpWeight(window.lastCase, result.ms, window.goal);
    displayStats();
}

/// removes time from array and invokes displayStats()
function removeTime(i)
{
    window.timesArray.splice(i, 1);
    displayStats();
}


function updateInstancesIndeces() {
    for (var i = 0; i < window.timesArray.length; i++)
        window.timesArray[i]["index"] = i;
}

/// requests confirmation and deletes result
function confirmRem(i)
{
    var inst = window.timesArray[i];
    if (confirm("Are you sure you want to remove this time?\n\n" + inst["time"]))
    {
        removeTime(i);
        updateInstancesIndeces();
        displayStats();
    }
}

function confirmRemLast()
{
    var i = window.timesArray.length;
    if (i != 0)
        confirmRem(i - 1);
}

/// requests confirmation and empty times array (clear session)
function confirmClear()
{
    if (confirm("Are you sure you want to clear session?")) {
        window.timesArray = [];
        resetWeights();
        document.getElementById('infoHeader').innerHTML = ('')
        displayStats();
    }
}

function displayBox(event,i) {
    // the peek is a dialog: it shows on top of the solve, and the backdrop or Esc
    // dismisses it
    document.getElementById("hintWindowBack").style.display='block';
    document.getElementById("hintWindow").style.display='flex';
    document.getElementById("boxTitle").innerHTML = '#' + i + " " + algsInfo[i]["name"];
    document.getElementById("boxalg").innerHTML = algsInfo[i]["a"];
    if (algsInfo[i]["a2"] != "")
        document.getElementById("boxalg").innerHTML += "<br><br>" + algsInfo[i]["a2"];
    //document.getElementById("boxsetup").innerHTML = "Setup: " + window.ollMap[i][0];
    document.getElementById("boxsetup").innerHTML = "Setup: " + inverse_scramble(algsInfo[i]["a"]);
    document.getElementById("boxImg").src="pic/"+i+".svg";
    document.getElementById("boxImg").alt = "Case " + i + " " + algsInfo[i]["name"];
    var close = document.getElementById("boxClose");
    if (close)
        close.focus();
}

function hideBox() {
    document.getElementById("hintWindow").style.display='none';
    document.getElementById("hintWindowBack").style.display='none';
}

function hideBox() {
    document.getElementById("hintWindow").style.display='none';
    document.getElementById("hintWindowBack").style.display='none';
}

/// \param r - result instance (see makeResultInstance)
/// \returns html code for displaying the instance
function makeHtmlDisplayableTime(r)
{
    var classname = (r == window.timesArray[window.timesArray.length - 1]) ? "timeResultBold" : "timeResult";
    return resultString = "<span class='"+ classname +"' title='" +
            escapeHtml(r["details"]) +"' onclick='confirmRem("
            + r["index"] + ")' >" + r["time"] + "</span>";
}

/// fills resultInfo container with info about given result instance
/// \param r result instsnce (see makeResultInstance)
/// set \param r to null if you want to clear result info
/// displays averages etc.
/// fills "times" right panel with times and last result info
function displayStats()
{
    saveLocal("olltimesarray", JSON.stringify(window.timesArray));
    var len = window.timesArray.length;

    var el = document.getElementById("times");
    if (len == 0)
    {
        el.innerHTML = "";
        document.getElementById("infoHeader").innerHTML = '';
        return;
    }

    // One block per Case, in the order the case picker groups them, so the results read
    // in the order the user picked them rather than the order the solves happened to run.
    var resultsByCase = []; // [57: [...], 12: [...], ...];
    for (var i = 0; i < len; i++)
    {
        var currentOll = window.timesArray[i]["case"];
        if (resultsByCase[currentOll] == null)
            resultsByCase[currentOll] = [];
        resultsByCase[currentOll].push( window.timesArray[i] );
    }

    var keys = Object.keys(resultsByCase);
    keys.sort(function(a, b) {
        // algsOrder holds case numbers, Object.keys gives strings: coerce before looking up
        return algsOrder.indexOf(parseInt(a)) - algsOrder.indexOf(parseInt(b)); // algsinfo grouping order
    });

    var s = "";
    for (var j = 0; j < keys.length; j++) {
        var oll = keys[j];
        var results = resultsByCase[oll];
        var chips = "";
        var meanForCase = 0.0;
        var bestForCase = Infinity;
        for (var i = 0; i < results.length; i++)
        {
            chips += makeHtmlDisplayableTime(results[i]);
            // avg
            meanForCase *= i/(i+1);
            meanForCase += results[i]["ms"] / (i+1);
            if (results[i]["ms"] < bestForCase)
                bestForCase = results[i]["ms"];
        }
        var weight = weightOfCase(parseInt(oll));
        var weightText = goalActive(window.goal) && weight !== null ? "[weight: " + weight + "] " : "";
        s += "<div class='case-stat'><div class='ollNameHeader'>" +
            "<span class='ollNameStats' onclick='displayBox(event,"+oll+")'>" + algsInfo[oll]["name"] + "</span>" +
            "<span class='case-stat-nums'>" + weightText + "avg " + msToHumanReadable(meanForCase) +
            " &middot; best " + msToHumanReadable(bestForCase) + " &middot; " + results.length + " solves</span>" +
            "</div><div class='chips'>" + chips + "</div></div>";
    }
    el.innerHTML = s;

    document.getElementById("infoHeader").innerHTML = (len == 0 ? '' : len+' ');
}

function makeResultInstance()
{
    var currentTime = document.getElementById("timer").innerHTML;
    var details = window.lastScramble;
    var index = window.timesArray.length;

    return {
        "time": currentTime,
        "ms": timeStringToMseconds(currentTime) * 10, // *10 because current time 1.23 display only hundreths, not thousandth of a second
        "details": details,
        "index": index,
        "case": window.lastCase
    };
}

// converts timestring to milliseconds (int)
// 1:06.15 -> 6615
function timeStringToMseconds(s) {
        if (s == "")
            return -1;
        var parts = s.split(":");
        var secs = parseFloat(parts[parts.length - 1]);
        if (parts.length > 1) // minutes
            secs += parseInt(parts[parts.length - 2]) * 60;
        if (parts.length > 2) // hrs
            secs += parseInt(parts[parts.length - 3]) * 3600;
        if (isNaN(secs))
            return -1;
        return Math.round(secs * 100);
}

// Style and theme live in scripts/ui.js: the palette is CSS custom properties, so
// painting the app is three property writes rather than a walk over every element.

/// \returns the Goal held by the goal input; an empty or invalid input reads as 0, meaning dynamic weights off
function readGoal() {
    var value = document.querySelector('#goal_in').valueAsNumber;
    return isNaN(value) ? 0 : value;
}

function applyGoal() {
    window.goal = readGoal();
    // the Goal is part of the practice contract: every Weight is earned against it,
    // so it is stale the moment the Goal changes (ADR-0001), including when the Goal
    // is turned off (0, negative or empty).
    resetWeights();
    displayStats();
}

/// Resets every Weight in the Selection to uniform, from the link beside the goal input.
/// The only reset that is not destructive: the Selection and the times history survive.
function applyResetWeights() {
    resetWeights();
    displayStats();
}

/// The Goal is never app-persisted, but browsers restore form values across a reload, so the
/// goal input can come back holding the previous Goal. Whatever that input shows once the page
/// is loaded is the Goal in effect; showing a Goal the app is not using would read as a bug.
/// Weights stay uniform here: loadSelection() already rebuilt them (ADR-0001).
function loadGoal() {
    window.goal = readGoal();
    displayStats(); // reprint the times list, now that weights may be live again
}

// restoration timing is up to the browser, so reconcile at load, the latest point that is
// guaranteed to be after it (and after loadSelection() rebuilt the weights)
window.addEventListener("load", loadGoal);

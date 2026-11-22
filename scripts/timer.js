var allowStartingTimer;
var timesArray = JSON.parse(loadLocal("olltimesarray", "[]"));
if (timesArray == null) // todo fix when figure out why JSON.parse("[]") returns 0
    timesArray = [];
var lastScramble = "";
var lastCase = 0;
var goal = 0;

displayStats(); // after loading

function showScramble()
{
    window.allowStartingTimer = false;
    var s;
    if (window.selCases.length == 0) {
        s = "no cases selected - open select cases and pick some OLLs to practice";
        document.getElementById("selInfo").innerHTML = "";
    }
    else {
        s = generateScramble();
        window.allowStartingTimer = true;
    }

    document.getElementById("scramble").innerHTML = s;
    // The Selection tiles are part of redrawing the solve screen: the Selection can change
    // here (a Case unselected from the last scramble), and the Weights come from the solve
    // that was just recorded.
    displayCaseSummary();
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
        s += "recap mode: <b>" + window.recapBacklog.length + "</b> cases left";
    else
        s += "practice mode: <b>" + window.selCases.length + "</b> cases selected";

    document.getElementById("selInfo").innerHTML = s;
}

function generateScramble()
{
    if (window.lastScramble != "")
        document.getElementById("last_scramble").innerHTML = "last scramble: " + window.lastScramble +
            " <span onclick='displayBox(event,"+lastCase+")' class='ollNameStats'>("+algsInfo[lastCase]["name"] + ") </span><a role='button' tabindex='0' class='settings' onclick='confirmUnsel("+lastCase+")'>unselect</a>";
    var caseNum = 0;
    if (window.mode == "recap" && window.recapBacklog.length == 0) {
        // Recap's backlog is empty, so Recap is over: the solve that just ran was its
        // last Recap solve (Weights were not touched), and the draw from here is Practice.
        setMode("practice");
    }

    if (window.mode == "recap") {
        caseNum = randomElement(window.recapBacklog);
        const index = window.recapBacklog.indexOf(caseNum);
        window.recapBacklog.splice(index, 1);
        saveSession(); // a reload must pick Recap up where this draw left off

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


var startMilliseconds, stopMiliseconds; // date and time when timer was started
var allowed = true; // allowed var is for preventing auto-repeat when you hold a button
var running = false; var waiting = false;
var timer = document.getElementById("timer");
var cancelBand = document.getElementById("cancelBand");

// The press is in progress: armed at press-down, gateMet once the Start gate is crossed.
// A release starts only past the gate, and only a drag past the gate shows Cancel.
var armed = false; var gateMet = false;
var pressX = 0, pressY = 0;
var armedPointerId = null; // the pointer that armed; its release starts, others are ignored
var armedTouchId = null; // the same finger in the touch-event fallback, by identifier
var gateTimeout;
var lastStoppedText = null; // the time the clock reads back after an arm is abandoned

// The hand that stops the clock keeps moving: a second finger, or the same finger tapping
// again, lands on the clock straight after the stop. A start arriving within this window is
// the tail of that hand, not a new solve.
var startCooldownMs = 500;

/// \returns true when a start gesture lands within the cooldown of the stop that just happened
function startTooSoon() {
    if (stopMiliseconds == null)
        return false; // no solve has been stopped yet, so nothing to be the tail of
    return new Date().getTime() - stopMiliseconds < startCooldownMs;
}

/// \returns true when the primary input is a finger rather than a pointer: a coarse
/// pointer, or touch points on a browser that reports no pointer. The clock is the same
/// either way; only the instructions written under it change.
function isTouchPrimary()
{
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
        return true;
    return navigator.maxTouchPoints > 0;
}

welcomeMessage = isTouchPrimary() ? "press and hold" : "ready";
timer.innerHTML = welcomeMessage;
document.getElementById("timerCaption").innerHTML = isTouchPrimary()
    ? "press and hold to start &middot; drag for Cancel &middot; press again to stop"
    : "space: press and release to start &middot; Esc cancels &middot; any key to stop";

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

    if (event.keyCode == 46 && !running)
    {
        if (!!window.event.shiftKey)
            confirmClear();
        else
            confirmRemLast();
        return;
    }

    if (!window.allowStartingTimer)
        return; // no Cases selected: the clock is refused

    if (running)
    {
        timerStop();
        allowed = false; // the key that stopped the clock must not arm at its first repeat
        return;
    }
    if (event.keyCode == 27)
    {
        timerDisarm(); // ESC abandons an armed clock, and works while Space is held
        return;
    }
    if (!allowed)
        return; // preventing auto-repeat

    if (event.keyCode != 16) // shift
        allowed = false;

    if (event.keyCode == timerActivatingButton && !armed)
    {
        armed = true;
        waiting = false;
        if (!startTooSoon())
            timerSetReady(); // the keyboard is exempt from the gate: Space arms and focuses
        return;
    }
});

document.getElementById("bodyid").addEventListener("keyup", function(event) {
    allowed = true;
    if (overlayOpen() || window.mode == "selection")
        return; // whatever took the keydown owns this release too
    if (!window.allowStartingTimer)
        return; // preventing auto-repeat
    if (event.keyCode == timerActivatingButton)
    {
        if (!running && armed && gateMet)
            timerStart();
        else
            timerDisarm(); // a spent press leaves no arm over the cooldown
    }
    else
        timerAfterStop();
});

/// Press-and-release on the clock arms it and starts it, the way a StackMat does: the
/// finger covers the timer while solving, lifts to start, presses again to stop.
/// Pointer Events cover finger, pen and mouse alike; touch events are the fallback for
/// browsers without them, so the clock answers to one gesture source only.
if (window.PointerEvent) {
    timer.addEventListener("pointerdown", function(event) {
        event.preventDefault();
        handleTouchStart(event);
    }, false);
    timer.addEventListener("pointermove", handleTouchMove, false);
    timer.addEventListener("pointerup", function(event) {
        event.preventDefault();
        handleTouchEnd(event);
    }, false);
    timer.addEventListener("pointercancel", handlePointerCancel, false);
} else {
    timer.addEventListener("touchstart", handleTouchStart, false);
    timer.addEventListener("touchmove", handleTouchMove, false);
    timer.addEventListener("touchend", handleTouchEnd, false);
    timer.addEventListener("touchcancel", timerDisarm, false);
}

timer.addEventListener("contextmenu", function(event) { event.preventDefault(); }, false);

/// Drops an arm that never became a solve, and leaves Timer focus: a release before the
/// gate, a release on the Cancel band, a browser pointercancel, or ESC.
function timerDisarm() {
    if (running)
        return; // the clock is counting, so there is no arm to drop
    clearTimeout(gateTimeout);
    armed = false;
    armedPointerId = null;
    gateMet = false;
    waiting = false;
    timer.classList.remove("is-ready");
    timer.innerHTML = lastStoppedText || welcomeMessage;
    exitTimerFocus();
}

/// \returns the press point of a pointer or touch event: a touch event carries its own
/// points, a pointer event answers at the pointer.
function pressPoint(event) {
    var t = (event.changedTouches && event.changedTouches.length)
        ? event.changedTouches[0]
        : (event.touches && event.touches.length ? event.touches[0] : event);
    return { x: t.clientX, y: t.clientY };
}

/// \returns true when a pointer event belongs to a finger other than the armed one
function isOtherPointer(event) {
    if (armedPointerId != null && event.pointerId != null)
        return event.pointerId !== armedPointerId;
    if (armedTouchId != null && event.changedTouches && event.changedTouches.length)
        return event.changedTouches[0].identifier !== armedTouchId; // a lifted finger that never armed
    return false;
}

/// The browser takes the gesture away: a palm rejection, a system gesture. The arm is
/// dropped and nothing starts.
function handlePointerCancel(event) {
    if (isOtherPointer(event))
        return; // a second pointer leaving is not the armed press
    timerDisarm();
}

/// Timer focus: the solve screen reduced to the clock alone, because the eye is on the
/// cube and the Goal, the times and the topbar crowd the timer.
function enterTimerFocus() {
    document.getElementById("bodyid").classList.add("timer-focus");
}

function exitTimerFocus() {
    document.getElementById("bodyid").classList.remove("timer-focus");
    cancelBand.hidden = true;
}

/// \returns true when a release point lands inside the Cancel band
function overCancelBand(x, y) {
    if (cancelBand.hidden)
        return false;
    var r = cancelBand.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/// Press-down arms the clock and captures the pointer, so a finger that wanders keeps
/// the arm instead of dropping it. A press inside the Start cooldown never arms, so the
/// tail of the stopping hand cannot flash the focus screen; its release begins a fresh
/// gesture. A gate of 0 is met at press-down.
function handleTouchStart(event) {
    if (running) {
        timerStop();
        return;
    }
    if (armed || !window.allowStartingTimer)
        return; // a second finger while armed is ignored; no Cases selected refuses the press
    if (startTooSoon())
        return; // the tail of the hand that stopped the clock, not a new solve
    var p = pressPoint(event);
    armed = true;
    armedPointerId = event.pointerId != null ? event.pointerId : null;
    armedTouchId = (event.changedTouches && event.changedTouches.length)
        ? event.changedTouches[0].identifier : null; // the touch fallback has no pointerId
    pressX = p.x; pressY = p.y;
    if (event.pointerId != null && timer.setPointerCapture)
        timer.setPointerCapture(event.pointerId);
    if (startGateMs <= 0)
        timerSetReady();
    else
        gateTimeout = setTimeout(timerSetReady, startGateMs);
}

/// A drag past 15 px inside Timer focus raises the Cancel band, and the band stays for
/// the rest of the press: a target the thumb has to chase is not a target.
function handleTouchMove(event) {
    if (isOtherPointer(event))
        return; // a second finger on the clock does not move the armed press
    if (!armed || !gateMet || !cancelBand.hidden)
        return; // the band is raised once, and stays for the rest of the press
    var p = pressPoint(event);
    if (Math.hypot(p.x - pressX, p.y - pressY) > 15)
        cancelBand.hidden = false;
}

/// The release decides by where it lands: on the Cancel band it abandons the arm,
/// anywhere else it starts the solve, and before the gate it is a no-op.
function handleTouchEnd(event) {
    if (isOtherPointer(event))
        return; // a release from a finger that never armed: the armed press keeps its gate
    clearTimeout(gateTimeout);
    if (!armed) {
        timerAfterStop(); // the release of the press that stopped the solve
        return;
    }
    if (!gateMet) {
        timerDisarm(); // released before the gate: no focus, no start, no solve
        return;
    }
    var p = pressPoint(event);
    if (overCancelBand(p.x, p.y))
        timerDisarm();
    else
        timerStart();
}

function timerStop() {
    waiting = true;
    running = false;
    clearTimeout(timeout);

    var d = new Date();
    stopMiliseconds = d.getTime();
    lastStoppedText = msToHumanReadable(stopMiliseconds - startMilliseconds);
    timer.innerHTML = lastStoppedText;
    timer.classList.remove("is-ready");
    timer.classList.add("is-stopped");
    buzz();

    appendStats();
    showScramble();
    exitTimerFocus();
}

/// The Start gate is met: the clock reads 0.00 ready, and Timer focus begins.
function timerSetReady() {
    gateMet = true;
    timer.innerHTML = "0.00";
    timer.classList.remove("is-stopped");
    timer.classList.add("is-ready");
    enterTimerFocus();
}

function timerStart() {
    armed = false;
    gateMet = false;
    armedPointerId = null;
    cancelBand.hidden = true; // a running solve has nothing to cancel: the band is gone
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

// The Start gate is the user's, like the sizes: the touch held before the release
// starts, 500 ms by default. 0 means the gate is met at press-down, so a quick tap
// starts as it used to.
var defStartGateMs = 500;
var startGateMs = parseInt(loadLocal("zbllstartGateMs", ""+defStartGateMs));
if (isNaN(startGateMs) || startGateMs < 0 || startGateMs > 1000)
    startGateMs = defStartGateMs;
document.getElementById("startGate_in").value = startGateMs;

/// Takes the Start gate from its field, clamps it to the range the field allows, stores
/// it, and repaints the field to the value in effect.
function applyStartGate() {
    var field = document.getElementById("startGate_in");
    var ms = parseInt(field.value, 10);
    if (isNaN(ms) || ms < 0)
        ms = defStartGateMs;
    if (ms > 1000)
        ms = 1000;
    startGateMs = ms;
    saveLocal("zbllstartGateMs", ""+ms);
    field.value = ms;
}

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
    saveWeights(); // the Weights earned against this Goal and Selection survive a reload
    displayStats();
}

function removeTime(i)
{
    window.timesArray.splice(i, 1);
    displayStats();
}


function updateInstancesIndeces() {
    for (var i = 0; i < window.timesArray.length; i++)
        window.timesArray[i]["index"] = i;
}

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

function confirmClear()
{
    if (confirm("Are you sure you want to clear session?")) {
        window.timesArray = [];
        resetWeights();
        saveWeights(); // the cleared contract is the one a reload must bring back
        displayStats(); // repaints the cleared list and stores it, so a reload cannot bring the times back
    }
}

/* Case card: the two Reference algs are editable in place, always in built-in order.
   One of them is Preferred, marked by its star; the other slot's star is the only way
   to move the mark. If the Preferred alg opens with a y-rotation the case picture is
   turned to match — the rotation is still printed in the alg, but faint, as already
   applied. */

// Directions checked against a rendered pic/31.svg: the picture is the overhead view
// (its side stickers point outward), so a y — the cube turning as U does seen from
// above — turns it 90 degrees clockwise on screen, which is exactly CSS rotate(90deg).
var yRotationDegrees = { "y": 90, "y2": 180, "y'": 270, "y2'": 180 }; // y2' is the same turn as y2

/// \returns a match when the alg's first move is a y-rotation — y, y', y2 or y2',
/// surrounded by whitespace, dots, commas or parentheses — its whole leading stretch,
/// or null. Leading x or z rotations never match.
function leadingYRotation(alg) {
    return /^[\s.,()]*(y2'|y2|y'|y)[\s.,()]*/.exec(alg);
}

/// \returns the degrees to turn the picture, or null when the alg has no leading y-rotation
function pictureRotationDegrees(alg) {
    var m = leadingYRotation(alg);
    return m == null ? null : yRotationDegrees[m[1]];
}

/// \returns the alg as HTML; when its rotation has been applied to the picture, the
/// leading stretch carries it rendered faint.
function algHtml(raw, pictureRotated) {
    if (pictureRotated) {
        var m = leadingYRotation(raw);
        if (m != null)
            return "<span class='alg-faint'>" + escapeHtml(m[0]) + "</span>"
                + escapeHtml(raw.slice(m[0].length));
    }
    return escapeHtml(raw);
}

/// Prints the card's two Reference alg slots — exactly two, ever, in built-in order —
/// each with its star and an in-place editable text target. An empty slot reads as an
/// invitation to add an alg; nothing else about the card changes as the user works.
function renderCaseAlgs(i) {
    var view = caseAlgs(i);
    var slots = ["a", "a2"];
    var s = "";
    for (var k = 0; k < slots.length; k++) {
        var slot = slots[k];
        var preferred = slot == view.pref;
        var text = view[slot];
        s += "<div class='alg-slot" + (preferred ? " alg-slot-preferred" : "") + "'"
            + " id='alg" + i + slot + "'>"
            // the mark itself is inert; only a slot that is not Preferred can be asked
            // for it, so a tap on the mark can never be a dead control
            + (preferred
                ? "<span class='alg-star' role='img' aria-label='Preferred alg'"
                    + " title='the Preferred alg'>&#9733;</span>"
                : "<a role='button' tabindex='0' class='alg-star' aria-label='make this the Preferred alg'"
                    + " title='make this the Preferred alg' onclick='preferAlg(event,"
                    + i + "," + JSON.stringify(slot) + ")'>&#9734;</a>")
            + "<a role='button' tabindex='0' class='alg-text' title='edit this Reference alg'"
            + " onclick='editAlg(event," + i + "," + JSON.stringify(slot) + ")'>"
            + (text == "" ? "<i class='alg-empty'>(no alg &middot; tap to add)</i>" : algHtml(text, preferred))
            + "</a>"
            + "</div>";
    }
    document.getElementById("boxalg").innerHTML = s;

    var degrees = pictureRotationDegrees(view[view.pref]);
    document.getElementById("boxImg").style.transform =
        degrees == null ? "" : "rotate(" + degrees + "deg)";
}

/// Pins the card's Reference alg column to the width it had when the card opened, and
/// never to more than the card can show. The column is as wide as its longest Reference
/// alg, so a row changing text — a retype, a Custom alg cleared — would rewrap the card,
/// which would resize and re-centre itself under the reader's thumb. Rows wrap inside
/// the pinned column instead.
function lockAlgColumn() {
    var box = document.getElementById("box");
    var boxalg = document.getElementById("boxalg");
    var pad = getComputedStyle(box);
    var room = box.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    boxalg.style.width = "";
    boxalg.style.width = Math.min(Math.ceil(boxalg.getBoundingClientRect().width), room) + "px";
}

// a narrower screen has to re-pin: the width the card chose may no longer fit, and a
// column wider than the card puts it into a sideways scroll
window.addEventListener("resize", function () {
    if (document.getElementById("hintWindow").style.display == "flex")
        lockAlgColumn();
});

/// Swaps a slot's text for a one-line field so the Reference alg can be retyped in
/// place: Enter or losing focus saves it as a Custom alg, Esc abandons the edit. Once
/// the slot is Custom, the field also carries a mark that clears it back to the
/// built-in — recovering shipped text happens there, so the idle card never reorganizes.
function editAlg(event, i, slot) {
    var holder = document.getElementById("alg" + i + slot);
    if (holder == null)
        return;
    var entry = caseAlgEntry(i);
    var customized = entry != null && entry[slot] != null;
    // autocapitalize and autocorrect would otherwise eat the quotes and cases of a
    // phone keyboard typing R U R' U'
    holder.innerHTML = "<input type='text' class='alg-edit' autocomplete='off'"
        + " spellcheck='false' autocapitalize='none' autocorrect='off' value='"
        + escapeHtml(caseAlgs(i)[slot]) + "'>";
    if (customized)
        holder.insertAdjacentHTML("beforeend",
            "<a role='button' tabindex='0' class='alg-restore'"
            + " aria-label='clear this Custom alg'"
            + " title='clear this Custom alg; the built-in Reference alg comes back'"
            + ">&#8634;</a>");
    var input = holder.firstElementChild;
    var restore = holder.querySelector(".alg-restore");
    input.focus();
    input.select();
    var settled = false;
    function commit() {
        if (settled)
            return;
        settled = true;
        setCustomAlg(i, slot, input.value.trim());
        renderCaseAlgs(i);
        refocusAlgText("#alg" + i + slot);
    }
    function abandon() {
        if (settled)
            return;
        settled = true;
        renderCaseAlgs(i);
        refocusAlgText("#alg" + i + slot);
    }
    function restoreBuiltIn() {
        settled = true; // the text being typed is discarded by restoring, by design
        setCustomAlg(i, slot, algsInfo[i][slot]);
        renderCaseAlgs(i);
        refocusAlgText("#alg" + i + slot);
    }
    input.addEventListener("blur", function (ev) {
        // bound for the restore, the field keeps its commit: the restore has its own
        // way out, and re-rendering under the keyboard would carry it out of the row.
        // A tap on anything unfocusable reports no relatedTarget and must still commit.
        if (restore != null && ev.relatedTarget == restore)
            return;
        commit();
    });
    input.addEventListener("keydown", function (ev) {
        if (ev.keyCode == 13)
            commit();
        else if (ev.keyCode == 27) {
            ev.stopPropagation(); // Esc backs out of the edit, not out of the card
            abandon();
        }
    });
    if (restore != null) {
        restore.addEventListener("mousedown", function (ev) {
            ev.preventDefault(); // stay in the field: the half-typed text must not commit first
        });
        restore.addEventListener("click", function (ev) {
            ev.preventDefault();
            restoreBuiltIn();
        });
    }
}

/// Moves the Preferred mark to a slot, which is the only thing a star can do: the mark
/// lands here, and the picture turns to this alg's leading y-rotation — or back to
/// upright when this one has none.
function preferAlg(event, i, slot) {
    event.stopPropagation();
    setPreferredAlg(i, slot);
    renderCaseAlgs(i);
    refocusAlgText("#alg" + i + slot);
}


// A re-render of the algs detaches whatever control was focused. A keyboard user left
// on the body walks out of the dialog on the next Tab, which the focus trap — a
// listener on the dialog itself — has no way to catch, so every path that re-renders
// puts the focus back on a slot instead.
function refocusAlgText(slotSelector) {
    var text = document.querySelector(slotSelector + " .alg-text");
    if (text != null)
        text.focus();
}

function displayBox(event,i) {
    // the peek is a dialog: it shows on top of the solve, and the backdrop or Esc
    // dismisses it
    document.getElementById("hintWindowBack").style.display='block';
    document.getElementById("hintWindow").style.display='flex';
    document.getElementById("boxTitle").innerHTML = '#' + i + " " + algsInfo[i]["name"];
    document.getElementById("boxsetup").innerHTML = "Setup: " + inverse_scramble(algsInfo[i]["a"]);
    // The Setup line always derives from the built-in Reference alg; a Custom alg never moves it.
    document.getElementById("boxImg").src="pic/"+i+".svg";
    document.getElementById("boxImg").alt = "Case " + i + " " + algsInfo[i]["name"];
    renderCaseAlgs(i);
    lockAlgColumn();
    var close = document.getElementById("boxClose");
    if (close)
        close.focus();
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

/// \returns the hue painting a Case tile. Weight runs 1/8..8 and is mapped over log2,
/// so a Case drawn rarely is green, one drawn often is red, and an even draw is amber.
/// \param weight of the Case, or null when it is not in the Selection
function weightHue(weight)
{
    if (weight == null)
        return 60;
    var t = (Math.log2(weight) + 3) / 6;
    if (t < 0)
        t = 0;
    if (t > 1)
        t = 1;
    return Math.round(120 * (1 - t));
}

/// Fills #caseSummary with one tile per Case in the Selection: its mean solve time, filled
/// by Weight. Every selected Case gets a tile, so one with no times yet still reads as part
/// of the draw. Tiles open the Case card, the same as a Case name in the times history.
function displayCaseSummary()
{
    var el = document.getElementById("caseSummary");
    if (!el)
        return;

    var cases = window.selCases.slice();
    if (cases.length == 0)
    {
        el.hidden = true;
        el.innerHTML = "";
        return;
    }

    // mean ms per Case, from the same history the times list reads
    var solved = {}; // { 12: { sum, n }, ... }
    for (var i = 0; i < window.timesArray.length; i++)
    {
        var currentOll = window.timesArray[i]["case"];
        if (solved[currentOll] == null)
            solved[currentOll] = { sum: 0, n: 0 };
        solved[currentOll].sum += window.timesArray[i]["ms"];
        solved[currentOll].n += 1;
    }

    // the order the case picker groups them in, not the order the solves happened to run
    cases.sort(function (a, b) {
        return algsOrder.indexOf(a) - algsOrder.indexOf(b);
    });

    var s = "<div class='summary-head'><span class='summary-title'>Selection</span>" +
        "<span class='summary-legend'>colour: Weight, red drawn more, green less</span></div>" +
        "<div class='case-tiles'>";
    for (var j = 0; j < cases.length; j++)
    {
        var oll = cases[j];
        var meanText = solved[oll] ? msToHumanReadable(solved[oll].sum / solved[oll].n) : "-";
        var title = escapeHtml(algsInfo[oll]["name"]) + (solved[oll] ? " - mean " + meanText : " - no times yet");
        s += "<button type='button' class='case-tile" + (solved[oll] ? "" : " case-tileEmpty") + "'" +
            " style='--case-hue:" + weightHue(weightOfCase(oll)) + "'" +
            " onclick='displayBox(event," + oll + ")' title='" + title + "'" +
            " aria-label='" + oll + " " + escapeHtml(algsInfo[oll]["name"]) + "'>" +
            "<span class='tile-case'>" + oll + "</span>" +
            "<span class='tile-mean'>" + meanText + "</span></button>";
    }

    el.innerHTML = s + "</div>";
    el.hidden = false;
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
    displayCaseSummary();
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
    saveGoal(window.goal);
    // the Goal is part of the practice contract: every Weight is earned against it,
    // so it is stale the moment the Goal changes (ADR-0001), including when the Goal
    // is turned off (0, negative or empty).
    resetWeights();
    saveWeights(); // a changed contract means uniform weights, the only thing a reload can bring back
    displayStats();
}

/// Resets every Weight in the Selection to uniform, from the link beside the goal input.
/// The only reset that is not destructive: the Selection and the times history survive.
function applyResetWeights() {
    resetWeights();
    saveWeights();
    displayStats();
}

/// The Goal is app-persisted, so a reload brings it back the way the Selection does. The
/// store is the truth and the goal input is repainted to match it, so what the reader sees
/// is the Goal in effect. Weights stay uniform here: loadSelection() already rebuilt them
/// (ADR-0001).
function loadGoal() {
    var stored = loadGoalValue();
    document.querySelector('#goal_in').value = stored;
    window.goal = stored;
    displayStats(); // reprint the times list, now that weights may be live again
}

// restoration timing is up to the browser, so reconcile at load, the latest point that is
// guaranteed to be after it (and after loadSelection() rebuilt the weights)
window.addEventListener("load", loadGoal);

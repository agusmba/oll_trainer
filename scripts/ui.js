// Interface module: the theme, the settings sheet, and the keyboard affordances that
// plain anchors and inputs need to behave like controls.

/// The two preset palettes. The colour inputs stay the source of truth that applystyle()
/// reads; switching theme rewrites those inputs to the palette it picked.
var palettes = {
    light: { bg: "#f4f6f8", text: "#16191f", links: "#0f6f4f" },
    dark:  { bg: "#14171c", text: "#e6e9ef", links: "#ffd54d" }
};

/// \returns true when the platform asks for a dark interface
function prefersDarkTheme() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

/// \param preference "light", "dark" or "auto"
/// \returns "light" or "dark", resolving "auto" against the platform
function resolveTheme(preference) {
    if (preference == null || preference == "auto")
        return prefersDarkTheme() ? "dark" : "light";
    return preference == "dark" ? "dark" : "light";
}

/// \returns the stored theme preference, "auto" for whoever has never chosen
function themePreference() {
    return loadLocal("ollTheme", "auto");
}

/// \returns the colour the input shows, or fallback when it holds none
function readColor(id, fallback) {
    var el = document.getElementById(id);
    var value = el ? el.value : "";
    return value && value.length > 0 ? value : fallback;
}

/// Repaints the app from the colour inputs: three custom properties on the root, which
/// every surface in the stylesheets reads. This replaces walking the DOM and styling
/// each element, which could never reach markup rendered later.
function applystyle() {
    var root = document.documentElement;
    var bg = readColor("bgcolor_in", palettes.light.bg);
    root.style.setProperty("--bg", bg);
    root.style.setProperty("--fg", readColor("textcolor_in", palettes.light.text));
    root.style.setProperty("--link", readColor("linkscolor_in", palettes.light.links));

    // mobile browsers tint the browser chrome with it, so the status bar matches the app
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta)
        meta.setAttribute("content", bg);

    savestyle();
}

/// Writes a palette into the colour inputs and repaints.
/// \param theme "light" or "dark"
function usePalette(theme) {
    var p = palettes[theme] || palettes.light;
    document.getElementById("bgcolor_in").value = p.bg;
    document.getElementById("textcolor_in").value = p.text;
    document.getElementById("linkscolor_in").value = p.links;
    applystyle();
}

///saves the colours to localstorage
function savestyle() {
    saveLocal("bgcolor_in", document.getElementById("bgcolor_in").value);
    saveLocal("textcolor_in", document.getElementById("textcolor_in").value);
    saveLocal("linkscolor_in", document.getElementById("linkscolor_in").value);
}

/// Restores stored colours, or falls back to the palette of the resolved theme when the
/// user never picked colours.
function loadstyle() {
    var bg = loadLocal("bgcolor_in", "");
    if (bg) {
        document.getElementById("bgcolor_in").value = bg;
        document.getElementById("textcolor_in").value = loadLocal("textcolor_in", palettes.light.text);
        document.getElementById("linkscolor_in").value = loadLocal("linkscolor_in", palettes.light.links);
        applystyle();
        return true;
    }
    usePalette(resolveTheme(themePreference()));
    return false;
}

/// Puts the resolved theme on <html>, where the surface tokens read it, without
/// overwriting colours the user chose. \returns "light" or "dark" now showing
function applyTheme() {
    var theme = resolveTheme(themePreference());
    document.documentElement.setAttribute("data-theme", theme);
    syncThemeButton();
    return theme;
}

/// A chosen theme is an explicit request: the preference is stored and its palette
/// replaces any custom colours. \param preference "light", "dark" or "auto"
function adoptTheme(preference) {
    saveLocal("ollTheme", preference);
    var theme = applyTheme();
    usePalette(theme);
}

/// The sheet's Light / Dark / Auto buttons.
function setThemePreference(preference) {
    adoptTheme(preference);
}

/// The practice screen's one-tap switch: the preference becomes explicit either way.
function toggleTheme() {
    adoptTheme(document.documentElement.getAttribute("data-theme") == "dark" ? "light" : "dark");
}

function syncThemeButton() {
    var btn = document.getElementById("themeToggle");
    if (!btn)
        return;
    var theme = document.documentElement.getAttribute("data-theme") || "light";
    btn.textContent = theme == "dark" ? "Dark" : "Light";
    btn.title = "Theme: " + theme + " - tap for " + (theme == "dark" ? "light" : "dark");
}

/* Settings sheet */

function openSettings() {
    var sheet = document.getElementById("settingsSheet");
    sheet.hidden = false;
    document.getElementById("settingsToggle").setAttribute("aria-expanded", "true");
    var done = document.getElementById("settingsDone");
    if (done)
        done.focus();
}

function closeSettings() {
    var sheet = document.getElementById("settingsSheet");
    if (sheet.hidden)
        return;
    sheet.hidden = true;
    document.getElementById("settingsToggle").setAttribute("aria-expanded", "false");
    document.getElementById("settingsToggle").focus();
}

/* Keyboard affordances */

/// \returns true when a dialog covers the screen: the settings sheet or the case card
function overlayOpen() {
    var sheet = document.getElementById("settingsSheet");
    if (sheet && !sheet.hidden)
        return true;
    var hint = document.getElementById("hintWindow");
    return !!(hint && hint.style.display != "" && hint.style.display != "none");
}

/// Tab belongs to the open dialog: a modal that lets focus walk out strands the next
/// key on the markup behind it. \param panel the dialog's own element
function trapFocus(panel, event) {
    if (event.keyCode != 9)
        return;
    var focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length == 0)
        return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && event.target == first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && event.target == last) {
        event.preventDefault();
        first.focus();
    }
}

document.getElementById("settingsSheet").addEventListener("keydown", function(event) {
    trapFocus(document.querySelector("#settingsSheet .sheet-panel"), event);
});
document.getElementById("hintWindow").addEventListener("keydown", function(event) {
    trapFocus(document.getElementById("box"), event);
});

// Esc dismisses whatever is on top: the case peek, then the settings sheet
document.getElementById("bodyid").addEventListener("keydown", function(event) {
    if (event.keyCode != 27)
        return;
    hideBox();
    closeSettings();
});

// Anchors standing in for buttons sit inside running text; Enter activates them the way
// it activates a real button. Space is deliberately left to the timer, which reads every
// key as "stop the solve".
document.getElementById("bodyid").addEventListener("keydown", function(event) {
    var target = event.target;
    if (!target || !target.getAttribute || target.getAttribute("role") != "button")
        return;
    if (event.keyCode == 13) {
        event.preventDefault();
        target.click();
    }
});

// Enter, Space or Esc finishes a settings field: it hands focus back so the next key
// belongs to the timer again instead of the field.
Array.prototype.forEach.call(document.getElementsByClassName("settinginput"), function(el) {
    el.addEventListener("keydown", function(event) {
        if (event.keyCode == 13 || event.keyCode == 32 || event.keyCode == 27) {
            event.preventDefault();
            el.blur();
        }
    });
});

// The platform can flip its own scheme while the page is open; "Auto" follows it, a
// stored palette does not.
if (window.matchMedia) {
    var darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
    var onSchemeChange = function () {
        if (themePreference() == "auto") {
            applyTheme();
            loadstyle();
        }
    };
    if (darkScheme.addEventListener)
        darkScheme.addEventListener("change", onSchemeChange);
    else if (darkScheme.addListener)
        darkScheme.addListener(onSchemeChange);
}

applyTheme();
loadstyle();

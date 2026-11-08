// load selected cases
loadSelection();
renderSelection();

function updateTitle() {
    document.getElementById("csi").innerHTML = window.selCases.length;
}
function itemClicked(i) {
    if (window.ollMap[i] == null) {
        console.error("is null");
        return;
    }

    var index = window.selCases.indexOf(i);
    var wasSelected = (index != -1);
    if (wasSelected)
        window.selCases.splice(index, 1);
    else
        window.selCases.push(i);

    var td = document.getElementById("itemTd" + i);
    td.className = wasSelected ? "itemUnsel" : "itemSel";
    td.setAttribute("aria-pressed", wasSelected ? "false" : "true");
    saveSelection();
    updateTitle();
}

function selectAllNone() {
    var nothingSelected = (window.selCases.length == 0);
    if (nothingSelected) {
        for (var i = 1; i <= 57; ++i)
            window.selCases.push(i);
    } else {
        window.selCases = [];
    }
    renderSelection();
    saveSelection();
}

/// \returns true if at least one case selected in group groupName
function isAtLeastOneSelected(groupName) {
    var indeces = algsGroups[groupName];
    for (var i in indeces) {
        if (selCases.indexOf(indeces[i]) != -1)
            return true;
    }
    return false;
}

/// \returns how many cases of group groupName are in the Selection
function selectedInGroup(groupName) {
    var indeces = algsGroups[groupName];
    var count = 0;
    for (var i in indeces) {
        if (selCases.indexOf(indeces[i]) != -1)
            count++;
    }
    return count;
}

// select or deselect all cases in the group
function selectOllGroup(name) {
    var aos = isAtLeastOneSelected(name);
    var indeces = algsGroups[name];
    for (i in indeces) {
        if (aos) { // need to delete
            var j = window.selCases.indexOf(indeces[i]);
            if (j != -1)
                window.selCases.splice(j, 1);
        } else { // need to add
            window.selCases.push(indeces[i]);
        }
    }
    renderSelection();
    saveSelection();
}

/// \returns html for one Case cell: the picture, the case number, and the Selection state
function makeCaseTd(i) {
    var sel = (window.selCases.indexOf(i) != -1);
    // role=button plus aria-pressed: the cell is a toggle, and Enter activates it the way
    // a real button does. Space stays the timer's key.
    return "<td id='itemTd" + i + "' onclick='itemClicked(" + i + ")' class='" + (sel ? "itemSel" : "itemUnsel")
        + "' role='button' tabindex='0' aria-pressed='" + (sel ? "true" : "false") + "'" +
        " title='" + algsInfo[i]["name"] + "' aria-label='" + i + " " + algsInfo[i]["name"] + "'>" +
        "<img id='sel" + i + "' src='pic/" + i + ".svg' alt='Case " + i + " " + algsInfo[i]["name"] + "'>" +
        "<span class='case-num'>" + i + "</span></td>";
}

/// \returns html for one group: a header that toggles the whole group, then its cases
function makeGroupCard(groupname) {
    var indeces = algsGroups[groupname];
    var selected = selectedInGroup(groupname);
    var s = "<table class='ollgroup'>";
    s += "<tr class='group-head'><td class='" + (selected > 0 ? "ollgrouptdSel" : "ollgrouptdUnsel")
        + "' onclick='selectOllGroup(\"" + groupname + "\")' role='button' tabindex='0'" +
        " aria-pressed='" + (selected > 0 ? "true" : "false") + "' colspan='" + indeces.length + "'><b>" + groupname
        + "</b><span class='group-count'>" + selected + "/" + indeces.length + "</span></td></tr>";
    s += "<tr class='group-items'>";
    for (var j = 0; j < indeces.length; j++)
        s += makeCaseTd(indeces[j]);
    s += "</tr></table>";
    return s;
}

/// \returns html for the header that selects every case or none of them
function makeAllNoneCard() {
    var all = window.selCases.length == 57;
    return "<table class='ollgroup'>" +
        "<tr class='group-head'><td class='" + (all ? "ollgrouptdSel" : "ollgrouptdUnsel") + "'" +
        " onclick='selectAllNone()' role='button' tabindex='0' aria-pressed='" + (all ? "true" : "false") + "' colspan='6'>" +
        "<b>All Cases (57)</b><span class='group-count'>selected: <span id='csi'></span></span></td></tr></table>";
}

/// iterates the ollMap and highlights HTML elements according to the selection
function renderSelection()
{
    var s = makeAllNoneCard();

    for (var group in algsGroups)
        s += makeGroupCard(group);

    document.getElementById("cases_selection").innerHTML = s;
    updateTitle();
}

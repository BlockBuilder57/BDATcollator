function openAll(open) {
	document.querySelectorAll("details").forEach(function(details) {
		details.open = open;
	});
}

function offsetAnchor() {
	if(location.hash.length !== 0) {
		window.scrollTo(0, window.scrollY - document.getElementById('header').clientHeight + 1);
	}
}
window.addEventListener("hashchange", offsetAnchor);

function bounceCheckboxEvent(e) {
	if (e == null) {
		// ideally this should return null, but that idea
		// fails when there is no local storage data 
		return false;
	}
	if (typeof(e) === "string" && e == "true" || e == "false") {
		e = e == "true";
	}
	if (!(typeof(e) === "boolean" || e instanceof Event)) {
		console.error("Bouncing event was not a bool or event:", e, "typeof", typeof(e));
		console.trace();
		return null;
	}
	if (e instanceof Event) {
		e = e.target.checked;
	}

	localStorage.setItem("bdat_" + arguments.callee.caller.name, e);
	return e;
}

function showColumnTypes(e) {
	e = bounceCheckboxEvent(e);
	if (e == null)
		return;

	let styleElem = document.getElementById("cssColumnTypes");
	if (styleElem == null) {
		console.error("Style element was not found");
		return;
	}

	if (e) {
		styleElem.innerHTML = "";
	}
	else {
		styleElem.innerHTML = ".columnType { display: none; }";
	}

	let checkbox = document.querySelector("#cbColumnTypes");
	if (checkbox != null) {
		checkbox.checked = e;
	}
}

function showRawValues(e) {
	e = bounceCheckboxEvent(e);
	if (e == null)
		return;

	let styleElem = document.getElementById("cssRawValues");
	if (styleElem == null) {
		console.error("Style element was not found");
		return;
	}

	if (e) {
		styleElem.innerHTML = "";
	}
	else {
		styleElem.innerHTML = ".cellRawValue { display: none; }";
	}

	let checkbox = document.querySelector("#cbRawValues");
	if (checkbox != null) {
		checkbox.checked = e;
	}
}

document.addEventListener("DOMContentLoaded", () => {
	showColumnTypes(localStorage.bdat_showColumnTypes);
	showRawValues(localStorage.bdat_showRawValues);

	setTimeout(offsetAnchor, 50);

	document.querySelector("#cbColumnTypes").addEventListener("change", showColumnTypes);
	document.querySelector("#cbRawValues").addEventListener("change", showRawValues);
});
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
		return null;
	}
	if (e instanceof String && e == "true" || e == "false") {
		e = e == "true";
	}
	console.debug()
	if (!(typeof(e) === "boolean" || e instanceof Event)) {
		console.error("Bouncing event was not a bool or event", e);
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
}

document.addEventListener("DOMContentLoaded", () => {
	showColumnTypes(localStorage.bdat_showColumnTypes);
	showRawValues(localStorage.bdat_showRawValues);

	setTimeout(offsetAnchor, 50);

	document.querySelector("#cbColumnTypes").addEventListener("change", showColumnTypes);
	document.querySelector("#cbRawValues").addEventListener("change", showRawValues);
});
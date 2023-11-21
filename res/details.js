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

function showColumnTypes(e) {
	for (let elem of document.querySelectorAll(".columnType")) {
		if (e.target.checked)
			elem.classList.remove("hidden");
		else
			elem.classList.add("hidden");
	}
}

function showHashValues(e) {
	for (let elem of document.querySelectorAll(".hashValue")) {
		if (e.target.checked)
			elem.classList.remove("hidden");
		else
			elem.classList.add("hidden");
	}
}

document.addEventListener("DOMContentLoaded", () => {
	offsetAnchor();

	document.querySelector("#cbColumnTypes").addEventListener("change", showColumnTypes);
	document.querySelector("#cbHashValues").addEventListener("change", showHashValues);
});
function openAll(open) {
	document.querySelectorAll("details").forEach(function(details) {
		details.open = open;
	});
}

function showHashValues(e) {
	for (let elem of document.querySelectorAll(".hashValue")) {
		if (e.target.checked)
			elem.classList.remove("hidden");
		else
			elem.classList.add("hidden");
	}
}

function offsetAnchor() {
	if(location.hash.length !== 0) {
		window.scrollTo(window.scrollX, window.scrollY - document.getElementById('header').clientHeight);
	}
}
window.addEventListener("hashchange", offsetAnchor);



document.addEventListener("DOMContentLoaded", () => {
	offsetAnchor();

	document.querySelector("#cbHashValues").addEventListener("change", showHashValues);
});
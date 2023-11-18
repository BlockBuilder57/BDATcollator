function openAll(open) {
	document.querySelectorAll("details").forEach(function(details) {
		details.open = open;
	});
}

function offsetAnchor() {
	if(location.hash.length !== 0) {
		window.scrollTo(window.scrollX, window.scrollY - document.getElementById('header').clientHeight);
	}
}
window.addEventListener("hashchange", offsetAnchor);
window.setTimeout(offsetAnchor, 1);
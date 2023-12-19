const fsp = require("node:fs/promises");
const fs = require("node:fs");
const path = require("node:path");
const murmurHash3 = require("imurmurhash");

module.exports = function() {
	this.IsNullOrWhitespace = function (input) {
		return !(typeof input === 'string') || !input || !input.trim();
	}
	
	this.IsObject = function (obj) {
		return typeof obj === 'object' && !Array.isArray(obj) && obj !== null
	}
	
	// https://stackoverflow.com/a/14130005
	this.htmlEntities = function (str) {
		//return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
		return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
	
	// https://stackoverflow.com/a/71166133
	this.walk = async (dirPath) => Promise.all(
	  await fsp.readdir(dirPath, { withFileTypes: true }).then((entries) => entries.map((entry) => {
		const childPath = path.join(dirPath, entry.name)
		return entry.isDirectory() ? walk(childPath) : childPath
	  })),
	)
	
	// helper function for hashes, not used here
	this.PrintMurmurList = function (list) {
		var csv = "";
		for (const elem of list) {
			csv += `${murmurHash3(elem).result().toString(16).toUpperCase().padStart(8, "0")},${elem}\n`;
		}
	
		console.log(csv);
	}
	
	this.FetchJSON = async function (file) {
		try {
			let data = await fsp.readFile(file);
			//console.log(`got text: ${data.toString('utf8')}`);
			return JSON.parse(data.toString("utf8"));
		}
		catch (e) {
			return null;
		}
	}
}
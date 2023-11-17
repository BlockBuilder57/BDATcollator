const fs = require("node:fs/promises");
const path = require("node:path");

function IsNullOrWhitespace( input ) {
	return !input || !input.trim();
}

// https://stackoverflow.com/a/71166133
const walk = async (dirPath) => Promise.all(
  await fs.readdir(dirPath, { withFileTypes: true }).then((entries) => entries.map((entry) => {
    const childPath = path.join(dirPath, entry.name)
    return entry.isDirectory() ? walk(childPath) : childPath
  })),
)



class BDATcollator {

	static async FetchJSON(file) {
		try {
			let data = await fs.readFile(file);
			//console.log(`got text: ${data.toString('utf8')}`);
			return JSON.parse(data.toString("utf8"));
		}
		catch (e) {
			return null;
		}
	}

}

(async () => {
	const allFiles = await walk("data/small");
	const allFilesFlat = allFiles.flat(Number.POSITIVE_INFINITY);

	const schemaFiles = allFilesFlat.filter((e) => { return e.endsWith("bschema"); });
	var schemas = new Map();

	for (const schema of schemaFiles) {
		//console.log(schema);
		const json = await BDATcollator.FetchJSON(schema);

		if (json != null)
			schemas.set(schema, json);
	}

	console.log(schemas);

})()

const fsp = require("node:fs/promises");
const fs = require("node:fs");
const path = require("node:path");

function IsNullOrWhitespace( input ) {
	return !input || !input.trim();
}

// https://stackoverflow.com/a/14130005
function htmlEntities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// https://stackoverflow.com/a/71166133
const walk = async (dirPath) => Promise.all(
  await fsp.readdir(dirPath, { withFileTypes: true }).then((entries) => entries.map((entry) => {
    const childPath = path.join(dirPath, entry.name)
    return entry.isDirectory() ? walk(childPath) : childPath
  })),
)



class BDATcollator {

	static RootPath = "data/small";
	static OutPath = "out/";
	static BDATSchemas = new Map();

	static async FetchJSON(file) {
		try {
			let data = await fsp.readFile(file);
			//console.log(`got text: ${data.toString('utf8')}`);
			return JSON.parse(data.toString("utf8"));
		}
		catch (e) {
			return null;
		}
	}

	static async GetSchema(path) {
		//console.log("getting schema at", path);
		const json = await BDATcollator.FetchJSON(path);

		if (json == null)
			return null;

		// we have the file, let's clean it up
		let pathMinimized = path.substring(BDATcollator.RootPath.length, path.length).replace("bschema", "bdat");

		// json conditioning
		json.bdat_path = pathMinimized;
		json.tables = json.tables.map((entry) => {
			if (entry.startsWith("<")) // clean hash names
				entry = entry.substring(1, entry.length - 1);
			return entry;
		});

		return json;
	}

	static async GetSchemas() {
		const allFiles = await walk(BDATcollator.RootPath);
		const allFilesFlat = allFiles.flat(Number.POSITIVE_INFINITY);

		const schemaFiles = allFilesFlat.filter((e) => { return e.endsWith("bschema"); });

		this.BDATSchemas.clear();

		for (const schemaFile of schemaFiles) {
			const schema = await this.GetSchema(schemaFile);
			
			if (schema != null) {
				this.BDATSchemas.set(schema.bdat_path, schema);
			}
		}
	
		return this.BDATSchemas;
	}

	static async CreateRootIndex() {
		var indexpage = (await fsp.readFile("templates/index.html")).toString("utf8");
		var list = "<ul>";
	
		for (const schema of this.BDATSchemas.values()) {
			let tableList = `<li><h3 class="bdatTableName">${schema.bdat_path}</h3><ul>`;
	
			for (const table of schema.tables) {
				let classes = ["bdatSheetName"];
				if (table.match(/[0-9A-F]{8}/))
					classes.push("bdatHash");
	
				tableList += `<li><a href="${schema.bdat_path.substring(1) + "/" + table + ".html"}" class="${classes.join(" ")}">${htmlEntities(table)}</a></li>`;
			}
	
			tableList += "</ul></li>";
			list += tableList;
		}
	
		list += "</ul>";
	
		if (!fs.existsSync(BDATcollator.OutPath)){
			fs.mkdirSync(BDATcollator.OutPath, { recursive: true });
		}
	
		var indexStream = fs.createWriteStream(BDATcollator.OutPath + "index.html");
		indexStream.write(indexpage.replace("{{table_list}}", list));
		indexStream.end();
	}

}

(async () => {
	await BDATcollator.GetSchemas();
	await BDATcollator.CreateRootIndex();
})()

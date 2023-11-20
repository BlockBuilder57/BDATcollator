const fsp = require("node:fs/promises");
const fs = require("node:fs");
const path = require("node:path");
const murmurHash3 = require("imurmurhash");

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

// helper function for hashes, not used here
function PrintMurmurList(list) {
	var csv = "";
	for (const elem of list) {
		csv += `${murmurHash3(elem).result().toString(16).toUpperCase().padStart(8, "0")},${elem}\n`;
	}

	console.log(csv);
}
 
class BDATcollator {

	static RootPath = "data/bdat";
	static OutPath = "out/";

	static BDATTableSchemas = new Map();
	static BDATSheets = new Map();

	static BDATTypes = [
		"None",
		"UInt8",
		"UInt16",
		"UInt32",
		"Int8",
		"Int16",
		"Int32",
		"String",
		"Float",
		// modern only
		"HashRef",
		"Percentage",
		"DebugString",
		"Unk0xC",
		"TranslationIndex"
	];

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

	static async GetTemplates() {
		this.TemplateIndex = (await fsp.readFile("templates/index.html")).toString("utf8");
		this.TemplateSheet = (await fsp.readFile("templates/sheet.html")).toString("utf8");

		this.HashLookup = new Map();
		if (fs.existsSync("templates/xb3_hash_values.txt")) {
			let csv = (await fsp.readFile("templates/xb3_hash_values.txt")).toString("utf8");
			csv = csv.replace(/\r/g, "");

			let nights = csv.split("\n");
			for (const night of nights) { // i'm sorry (i'm not)
				this.HashLookup.set(murmurHash3(night).result().toString(16).toUpperCase().padStart(8, "0"), night);
			}
		}
	}

	static async GetTableSchema(filePath) {
		//console.log("getting schema at", filePath);
		const json = await this.FetchJSON(filePath);

		if (json == null) {
			console.error("Failed to open table schema:", filePath);
			return null;
		}

		// we have the file, let's clean it up
		let pathMinimized = filePath.substring(this.RootPath.length, path.length).replace("bschema", "bdat");

		if (json.sheets == null) {
			json.sheets = json.tables;
			delete json.tables;
		}

		// json conditioning
		json.bdat_path = pathMinimized;
		json.folder_path = pathMinimized.split(".")[0] + "/";
		json.sheets = json.sheets.map((entry) => {
			if (entry.startsWith("<")) // clean hash names
				entry = entry.substring(1, entry.length - 1);
			return entry;
		});

		return json;
	}

	static async GetTableSchemas() {
		const allFiles = await walk(BDATcollator.RootPath);
		const allFilesFlat = allFiles.flat(Number.POSITIVE_INFINITY);

		const schemaFiles = allFilesFlat.filter((e) => { return e.endsWith("bschema"); });

		this.BDATTableSchemas.clear();

		for (const schemaFile of schemaFiles) {
			const schema = await this.GetTableSchema(schemaFile);
			if (schema != null) {
				this.BDATTableSchemas.set(schema.bdat_path, schema);
			}
		}
	}

	static async CreateRootIndex() {
		var list = "<ul>";
	
		for (const schema of this.BDATTableSchemas.values()) {
			let tableList = `<li><h3 class="bdatTableName">${schema.bdat_path}</h3><ul>`;
	
			for (const sheet of schema.sheets) {
				let classes = ["bdatSheetName"];
				if (sheet.match(/[0-9A-F]{8}/))
					classes.push("bdatHash");
	
				tableList += `<li><a href="${schema.bdat_path.substring(1) + "/" + sheet + ".html"}" class="${classes.join(" ")}">${htmlEntities(sheet)}</a></li>`;
			}
	
			tableList += "</ul></li>";
			list += tableList;
		}
	
		list += "</ul>";
	
		if (!fs.existsSync(this.OutPath)){
			fs.mkdirSync(this.OutPath, { recursive: true });
		}
	
		var indexStream = fs.createWriteStream(this.OutPath + "index.html");
		indexStream.write(this.TemplateIndex.replace("{{table_list}}", list));
		indexStream.end();
	}

	static async GetSheet(filePath, sheetName, schema) {
		//console.log("getting sheet", sheetName, "at", filePath);
		const json = await this.FetchJSON(filePath);

		if (json == null)
			return null;

		// json conditioning
		json.name = sheetName;
		if (schema != null) {
			json.parent_table = schema.bdat_path;
		}

		return json;
	}

	static async GetSheetsFromTableSchema(schema) {
		//schema.sheets = ["CHR_PC"]
		for (const sheet of schema.sheets) {
			let sheetJson = await this.GetSheet(this.RootPath + schema.folder_path + sheet + ".json", sheet, schema);

			if (sheetJson != null)
				this.BDATSheets.set(schema.bdat_path + "#" + sheet, sheetJson);
		}
	}

	static async GetSheetsFromTableSchemas() {
		for (const schema of this.BDATTableSchemas.values()) {
			await this.GetSheetsFromTableSchema(schema);
		}
	}

	// CLEANUP STAGE 0: HASHES
	// bdat-rs takes care of hashes in the column names, but not in values!
	// we want to be able to retain both, so let's do a bit of cleanup here
	static CleanupSheetsStage0() {
		let sheetKeys = this.BDATSheets.keys();
		for (const key of sheetKeys) {
			let sheet = this.BDATSheets.get(key);

			let columnType = new Map();
			for (const column of sheet.schema) {
				columnType.set(column.name, column.type);
			}

			for (var i = 0; i < sheet.rows.length; i++) {
				var thisRow = sheet.rows[i];

				for (let [key, value] of Object.entries(thisRow)) {
					if (columnType.get(key) == 9) {
						let hexOnly = value.substring(1, value.length - 1);
						var lookupObject = {"hash": parseInt(hexOnly, 16)};

						if (lookupObject.hash == 0) {
							lookupObject.hashStatus = "null";
							lookupObject.value = "";
						}
						else if (!this.HashLookup.has(hexOnly)) {
							lookupObject.hashStatus = "missing";
							lookupObject.value = value;
						}
						else {
							lookupObject.hashStatus = "found";
							lookupObject.value = this.HashLookup.get(hexOnly);
						}

						sheet.rows[i][key] = lookupObject;
					}
				}
			}

			this.BDATSheets.set(key, sheet);
		}
	}

	static async CreateSheetTable(sheet) {
		console.log("creating page for", sheet.parent_table + "#" + sheet.name);

		let columnType = new Map();
		for (const column of sheet.schema) {
			columnType.set(column.name, column.type);
		}

		let table = "<table class='sortable'>";

		table += "<thead><tr id='header'>";
		table += "<th>idx</th>";
		for (const column of sheet.schema) {
			table += `<th>${htmlEntities(column.name)}<span class="columnType"><br>${this.BDATTypes[column.type]}</span></th>`;
		}
		table += "</tr></thead>";

		table += "<tbody>";
		for (const row of sheet.rows) {
			table += `<tr id=${row["$id"]}>`;
			for (let [key, display] of Object.entries(row)) {
				
				var classes = [];

				if (columnType.get(key) == 9) {
					classes.push("hashCell");

					if (typeof display === 'object' && !Array.isArray(display) && display !== null) {
						let hashMissing = display.hashStatus == "missing";
						let hashNull = display.hashStatus == "null";

						if (hashMissing)
							classes.push("hashMissing");
						else if (hashNull)
							classes.push("hashNull");

						let dispValue = htmlEntities(display.value);
						
						if (!hashMissing)
							dispValue += `<span class="hashValue hidden">${IsNullOrWhitespace(dispValue) ? "" : "<br>"}&lt;${display.hash.toString(16).toUpperCase().padStart(8, "0")}&gt;</span>`;

						display = dispValue;
					}
				}
				else {
					display = htmlEntities(display);
				}

				var classesText = "";
				if (classes.length != 0)
					classesText = ` class="${classes.join(" ")}"`;

				table += `<td${classesText}>${display}</td>`;
			}
			table += "</tr>";
		}
		table += "</tbody>";
	
		table += "</table>";

		const outPath = this.OutPath + sheet.parent_table + "/";
	
		if (!fs.existsSync(outPath)){
			fs.mkdirSync(outPath, { recursive: true });
		}

		var htmlout = this.TemplateSheet;
		htmlout = htmlout.replace("{{table_name}}", sheet.parent_table).replace("{{sheet_name}}", sheet.name).replace("{{sheet_table}}", table);
	
		var indexStream = fs.createWriteStream(outPath + sheet.name + ".html");
		indexStream.write(htmlout);
		indexStream.end();
	}
}

(async () => {
	// get templates and hash file
	await BDATcollator.GetTemplates();

	// get .bschema files
	//await BDATcollator.GetTableSchemas();
	{
		var sysSchema = await BDATcollator.GetTableSchema(BDATcollator.RootPath + "/sys.bschema");
		BDATcollator.BDATTableSchemas.set(sysSchema.bdat_path, sysSchema);
		var sysSchema = await BDATcollator.GetTableSchema(BDATcollator.RootPath + "/gb/game/system.bschema");
		BDATcollator.BDATTableSchemas.set(sysSchema.bdat_path, sysSchema);
	}

	// create index page
	//await BDATcollator.CreateRootIndex();

	// get tables and their sheets
	await BDATcollator.GetSheetsFromTableSchemas();

	// cleanup and processing
	BDATcollator.CleanupSheetsStage0();

	// create sheet pages
	/*for (const sheet of BDATcollator.BDATSheets.values()) {
		BDATcollator.CreateSheetTable(sheet);
	}*/
	BDATcollator.CreateSheetTable(BDATcollator.BDATSheets.get("/sys.bdat#CHR_PC"));
	BDATcollator.CreateSheetTable(BDATcollator.BDATSheets.get("/gb/game/system.bdat#msg_player_name"));
})()

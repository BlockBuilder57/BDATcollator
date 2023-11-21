const fsp = require("node:fs/promises");
const fs = require("node:fs");
const path = require("node:path");
const murmurHash3 = require("imurmurhash");
const { match } = require("node:assert");

function IsNullOrWhitespace( input ) {
	return !input || !input.trim();
}

function IsObject(obj) {
	return typeof obj === 'object' && !Array.isArray(obj) && obj !== null
}

// https://stackoverflow.com/a/14130005
function htmlEntities(str) {
    //return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

	static RootPath = "tables/xc2_210_base_hashed_edits";
	static OutPath = "out/";
	static LocalizationPath = "/gb";

	static IgnoreLocalizations = ["/cn", "/fr", "/gb", "/ge", "/it", "/jp", "/kr", "/sp", "/tw"];

	static SheetLinksPath = "data/xc2_sheet_links.json";

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
	}

	static async GetData() {
		try {
			// lazy method of swappable localization paths
			let data = await fsp.readFile(this.SheetLinksPath);
			data = data.toString("utf8").replace("{{LOCALIZATION_PATH}}", this.LocalizationPath);
			this.SheetLinks = JSON.parse(data);
		}
		catch (e) { console.error(e); }

		// remove our localization path from the ignore list, we kinda need that
		this.IgnoreLocalizations = this.IgnoreLocalizations.filter(x => x !== this.LocalizationPath);

		this.HashLookup = new Map();
		if (fs.existsSync("data/xb3_hash_values.txt")) {
			let csv = (await fsp.readFile("data/xb3_hash_values.txt")).toString("utf8");
			csv = csv.replace(/\r/g, "");

			let nights = csv.split("\n");
			for (const night of nights) { // i'm sorry (i'm not)
				this.HashLookup.set(murmurHash3(night).result().toString(16).toUpperCase().padStart(8, "0"), night);
			}
		}
	}

	static async GetTableSchema(filePath) {
		console.debug("getting schema at", filePath);
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
			if (this.IgnoreLocalizations.findIndex((x) => schemaFile.startsWith(this.RootPath + x)) != -1) {
				//console.debug("not getting schema for", schemaFile);
				continue;
			}

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
		//console.debug("getting sheet", sheetName, "at", filePath);
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
						var lookupObject = {
							"hash": parseInt(hexOnly, 16),
							"raw_value": value
						};

						if (lookupObject.hash == 0) {
							lookupObject.hash_status = "null";
							lookupObject.raw_value = ""; // just so no blanks appear
						}
						else if (!this.HashLookup.has(hexOnly)) {
							lookupObject.hash_status = "missing";
						}
						else {
							lookupObject.hash_status = "found";
							lookupObject.hash_value = this.HashLookup.get(hexOnly);
						}

						sheet.rows[i][key] = lookupObject;
					}
				}
			}

			this.BDATSheets.set(key, sheet);
		}
	}

	// CLEANUP STAGE 1: REFERENCES
	// references are not a concept native to bdat tables, everything is matched "by hand"
	// so, we need to define all links to other tables through a lookup table
	// occaisionally, we need criteria to further match.
	static CleanupSheetsStage1() {
		for (const matchup of this.SheetLinks) {
			if (!this.BDATSheets.has(matchup.src) || !this.BDATSheets.has(matchup.target)) {
				continue;
			}

			var srcSheet = this.BDATSheets.get(matchup.src);
			var targetSheet = this.BDATSheets.get(matchup.target);

			// for tables that start at something like 1001
			var targetFirstIndex = targetSheet.rows[0]["$id"];

			for (var i = 0; i < srcSheet.rows.length; i++) {
				var srcValue = srcSheet.rows[i][matchup.src_column];
				var srcBasicValue = srcValue;

				// first, if we're matching against 0, then that's probably an empty reference
				if (srcValue == 0)
					continue;

				// next, let's check the criteria
				var failedCriteria = false;

				function CheckCriteriaType(type, func) {
					if (failedCriteria || matchup.criteria == null)
						return;

					for (const crit of matchup.criteria.filter((e) => e.type == type)) {
						if (!func(crit)) {
							failedCriteria = true;
							//console.debug(`Match for ${matchup.src}[${i}] to ${matchup.target} failed ${type} criteria`);
						}
					}
				}

				CheckCriteriaType("src_column_above", (crit) => { return srcSheet.rows[i][crit.column] > crit.value; });
				CheckCriteriaType("src_column_below", (crit) => { return srcSheet.rows[i][crit.column] < crit.value; });
				CheckCriteriaType("src_column_equals", (crit) => { return srcSheet.rows[i][crit.column] == crit.value; });

				// if we fail, onto the next
				if (failedCriteria)
					continue;

				// if this is already a value somehow, we want the actual value
				if (IsObject(srcValue)) {
					if (!IsNullOrWhitespace(srcValue.raw_value))
						srcBasicValue = srcValue.raw_value;
					else
						continue;
				}

				var targetIndex = targetSheet.rows.findIndex((e) => {
					// look for exact matches or obj.value matches
					if (e[matchup.target_column] == srcBasicValue)
						return true;
					else if (IsObject(e[matchup.target_column]))
						return e[matchup.target_column].raw_value == srcBasicValue;
				});

				if (targetIndex == -1) {
					console.warn(`Match for ${matchup.src} to ${matchup.target} not found`);
					continue;
				}

				var targetColumn = IsNullOrWhitespace(matchup.target_column_value) ? matchup.target_column : matchup.target_column_value;
				var targetValue = targetSheet.rows[targetIndex][targetColumn];

				if (targetValue == null) {
					console.warn(`Target value for ${matchup.src} to ${matchup.target} not found`);
					continue;
				}

				var matchLink = `/${this.OutPath}${matchup.target.replace("#", "/")}.html#${targetFirstIndex + targetIndex}`.replace("//", "/");

				if (!IsObject(srcValue)) {
					srcValue = { "raw_value": srcValue };
				}

				// match values can be odd
				// they can either be the result of a hash,
				// or they can be a previous match value. let's check

				//srcValue.match_value = targetValue.match_value == null ? targetValue : targetValue.match_value;
				var matchValue = null;
				if (targetValue.match_value == null) {
					if (IsObject(targetValue)) {
						// this may be a Joker's Trick. is this a hash?
						if (targetValue.hash != null)
							// it is! let's take its hash value
							matchValue = targetValue.hash_value;
						else
							console.error("target value is an object, but does not have a match_value or hash.");
					}
					else {
						// just a plain value, I suppose
						matchValue = targetValue;
					}
				}
				else {
					// just take its match value
					matchValue = targetValue.match_value;
				}

				srcValue.match_value = matchValue;
				srcValue.match_link = matchLink;

				srcSheet.rows[i][matchup.src_column] = srcValue;
			}
		}
	}

	static async CreateSheetTable(sheet) {
		if (sheet == null)
			return;

		console.debug("creating page for", sheet.parent_table + "#" + sheet.name);

		let columnType = new Map();
		for (const column of sheet.schema) {
			columnType.set(column.name, column.type);
		}

		let table = "<table class='sortable'>";

		table += "<thead><tr id='header'>";
		table += "<th>idx</th>";
		for (const column of sheet.schema) {
			// can't wrap this because of the sorting arrow :(
			table += `<th>${htmlEntities(column.name)}<span class="columnType hidden"><br>${this.BDATTypes[column.type]} - 0x${column.type.toString(16).toUpperCase()}</span></th>`;
		}
		table += "</tr></thead>";

		table += "<tbody>";
		for (const row of sheet.rows) {
			table += `<tr id=${row["$id"]}>`;
			for (let [key, display] of Object.entries(row)) {
				var classes = [];
				var needsWrapper = false;

				if (IsObject(display)) {
					let dispValue = htmlEntities(display.raw_value);
					let extraElements = "";

					// display linked value if we need it
					if (display.match_value != null && display.match_value != "")
						dispValue = htmlEntities(display.match_value);

					if (columnType.get(key) == 9) {
						classes.push("hashCell");
	
						let hashMissing = display.hash_status == "missing";
						let hashNull = display.hash_status == "null";

						if (hashMissing)
							classes.push("hashMissing");
						else if (hashNull)
							classes.push("hashNull");
						
						if (!hashMissing) {
							if (display.hash_value != null)
								dispValue = htmlEntities(display.hash_value);
							extraElements += `<span class="hashValue hidden">&lt;${display.hash.toString(16).toUpperCase().padStart(8, "0")}&gt;</span>`;
							needsWrapper = true;
						}
					}

					// put in a tag. optionally add a link
					dispValue = `<a${IsNullOrWhitespace(display.match_link) ? "" : ` href="${display.match_link}" title="${display.raw_value}"`}>${dispValue}</a>`;
					// but no empty elements
					dispValue = dispValue.replace("<a></a>", "");
				
					// overwriting it at the end
					display = dispValue + extraElements;
				}
				else {
					display = htmlEntities(display);
				}

				if (needsWrapper)
					display = `<div class="cellWrapper">${display}</div>`;

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
	// get templates and data
	await BDATcollator.GetTemplates();
	await BDATcollator.GetData();

	// get .bschema files
	//await BDATcollator.GetTableSchemas();
	{
		/*var schema = await BDATcollator.GetTableSchema(BDATcollator.RootPath + "/sys.bschema");
		BDATcollator.BDATTableSchemas.set(schema.bdat_path, schema);
		var schema = await BDATcollator.GetTableSchema(BDATcollator.RootPath + "/fld.bschema");
		BDATcollator.BDATTableSchemas.set(schema.bdat_path, schema);
		var schema = await BDATcollator.GetTableSchema(BDATcollator.RootPath + "/prg.bschema");
		BDATcollator.BDATTableSchemas.set(schema.bdat_path, schema);
		var schema = await BDATcollator.GetTableSchema(BDATcollator.RootPath + BDATcollator.LocalizationPath + "/game/system.bschema");
		BDATcollator.BDATTableSchemas.set(schema.bdat_path, schema);*/
		var schema = await BDATcollator.GetTableSchema(BDATcollator.RootPath + "/common.bschema");
		BDATcollator.BDATTableSchemas.set(schema.bdat_path, schema);
		var schema = await BDATcollator.GetTableSchema(BDATcollator.RootPath + BDATcollator.LocalizationPath + "/common_ms.bschema");
		BDATcollator.BDATTableSchemas.set(schema.bdat_path, schema);
	}

	// create index page
	await BDATcollator.CreateRootIndex();

	// get tables and their sheets
	await BDATcollator.GetSheetsFromTableSchemas();

	// cleanup and processing
	BDATcollator.CleanupSheetsStage0();
	BDATcollator.CleanupSheetsStage1();

	// create sheet pages
	for (const sheet of BDATcollator.BDATSheets.values()) {
		BDATcollator.CreateSheetTable(sheet);
	}
	//BDATcollator.CreateSheetTable(BDATcollator.BDATSheets.get("/sys.bdat#CHR_PC"));
	//BDATcollator.CreateSheetTable(BDATcollator.BDATSheets.get("/fld.bdat#FLD_ObjList"));
	//BDATcollator.CreateSheetTable(BDATcollator.BDATSheets.get("/fld.bdat#FLD_NpcResource"));
	//BDATcollator.CreateSheetTable(BDATcollator.BDATSheets.get("/prg.bdat#157937BA"));
	//BDATcollator.CreateSheetTable(BDATcollator.BDATSheets.get(BDATcollator.LocalizationPath + "/game/system.bdat#msg_player_name"));
})()

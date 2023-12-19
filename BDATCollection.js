require("./utils.js")();
const fsp = require("node:fs/promises");

const AllLocalizations = ["/cn", "/fr", "/gb", "/ge", "/it", "/jp", "/kr", "/sp", "/tw"];
const BDATTypes = [
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

class BDATCollection {

	constructor(rootPath, localizationId) {
		this.TableSchemas = new Map();
		this.Sheets = new Map();
		this.RootPath = rootPath;

		// remove our localization path from an ignore list
		this.IgnoreLocalizations = AllLocalizations.filter(x => x !== localizationId);
	}

	// Reads the .bschema at the provided file path and returns an object (with tweaks:)
	// - The BDAT path and folder path are made and added to the object
	// - Hashed sheet names have their <> removed for a 1:1 match for filenames
	async GetTableSchema(filePath) {
		if (!filePath.startsWith(this.RootPath))
			filePath = this.RootPath + filePath;

		console.debug("getting schema at", filePath);
		const json = await FetchJSON(filePath);

		if (json == null) {
			console.error("Failed to open table schema:", filePath);
			return null;
		}

		// we have the file, let's clean it up
		let pathMinimized = filePath.substring(this.RootPath.length).replace("bschema", "bdat");

		if (json.sheets == null) {
			json.sheets = json.tables;
			delete json.tables;
		}

		// json conditioning
		json.bdat_path = pathMinimized;
		json.folder_path = pathMinimized.split(".")[0] + "/";
		json.sheets = json.sheets.map((entry) => {
			if (entry.startsWith("<")) // clean hash names (as they're not present in filenames)
				entry = entry.substring(1, entry.length - 1);
			return entry;
		});

		return json;
	}

	// Automatically gets and adds a specified path to the table schemas
	async AddTableSchema(filePath) {
		const schema = await this.GetTableSchema(filePath);
		if (schema != null) {
			this.TableSchemas.set(schema.bdat_path, schema);
		}
		return schema;
	}

	// Walks the entire root path and gets all schemas
	async GetTableSchemas() {
		const allFiles = await walk(this.RootPath);
		const allFilesFlat = allFiles.flat(Number.POSITIVE_INFINITY);

		const schemaFiles = allFilesFlat.filter((e) => { return e.endsWith("bschema"); });

		this.TableSchemas.clear();

		for (const schemaFile of schemaFiles) {
			if (this.IgnoreLocalizations.findIndex((x) => schemaFile.startsWith(this.RootPath + x)) != -1) {
				//console.debug("not getting schema for", schemaFile);
				continue;
			}

			this.AddTableSchema(schemaFile);
		}
	}

	// Reads a sheet .json with the given sheet name at the schema's folder path, and returns an object
	async GetSheet(schema, sheetName) {
		let filePath = this.RootPath + schema.folder_path + sheetName + ".json";
		//console.debug("getting sheet", sheetName, "at", filePath);
		const json = await FetchJSON(filePath);

		if (json == null)
			return null;

		// json conditioning
		json.name = sheetName;
		if (schema != null) {
			json.parent_table = schema.bdat_path;
		}

		return json;
	}

	// Gets all sheets from a given schema, and adds them to the Sheets map.
	async GetSheetsFromTableSchema(schema) {
		for (const sheet of schema.sheets) {
			let sheetJson = await this.GetSheet(schema, sheet);

			if (sheetJson != null)
				this.Sheets.set(schema.bdat_path + "#" + sheet, sheetJson);
		}
	}

	// Gets all sheets from all table schemas
	async GetSheetsFromTableSchemas() {
		for (const schema of this.TableSchemas.values()) {
			await this.GetSheetsFromTableSchema(schema);
		}
	}

	// Gets a map of column data to row data.
	GetColumnMapFromSheet(sheet) {
		var map = new Map();
		map.set("$id", sheet.rows.map(x => x["$id"]));
		for (const column of sheet.schema) {
			var data = sheet.rows.map(x => x[column.name]);
			map.set(column.name, data);
		}
		return map;
	}

}

module.exports = {
	BDATCollection: BDATCollection,
	AllLocalizations: AllLocalizations,
	BDATTypes: BDATTypes
};
const fsp = require("node:fs/promises");
const fs = require("node:fs");
const path = require("node:path");
const murmurHash3 = require("imurmurhash");
const bdat = require("./BDATCollection.js");
require("./utils.js")();

class BDATcollator {

	// Determines which language to use for sheet localization
	static LocalizationPath = "/gb/";
	// Determines which languages to export tables for
	static LocalizationsToExport = [this.LocalizationPath];
	// Export the localization sheets (Localizations will still be made in the sheets, like XbTool's output)
	static ExportLocalizationSheets = false;

	// Path to a json file with links
	static SheetLinksPath = "data/xb3_sheet_links.json";
	// The output path for all html files (created automatically)
	static OutPath = "out/";
	// The first argument is the folder path of the bdat-rs output
	// Second argument controls which languages to export
	static Collection = new bdat.BDATCollection("tables/xb3_211_alldlc_hashed_edits", this.LocalizationsToExport);

	static async GetTemplates() {
		this.TemplateIndex = (await fsp.readFile("templates/index.html")).toString("utf8");
		this.TemplateSheet = (await fsp.readFile("templates/sheet.html")).toString("utf8");
	}

	static async GetData() {
		try {
			// lazy method of swappable localization paths
			let data = await fsp.readFile(this.SheetLinksPath);
			data = data.toString("utf8").replace(/{{LOCALIZATION_PATH}}/g, this.LocalizationPath);
			this.SheetLinks = JSON.parse(data);
		}
		catch (e) { console.error(e); }

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

	// CLEANUP STAGE 1: HASHES
	// bdat-rs takes care of hashes in the column names, but not in values!
	// we want to be able to retain both, so let's do a bit of cleanup here
	static CleanupSheetsStage1() {
		let sheetKeys = this.Collection.Sheets.keys();
		for (const key of sheetKeys) {
			let sheet = this.Collection.Sheets.get(key);

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

			this.Collection.Sheets.set(key, sheet);
		}
	}

	// CLEANUP STAGE 2: TEMPLATES
	// this is a helper stage to stage 3. templates are used when repeating table indices would just get too obtuse
	// templates become incredibly useful with, for example, items in 2, as their references are split across many, many tables
	// instead of having 24 duplicates in the sheet links, we can just declare a template with 24 children, then apply the template to the link
	static CleanupSheetsStage2(links) {
		for (var i = 0; i < links.length; i++) {
			const matchup = links[i];

			// continue if there is no template specified
			if (matchup.template == null || IsNullOrWhitespace(matchup.template))
				continue;

			// template doesn't exist, continue
			if (this.SheetLinks.templates[matchup.template] == null) {
				console.debug(`no template "${matchup.template}" found`);
				continue;
			}

			const template = this.SheetLinks.templates[matchup.template];

			// delete this matchup from the array
			links.splice(i, 1);

			for (var j = 0; j < template.length; j++) {
				let merged = {...matchup, ...template[j]};
				//delete merged.template;

				// add to links
				links.splice(i, 0, merged);
			}

			// skip ahead to the next matchup
			if (j > 0)
				i += j - 1;
		}
	}

	// CLEANUP STAGE 3: REFERENCES
	// ink source sheets and their columns can be regular expressions,
	// which makes a big old many->many relationship. let's get every matchup we can
	// then send it to a dedicated matching method.
	static CleanupSheetsStage3(links, defaultLink) {
		if (links == null)
			return;

		const ALL_SHEETS = Array.from(this.Collection.Sheets.keys());
		for (let link of links) {
			// if we have a default matchup, apply its properties
			if (defaultLink != null)
				link = {...defaultLink, ...link};

			//console.debug("new link", `${link.src}:${link.src_column} -> ${link.target}:${link.target_column}`);

			// first, we need a list of each of our source sheets (any that match)
			// the source is potentially a regular expression
			let sourceSheets = [];
			if (link.src.startsWith('/') && link.src.endsWith('/')) {
				// remove the surrounding slashes
				let source = link.src.substring(1, link.src.length - 1);
				let filtered = ALL_SHEETS.filter(x => x.match(source));
				let regexObject = new RegExp(source);
				filtered.map(x => sourceSheets.push(x.match(regexObject)));
			}
			else {
				// treating as not a regular expression, so only one source sheet
				if (ALL_SHEETS.includes(link.src))
					sourceSheets = [[link.src]];
			}

			// make any empty matches a blank string, not undefined
			for (let idx in sourceSheets) {
				for (let i = 0; i < sourceSheets[idx].length; i++) {
					if (sourceSheets[idx][i] == null)
						sourceSheets[idx][i] = "";
				}
			}

			// the source tables are assured to exist from here on out
			
			//console.debug("all source sheets:", sourceSheets);
			for (const sheetMatch of sourceSheets) {
				const ALL_COLUMNS = this.Collection.Sheets.get(sheetMatch[0]).schema.map(x => x.name);
				
				// src_column may also be a regular expression
				// (we're checking here as columns can be different between sheets)
				let sourceColumns = [];
				if (link.src_column.startsWith('/') && link.src_column.endsWith('/')) {
					let column = link.src_column.substring(1, link.src_column.length - 1);
					let filtered = ALL_COLUMNS.filter(x => x.match(column));
					let regexObject = new RegExp(column);
					filtered.map(x => sourceColumns.push(x.match(regexObject)));
				}
				else {
					// treating as not a regular expression, so only one column
					if (ALL_COLUMNS.includes(link.src_column))
						sourceColumns = [[link.src_column]];
				}

				for (const columnMatch of sourceColumns) {
					function replaces(str) {
						if (IsNullOrWhitespace(str))
							throw "tried to replace on null string";
						str = str.replace("$S1", sheetMatch[1]).replace("$S2", sheetMatch[2]).replace("$S3", sheetMatch[3]);
						str = str.replace("$C0", columnMatch[0]).replace("$C1", columnMatch[1]).replace("$C2", columnMatch[2]).replace("$C3", columnMatch[3]);
						return str;
					}

					let matchup = {
						src: sheetMatch[0],
						src_column: columnMatch[0],
						target: replaces(link.target),
						target_column: replaces(link.target_column)
					};

					// get everything else from the link
					matchup = {...link, ...matchup};

					// do the matchup from here
					this.CleanupSheetsStage3_DoMatch(matchup);
				}
			}
		}
	}

	// this is what actually does the matching. we're sure that this is
	// a 1-1 match at this point so we can ignore most checking safely
	// occaisionally, we'll need criteria to further the match.
	static CleanupSheetsStage3_DoMatch(matchup) {
		//console.debug("processing matchup", matchup);

		// do standard shit here
		var srcSheet = this.Collection.Sheets.get(matchup.src);
		var targetSheet = this.Collection.Sheets.get(matchup.target);

		if (srcSheet == null) {
			console.warn(`Source sheet for ${matchup.src} -> ${matchup.target} not found`);
			return;
		}
		if (targetSheet == null) {
			console.warn(`Target sheet for ${matchup.src} -> ${matchup.target} not found`);
			return;
		}

		const srcColumn = this.Collection.GetColumnMapFromSheet(srcSheet).get(matchup.src_column);
		const targetColumn = this.Collection.GetColumnMapFromSheet(targetSheet).get(matchup.target_column);
		const targetColumnDisplay = IsNullOrWhitespace(matchup.target_column_display) ? targetColumn : this.Collection.GetColumnMapFromSheet(targetSheet).get(matchup.target_column_display);

		if (srcColumn == null) {
			console.warn(`Source column (${matchup.src_column}) for ${matchup.src} -> ${matchup.target} not found`);
			return;
		}
		if (targetColumn == null) {
			console.warn(`Target column (${matchup.target_column}) for ${matchup.src} -> ${matchup.target} not found`);
			return;
		}
		if (targetColumnDisplay == null) {
			console.warn(`Target display column (${matchup.target_column_display}) for ${matchup.src} -> ${matchup.target} not found`);
			return;
		}

		// for tables that start at something like 1001
		var targetFirstIndex = targetSheet.rows[0]["$id"];
		var srcFirstIndex = srcSheet.rows[0]["$id"];

		for (var i = 0; i < srcColumn.length; i++) {
			var srcValue = srcColumn[i];
			var srcBasicValue = srcValue;

			// first, if we're matching against 0, then that's probably an empty reference
			// don't skip if we explicitly ignore zero values
			if (srcValue == 0) {
				if (matchup.hide_zero_values)
					srcSheet.rows[i][matchup.src_column] = "";
				if (!matchup.ignore_zero_values)
					continue;
			}

			// next, let's check the criteria
			if (matchup.criteria != null) {
				var failedCriteria = false;

				// set columns if they haven't been set
				for (var crit of matchup.criteria) {
					crit.column = IsNullOrWhitespace(crit.column) ? matchup.src_column : crit.column;
				}

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

				CheckCriteriaType("src_column_above", (crit) => { return srcColumn[i] > crit.value; });
				CheckCriteriaType("src_column_below", (crit) => { return srcColumn[i] < crit.value; });
				CheckCriteriaType("src_column_equals", (crit) => { return srcColumn[i] == crit.value; });
				CheckCriteriaType("src_column_between", (crit) => { return srcColumn[i] > crit.above && srcColumn[i] < crit.below; });

				// if we fail, onto the next
				if (failedCriteria)
					continue;
			}

			// if this is already a value somehow, we want the actual value
			if (IsObject(srcValue)) {
				if (!IsNullOrWhitespace(srcValue.raw_value))
					srcBasicValue = srcValue.raw_value;
				else
					continue;
			}

			// add any offsets here
			if (Number.isInteger(srcBasicValue) && Number.isInteger(matchup.value_offset)) {
				srcBasicValue += matchup.value_offset;
				// update object if needed
				if (IsObject(srcValue))
					srcValue.raw_value = srcBasicValue;
				else
					srcValue = srcBasicValue;
			}

			var targetIndex = targetColumn.findIndex((e) => {
				// look for exact matches or obj.value matches
				if (e == srcBasicValue)
					return true;
				else if (IsObject(e))
					return e.raw_value == srcBasicValue;
				return false;
			});

			if (targetIndex == -1) {
				if (!matchup.ignore_zero_values)
					console.warn(`Match value for ${matchup.src}:${matchup.src_column} -> ${matchup.target}:${matchup.target_column} does not exist`);
				continue;
			}

			const targetTrueIndex = targetFirstIndex + targetIndex;

			var targetValue = targetColumnDisplay[targetIndex];

			if (targetValue == null) {
				console.warn(`Target value for ${matchup.src}:${matchup.src_column} -> ${matchup.target}:${matchup.target_column} not found`);
				continue;
			}

			var matchLink = `/${this.OutPath}${matchup.target.replace("#", "/")}.html#${targetTrueIndex}`.replace("//", "/");

			if (!IsObject(srcValue)) {
				srcValue = { "raw_value": srcValue };
			}

			// match values can be odd
			// they can either be the result of a hash,
			// or they can be a previous match value. let's check

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
			srcValue.match_hints = matchup.hints;

			// actually apply to the sheet
			srcSheet.rows[i][matchup.src_column] = srcValue;

			// add the reference to the target sheet's references
			// (shown in the Referenced by column)
			if (targetSheet.references == null)
				targetSheet.references = {};
			if (targetSheet.references[targetTrueIndex] == null)
				targetSheet.references[targetTrueIndex] = [];

			targetSheet.references[targetTrueIndex].push({
				sheet: matchup.src.split('#')[1],
				value: matchValue,
				column: srcFirstIndex + i,
				link: `/${this.OutPath}${matchup.src.replace("#", "/")}.html#${srcFirstIndex + i}`.replace("//", "/")
			});
		}
	}

	// HTML creating functions

	static async CreateRootIndex() {
		let dataList = "<ul>\n";
		let localizationList = "";

		function printToSchema(schema) {
			let tableList = `<li><span class="bdatTableName">${schema.bdat_path}</span><ul>\n`;
	
			for (const sheet of schema.sheets) {
				let classes = ["bdatSheetName"];
				let sheetName = sheet;
				if (sheet.match(/^[0-9A-F]{8}$/)) {
					sheetName = "<" + sheet + ">";
					classes.push("bdatHash");
				}
	
				tableList += `\t<li><a href="${schema.bdat_path.substring(1) + "/" + sheet + ".html"}" class="${classes.join(" ")}">${htmlEntities(sheetName)}</a></li>\n`;
			}
	
			tableList += "</ul></li>";

			return tableList;
		}
	
		for (const schema of Array.from(this.Collection.TableSchemas.values()).filter(x => !StartsWithList(x.bdat_path, bdat.AllLocalizations))) {
			dataList += printToSchema(schema);
		}
		dataList += "</ul>\n";

		if (this.ExportLocalizationSheets) {
			let langMap = new Map();
			for (const lang of bdat.AllLocalizations) {
				langMap.set(lang, []);
			}
	
			for (const schema of Array.from(this.Collection.TableSchemas.values()).filter(x => StartsWithList(x.bdat_path, bdat.AllLocalizations))) {
				langMap.get(StartsWithListWhich(schema.bdat_path, bdat.AllLocalizations)).push(schema);
			}
	
			for (const key of langMap.keys()) {
				const arr = langMap.get(key);
				if (arr.length == 0)
					continue;

				const nameIdx = bdat.AllLocalizations.indexOf(key);
				localizationList += `<details><summary>${bdat.AllLocalizationNames[nameIdx]}</summary>`;
				localizationList += "<ul>\n";
				for (const schema of arr) {
					localizationList += printToSchema(schema);
				}
				localizationList += "</ul>\n";
				localizationList += "</details>\n";
			}
		}
		else {
			localizationList = "N/A";
		}
	
		if (!fs.existsSync(this.OutPath)){
			fs.mkdirSync(this.OutPath, { recursive: true });
		}

		var htmlout = this.TemplateIndex;
		htmlout = htmlout.replace("{{data_list}}", dataList);
		htmlout = htmlout.replace("{{localization_list}}", localizationList);
	
		var indexStream = fs.createWriteStream(this.OutPath + "index.html");
		indexStream.write(htmlout);
		indexStream.end();
	}

	static async CreateSheetTable(sheet) {
		if (sheet == null)
			return;

		//console.debug("creating page for", sheet.parent_table + "#" + sheet.name);
		//console.debug("its references:", sheet.references);

		let columnType = new Map();
		for (const column of sheet.schema) {
			columnType.set(column.name, column.type);
		}

		let table = `<table class="sortable">\n`;

		table += `<thead><tr id="header">`;
		table += `<th class="columnMeta no-sort">Ref'd. by</th>\n`;
		table += `<th aria-sort="ascending">$id</th>\n`;
		for (const column of sheet.schema) {
			if (column.flags != null) {
				// we are making an assumption here: flags will likely only be ints
				// just get the numbers from the end to get our length
				let len = bdat.BDATTypes[column.type].split("Int");
				len = parseInt(len[len.length - 1]);

				// make separate columns for each flag
				for (const flagPart of column.flags) {
					table += `<th class="columnFlag">${htmlEntities(flagPart.label)}<span class="columnType"><br>Part of ${htmlEntities(column.name)}, ${bdat.BDATTypes[column.type]} - 0x${column.type.toString(16).toUpperCase()}<br>0b${flagPart.mask.toString(2).padStart(len, '0')}</span></th>\n`;
				}
			}
			else {
				// can't wrap this because of the sorting arrow :(
				table += `<th>${htmlEntities(column.name)}<span class="columnType"><br>${bdat.BDATTypes[column.type]} - 0x${column.type.toString(16).toUpperCase()}</span></th>\n`;
			}
		}
		table += "</tr></thead>\n";

		table += "<tbody>\n";
		for (const row of sheet.rows) {
			const rowId = row["$id"];
			table += `<tr id=${rowId}>`;

			// references
			table += `<td class="cellMeta">`;
			if (sheet.references != null) {
				let refs = sheet.references[rowId];
				if (refs != null) {
					table += "<details>";
					table += `<summary>${refs.length} refs</summary>\n`;
					for (const theref of refs) {
						table += `<a href="${theref.link}" title="${theref.value}">${theref.sheet}:${theref.column}</a>\n`;
					}
					table += "</details>"
				}
			}
			table += "</td>";

			// actual columns
			for (let [key, cellData] of Object.entries(row)) {
				var toIterate = ["temp"];

				if (IsObject(cellData) && cellData.raw_value == null) {
					// this is likely a flag. let's take each key and add it to toIterate
					toIterate = Object.keys(cellData);
				}

				for (const field of toIterate) {
					var classes = [];
					var display = "";

					if (field == "temp") {
						if (IsObject(cellData)) {
							let dispValue = htmlEntities(cellData.raw_value);
							let extraElements = "";
		
							if (columnType.get(key) == 9) {
								classes.push("cellHash");
			
								let hashMissing = cellData.hash_status == "missing";
								let hashNull = cellData.hash_status == "null";
		
								if (hashMissing)
									classes.push("cellHashMissing");
								else if (hashNull)
									classes.push("cellHashNull");
								
								if (!hashMissing) {
									if (cellData.hash_value != null)
										dispValue = htmlEntities(cellData.hash_value);
									extraElements += `<span class="cellRawValue">&lt;${cellData.hash.toString(16).toUpperCase().padStart(8, "0")}&gt;</span>`;
								}
							}
							else if (!IsNullOrWhitespace(cellData.match_value)) {
								// display linked value if we need it
								dispValue = htmlEntities(cellData.match_value);
								extraElements += `<span class="cellRawValue">${htmlEntities(cellData.raw_value)}</span>`;
							}

							// if we're not exporting localizations, don't add the link
							if (!this.ExportLocalizationSheets && cellData.match_hints instanceof Array && cellData.match_hints.includes("cellLocalization"))
								cellData.match_link = "";
		
							// put in a tag. optionally add a link
							let tagValue = "<a";
							tagValue += IsNullOrWhitespace(cellData.match_link) ? "" : ` href="${cellData.match_link}"`;
							tagValue += cellData.match_hints instanceof Array ? ` class="${cellData.match_hints.join(" ")}"` : "";
							tagValue += `>${dispValue}</a>`;
							// but no empty elements
							tagValue = tagValue.replace("<a></a>", "");
						
							// overwriting it at the end
							display = tagValue + extraElements;
						}
						else {
							display = htmlEntities(cellData);
						}
					}
					else {
						// something to process! assuming it's a flag for now
						let value = "undefined";
						try {
							value = cellData[field];
						}
						catch {
							console.error("Failed to get field from cell data");
						}

						classes.push("cellFlag");
						if (value == 0)
							classes.push("cellFlagFalse");

						//display = value == 1 ? "x" : "";
						display = value == 1;
					}
					
					display = `<div class="cellWrapper">${display}</div>`;
	
					var attributesText = "";
					if (classes.length != 0)
						attributesText = ` class="${classes.join(" ")}"`;
	
					table += `<td${attributesText}>${display}</td>`;
				}
			}
			table += "</tr>\n";
		}
		table += "</tbody>\n";
	
		table += "</table>\n";

		const outPath = this.OutPath + sheet.parent_table + "/";
	
		if (!fs.existsSync(outPath)){
			fs.mkdirSync(outPath, { recursive: true });
		}

		var htmlout = this.TemplateSheet;
		htmlout = htmlout.replace("{{table_name}}", sheet.parent_table);
		htmlout = htmlout.replace("{{sheet_name}}", sheet.name);
		htmlout = htmlout.replace("{{sheet_table}}", table);
	
		var indexStream = fs.createWriteStream(outPath + sheet.name + ".html");
		indexStream.write(htmlout);
		indexStream.end();
	}
}

(async () => {
	// get templates and data
	console.log("Getting templates");
	await BDATcollator.GetTemplates();
	console.log("Getting helper data");
	await BDATcollator.GetData();

	// get .bschema files
	console.log("Getting table schemas");
	await BDATcollator.Collection.GetTableSchemas();

	// get tables and their sheets
	console.log("Getting sheets in schemas");
	await BDATcollator.Collection.GetSheetsFromTableSchemas();

	// cleanup and processing
	console.log("Cleaning and processing sheets");
	BDATcollator.CleanupSheetsStage1();
	BDATcollator.CleanupSheetsStage2(BDATcollator.SheetLinks.localizations);
	BDATcollator.CleanupSheetsStage2(BDATcollator.SheetLinks.links);
	BDATcollator.CleanupSheetsStage3(BDATcollator.SheetLinks.localizations, {
		"target_column": "$id",
		"target_column_display": "name",
		"hints": ["cellLocalization"]
	});
	BDATcollator.CleanupSheetsStage3(BDATcollator.SheetLinks.links);

	// create index page
	console.log("Creating root index");
	await BDATcollator.CreateRootIndex();

	// create sheet pages
	console.log("Creating sheet pages");
	for (const sheet of BDATcollator.Collection.Sheets.values()) {
		// don't make pages from localization sheets if the user doesn't want to
		if (!BDATcollator.ExportLocalizationSheets && StartsWithList(sheet.parent_table, BDATcollator.LocalizationsToExport))
			continue;

		BDATcollator.CreateSheetTable(sheet);
	}

	console.log("Finished!");
})()

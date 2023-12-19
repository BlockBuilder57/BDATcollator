// this is a utility just designed to copy the debug columns left in 3's 1.3.0 update to another target (latest)
// it's written in a way that it could be used with other things though, so if there is a use feel free to use it

const fsp = require("node:fs/promises");
const fs = require("node:fs");
const path = require("node:path");
const bdat = require("../BDATCollection.js");
require("../utils.js")();

const copies = [
	["/sys.bdat#CHR_PC", "DebugName"],
	["/sys.bdat#CHR_UroBody", "DebugName"],
	["/sys.bdat#ITM_Accessory", "DebugName"],
	["/sys.bdat#ITM_Gem", "DebugName"],
	["/sys.bdat#RSC_GimmickObject", "Comment"],
	["/sys.bdat#RSC_MapObjList", "Comment"],
	["/sys.bdat#RSC_PcCostumeOpen", "Comment"],
	["/sys.bdat#SYS_FlowEventList", "comment"],
	["/sys.bdat#SYS_MapList", "Comment"],
	["/sys.bdat#SYS_MapPartsList", "Comment"],
	["/sys.bdat#SYS_OrnamentMapParts", "Locations"],
	["/sys.bdat#SYS_PopupAnnounce", "Comment"],
	["/sys.bdat#SYS_ScenarioFlag", "comment"],
	["/sys.bdat#SYS_SystemOpen", "Comment"],
	["/sys.bdat#SYS_TrialList", "Comment"],
	["/sys.bdat#SYS_TrialPartyInfo", "Comment"],
	["/sys.bdat#SYS_WeatherList", "Debug_name"],
	["/sys.bdat#VO_BattleEN", "DebugMemo"],
	["/sys.bdat#VO_BattlePC", "DebugMemo"],
	["/sys.bdat#VO_BattleSP", "DebugName"],
	["/sys.bdat#VO_Field", "DebugMemo"]
];

(async () => {
	var debug = new bdat.BDATCollection("tables/xb3_130_base_debug");
	var target = new bdat.BDATCollection("tables/xb3_211_dlc04_hashed_edits");

	await debug.GetTableSchemas();
	await target.GetTableSchemas();

	await debug.GetSheetsFromTableSchemas();
	await target.GetSheetsFromTableSchemas();

	for (const tuple of copies) {
		const tableName = tuple[0];
		const columnName = tuple[1];

		console.debug("new group:", tableName, columnName);

		var debugSheet = debug.Sheets.get(tableName);
		var targetSheet = target.Sheets.get(tableName);

		// row indices can shift around all the time
		// let's map to the ID, which (as far as I know) does *not* change

		var scuffedMap = new Map(); // "<00000000>" -> "ディーズナッツ"

		for (const row of debugSheet.rows) {
			scuffedMap.set(row["$id"], row[columnName]);
		}

		for (var row of targetSheet.rows) {
			if (scuffedMap.has(row["$id"])) {
				row[columnName] = scuffedMap.get(row["$id"]);
			}
		}

		const outPath = "out/debug_columns/" + targetSheet.parent_table + "/";
		const fileName = targetSheet.name + ".json";

		delete targetSheet.name;
		delete targetSheet.parent_table;
	
		if (!fs.existsSync(outPath)){
			fs.mkdirSync(outPath, { recursive: true });
		}

		var outStream = fs.createWriteStream(outPath + fileName);
		outStream.write(JSON.stringify(targetSheet, null, 2));
		outStream.end();
	}

	console.log("Finished!");
})()

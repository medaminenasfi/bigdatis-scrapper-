const fs = require("fs");
const src = JSON.parse(fs.readFileSync("locations-cache.json", "utf8"));
const usable = src.filter((x) => x.use !== false).sort((a, b) => a.id - b.id);
fs.writeFileSync("exports/usable-locations-all.json", JSON.stringify(usable, null, 2));
const esc = (s) => String(s ?? "").replace(/"/g, '""');
const rows = ["id,name,level,use"];
for (const x of usable) {
  rows.push(`${x.id},"${esc(x.name)}",${x.level ?? ""},${x.use ?? ""}`);
}
fs.writeFileSync("exports/usable-locations-all.csv", rows.join("\n"));
console.log("usable=" + usable.length);
console.log("json=exports/usable-locations-all.json");
console.log("csv=exports/usable-locations-all.csv");

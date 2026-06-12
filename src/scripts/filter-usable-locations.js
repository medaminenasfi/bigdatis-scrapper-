const fs = require('fs');
const path = require('path');
const { filterLocations, getGovernorateFromName, normalizeGov } = require('../utils/locationFilter');

const CACHE = path.join(__dirname, '../../locations-cache.json');
const OUT_JSON = path.join(__dirname, '../../exports/usable-locations-filtered.json');
const OUT_CSV = path.join(__dirname, '../../exports/usable-locations-filtered.csv');

if (!fs.existsSync(CACHE)) {
    console.error('locations-cache.json not found at', CACHE);
    process.exit(1);
}

const all = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const usable = all.filter((x) => x.use !== false);

const idsToRemove = new Set([
    1483, 1482,
    1300, 1301, 1302, 1303, 1304, 1305, 1306, 1307, 1308, 1309, 1310, 1311,
]);

const removed = [];
const filtered = usable.filter((loc) => {
    if (!loc) return false;
    if (idsToRemove.has(Number(loc.id))) {
        removed.push({ id: loc.id, name: loc.name, reason: 'explicit-id' });
        return false;
    }
    if (!filterLocations([loc]).length) {
        removed.push({
            id: loc.id,
            name: loc.name,
            reason: `governorate:${normalizeGov(getGovernorateFromName(loc.name))}`,
        });
        return false;
    }
    return true;
});

fs.writeFileSync(OUT_JSON, JSON.stringify(filtered, null, 2), 'utf8');
const rows = ['id,name,level,use,governorate'];
for (const x of filtered) {
    const n = String(x.name || '').replace(/"/g, '""');
    const gov = getGovernorateFromName(x.name);
    rows.push(`${x.id},"${n}",${x.level ?? ''},${x.use ?? ''},"${gov}"`);
}
fs.writeFileSync(OUT_CSV, rows.join('\n'), 'utf8');

const byGov = {};
for (const x of filtered) {
    const g = getGovernorateFromName(x.name);
    byGov[g] = (byGov[g] || 0) + 1;
}

console.log(`Total usable before: ${usable.length}`);
console.log(`Total removed: ${removed.length}`);
console.log(`Total usable after: ${filtered.length}`);
console.log('By governorate:', byGov);
console.log(`Wrote: ${OUT_JSON}`);
console.log(`Wrote: ${OUT_CSV}`);

process.exit(0);

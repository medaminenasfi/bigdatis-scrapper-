/**
 * Governorate-aware location filtering for scrape targets.
 * Uses the last comma-separated segment of location.name as governorate.
 */

const DEFAULT_ALLOWED = ['tunis', 'sfax', 'sousse', 'monastir', 'mahdia', 'nabeul'];

const DEFAULT_BLOCKED = [
    'gabes', 'gabès',
    'medenine', 'médenine',
    'tataouine',
    'tozeur',
    'gafsa',
    'kasserine',
    'jendouba',
    'beja', 'béja',
    'bizerte',
    'kebili', 'kébili',
    'kairouan',
    'kef', 'el kef',
    'siliana',
    'sidi bouzid',
    'ariana',
    'ben arous',
    'la manouba', 'manouba',
    'zaghouan',
];

function normalizeGov(s) {
    if (!s) return '';
    return String(s)
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim();
}

function getGovernorateFromName(locationName) {
    const parts = String(locationName || '').split(',').map((p) => p.trim());
    return parts[parts.length - 1] || '';
}

function parseAllowedGovernorates(envValue) {
    if (!envValue || !String(envValue).trim()) {
        return [...DEFAULT_ALLOWED];
    }
    return String(envValue)
        .split(',')
        .map((g) => normalizeGov(g.trim()))
        .filter(Boolean);
}

function parseBlockedGovernorates(envValue) {
    const base = [...DEFAULT_BLOCKED];
    if (!envValue || !String(envValue).trim()) {
        return base;
    }
    const extra = String(envValue)
        .split(',')
        .map((g) => normalizeGov(g.trim()))
        .filter(Boolean);
    return [...new Set([...base, ...extra])];
}

function isAllowedGovernorate(locationName, options = {}) {
    const gov = normalizeGov(getGovernorateFromName(locationName));
    if (!gov) return false;

    const blocked = options.blocked || parseBlockedGovernorates(process.env.BLOCKED_GOVERNORATES);
    if (blocked.some((b) => gov === b || gov.includes(b))) {
        return false;
    }

    const allowed = options.allowed || parseAllowedGovernorates(process.env.TARGET_GOVERNORATES);
    return allowed.includes(gov);
}

function filterLocations(locations, options = {}) {
    return (locations || []).filter((loc) => loc && isAllowedGovernorate(loc.name, options));
}

module.exports = {
    DEFAULT_ALLOWED,
    DEFAULT_BLOCKED,
    normalizeGov,
    getGovernorateFromName,
    parseAllowedGovernorates,
    parseBlockedGovernorates,
    isAllowedGovernorate,
    filterLocations,
};

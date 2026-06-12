#!/usr/bin/env node
/**
 * Verify scrape target list excludes blocked governorates.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
    filterLocations,
    getGovernorateFromName,
    normalizeGov,
    parseAllowedGovernorates,
} = require('../utils/locationFilter');

const BLOCKED_VERIFY = [
    'Gabès', 'Médenine', 'Tataouine', 'Tozeur', 'Gafsa',
    'Kasserine', 'Jendouba', 'Béja', 'Bizerte',
];

const ROOT = path.join(__dirname, '../..');

function loadSelectedLocations() {
    const filteredPath = path.join(ROOT, 'exports/usable-locations-filtered.json');
    const list = JSON.parse(fs.readFileSync(filteredPath, 'utf8'));
    return filterLocations(list);
}

function estimateRuntime(locationCount) {
    const pagesPerLoc = parseInt(process.env.MAX_PAGES_PER_RUN, 10) || 5;
    const requestDelay = parseInt(process.env.REQUEST_DELAY, 10) || 1000;
    const searchOnly = process.env.SEARCH_ONLY === 'true';

    // Measured June 6: ~28s per location (mixed save/skip)
    const secPerLocationMeasured = 28;
    const baseMinutes = (locationCount * secPerLocationMeasured) / 60;

    // Search API only: ~4.6s per location (benchmark 3 locs)
    const searchOnlyMinutes = (locationCount * 4.6) / 60;

    // Full mode enrichment multiplier when DB has new props (~3x API calls)
    const fullModeMinutes = searchOnly
        ? searchOnlyMinutes
        : baseMinutes * 1.4; // conservative with enrichment

    const maxPagesMinutes = (locationCount * pagesPerLoc * (2.5 + requestDelay / 1000)) / 60;

    return {
        locations: locationCount,
        pagesPerLocation: pagesPerLoc,
        searchOnly,
        estimatedMinutes: {
            measuredBaseline: Math.round(baseMinutes),
            searchOnlyMode: Math.round(searchOnlyMinutes),
            fullModeCurrent: Math.round(fullModeMinutes),
            worstCaseAllPages: Math.round(maxPagesMinutes),
        },
        estimatedHours: {
            measuredBaseline: (baseMinutes / 60).toFixed(1),
            searchOnlyMode: (searchOnlyMinutes / 60).toFixed(1),
            fullModeCurrent: (fullModeMinutes / 60).toFixed(1),
            worstCaseAllPages: (maxPagesMinutes / 60).toFixed(1),
        },
    };
}

function main() {
    const selected = loadSelectedLocations();
    const byGov = {};
    const violations = [];

    for (const loc of selected) {
        const gov = getGovernorateFromName(loc.name);
        const norm = normalizeGov(gov);
        byGov[gov] = (byGov[gov] || 0) + 1;

        for (const blocked of BLOCKED_VERIFY) {
            if (normalizeGov(blocked) === norm) {
                violations.push({ id: loc.id, name: loc.name, governorate: gov });
            }
        }
    }

    const allowed = parseAllowedGovernorates(process.env.TARGET_GOVERNORATES);
    const runtime = estimateRuntime(selected.length);

    const report = {
        generatedAt: new Date().toISOString(),
        config: {
            TARGET_GOVERNORATES: process.env.TARGET_GOVERNORATES,
            USE_FILTERED_LOCATIONS: process.env.USE_FILTERED_LOCATIONS,
            SEARCH_ONLY: process.env.SEARCH_ONLY,
            MAX_PAGES_PER_RUN: process.env.MAX_PAGES_PER_RUN,
            REQUEST_DELAY: process.env.REQUEST_DELAY,
        },
        totalSelected: selected.length,
        allowedGovernorates: allowed,
        blockedGovernoratesVerified: BLOCKED_VERIFY,
        violationsCount: violations.length,
        violations,
        byGovernorate: Object.entries(byGov).sort((a, b) => b[1] - a[1]),
        runtimeEstimate: runtime,
        passed: violations.length === 0,
    };

    const out = path.join(ROOT, 'exports/location-filter-verification.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2));

    console.log('=== LOCATION FILTER VERIFICATION ===\n');
    console.log('Selected locations:', selected.length);
    console.log('Allowed governorates:', allowed.join(', '));
    console.log('\nBy governorate:');
    for (const [g, c] of report.byGovernorate) console.log(`  ${g}: ${c}`);

    console.log('\nBlocked governorate check:');
    for (const b of BLOCKED_VERIFY) {
        const count = selected.filter((l) => normalizeGov(getGovernorateFromName(l.name)) === normalizeGov(b)).length;
        console.log(`  ${b}: ${count === 0 ? 'PASS (0)' : `FAIL (${count})`}`);
    }

    console.log('\nRuntime estimate per run:');
    console.log(`  Search-only mode:  ~${runtime.estimatedHours.searchOnlyMode}h (${runtime.estimatedMinutes.searchOnlyMode} min)`);
    console.log(`  Full mode (current): ~${runtime.estimatedHours.fullModeCurrent}h (${runtime.estimatedMinutes.fullModeCurrent} min)`);
    console.log(`  Measured baseline: ~${runtime.estimatedHours.measuredBaseline}h (${runtime.estimatedMinutes.measuredBaseline} min)`);

    console.log(`\nOverall: ${report.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`Report: ${out}`);

    process.exit(report.passed ? 0 : 1);
}

main();

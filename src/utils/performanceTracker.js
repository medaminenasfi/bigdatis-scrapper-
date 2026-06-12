const fs = require('fs');
const path = require('path');

/**
 * In-process performance instrumentation for scraper runs.
 * Writes JSON report to exports/ when finalize() is called.
 */
class PerformanceTracker {
    constructor(options = {}) {
        this.enabled = options.enabled !== false && process.env.PERF_TRACKING !== 'false';
        this.runId = options.runId || new Date().toISOString().replace(/[:.]/g, '-');
        this.runStartMs = Date.now();
        this.mode = {
            searchOnly: process.env.SEARCH_ONLY === 'true',
            enableDuplicatesCheck: process.env.ENABLE_DUPLICATES_CHECK === 'true',
            requestDelay: parseInt(process.env.REQUEST_DELAY) || 1000,
            maxPagesPerRun: process.env.MAX_PAGES_PER_RUN || null,
            maxLocationsPerRun: process.env.MAX_LOCATIONS_PER_RUN || null,
            targetLocationNames: process.env.TARGET_LOCATION_NAMES || null
        };

        this.functions = {};
        this.locations = new Map();
        this.currentLocationId = null;
        this.operations = [];

        this.totals = {
            searchRequests: 0,
            detailsRequests: 0,
            contactsRequests: 0,
            sourcesRequests: 0,
            mongoQueries: 0,
            retries: 0,
            rateLimit429: 0,
            pagesScanned: 0,
            propertiesProcessed: 0,
            propertiesSaved: 0,
            propertiesSkipped: 0,
            propertiesUpdated: 0,
            duplicatesSession: 0,
            duplicatesDb: 0,
            sleepMs: 0,
            throttleWaitMs: 0
        };
    }

    _ensureFunction(name) {
        if (!this.functions[name]) {
            this.functions[name] = {
                name,
                callCount: 0,
                totalMs: 0,
                minMs: Infinity,
                maxMs: 0,
                retries: 0,
                rateLimit429: 0,
                recordsProcessed: 0,
                recordsSaved: 0,
                recordsSkipped: 0,
                responseTimesMs: []
            };
        }
        return this.functions[name];
    }

    _ensureLocation(locationId) {
        const key = String(locationId);
        if (!this.locations.has(key)) {
            this.locations.set(key, {
                locationId: key,
                locationName: null,
                governorate: null,
                startMs: null,
                endMs: null,
                totalMs: 0,
                pagesScanned: 0,
                propertiesDiscovered: 0,
                propertiesSaved: 0,
                propertiesSkipped: 0,
                propertiesUpdated: 0,
                duplicatesSession: 0,
                duplicatesDb: 0,
                searchRequests: 0,
                detailsRequests: 0,
                contactsRequests: 0,
                sourcesRequests: 0,
                mongoQueries: 0,
                retries: 0,
                rateLimit429: 0,
                sleepMs: 0
            });
        }
        return this.locations.get(key);
    }

    setLocationMeta(locationId, { name, governorate } = {}) {
        if (!this.enabled || locationId == null) return;
        const loc = this._ensureLocation(locationId);
        if (name) loc.locationName = name;
        if (governorate) loc.governorate = governorate;
    }

    startLocation(locationId) {
        if (!this.enabled) return;
        this.currentLocationId = locationId;
        const loc = this._ensureLocation(locationId);
        loc.startMs = Date.now();
    }

    endLocation(locationId, stats = {}) {
        if (!this.enabled) return;
        const loc = this._ensureLocation(locationId);
        loc.endMs = Date.now();
        if (loc.startMs) {
            loc.totalMs = loc.endMs - loc.startMs;
        }
        if (stats.pages != null) loc.pagesScanned = stats.pages;
        if (stats.scraped != null) loc.propertiesDiscovered = stats.scraped;
        if (stats.saved != null) loc.propertiesSaved = stats.saved;
        if (stats.skipped != null) loc.propertiesSkipped = stats.skipped;
        if (stats.updated != null) loc.propertiesUpdated = stats.updated;
        this.currentLocationId = null;
    }

    /**
     * Wrap an async function with timing and counters.
     */
    async track(name, fn, meta = {}) {
        if (!this.enabled) {
            return fn();
        }

        const fnStats = this._ensureFunction(name);
        const loc = this.currentLocationId != null ? this._ensureLocation(this.currentLocationId) : null;
        const opStart = Date.now();
        const startIso = new Date(opStart).toISOString();

        fnStats.callCount += 1;
        if (meta.incrementRequest) {
            this._incrementRequestCounter(name);
            if (loc) this._incrementLocationRequestCounter(loc, name);
        }

        try {
            const result = await fn();
            const endMs = Date.now();
            const durationMs = endMs - opStart;

            this._recordDuration(fnStats, durationMs, meta);
            if (loc) {
                loc.totalMs = (loc.endMs || endMs) - (loc.startMs || this.runStartMs);
            }
            if (meta.recordsProcessed) {
                fnStats.recordsProcessed += meta.recordsProcessed;
                this.totals.propertiesProcessed += meta.recordsProcessed;
            }
            if (meta.recordsSaved) {
                fnStats.recordsSaved += meta.recordsSaved;
                this.totals.propertiesSaved += meta.recordsSaved;
            }
            if (meta.recordsSkipped) {
                fnStats.recordsSkipped += meta.recordsSkipped;
                this.totals.propertiesSkipped += meta.recordsSkipped;
            }

            this.operations.push({
                function: name,
                startTime: startIso,
                endTime: new Date(endMs).toISOString(),
                durationMs,
                locationId: this.currentLocationId,
                ...meta,
                status: 'ok'
            });

            return result;
        } catch (err) {
            const endMs = Date.now();
            this.operations.push({
                function: name,
                startTime: startIso,
                endTime: new Date(endMs).toISOString(),
                durationMs: endMs - opStart,
                locationId: this.currentLocationId,
                ...meta,
                status: 'error',
                error: err.message
            });
            throw err;
        }
    }

    recordSleep(ms, reason = 'delay') {
        if (!this.enabled) return;
        this.totals.sleepMs += ms;
        const fnStats = this._ensureFunction('sleep');
        fnStats.callCount += 1;
        fnStats.totalMs += ms;
        if (this.currentLocationId != null) {
            const loc = this._ensureLocation(this.currentLocationId);
            loc.sleepMs += ms;
        }
        if (reason === '429_cooldown') {
            this.totals.throttleWaitMs += ms;
        }
    }

    recordRetry(functionName) {
        if (!this.enabled) return;
        this.totals.retries += 1;
        const fnStats = this._ensureFunction(functionName);
        fnStats.retries += 1;
        if (this.currentLocationId != null) {
            this._ensureLocation(this.currentLocationId).retries += 1;
        }
    }

    record429(functionName, waitMs = 0) {
        if (!this.enabled) return;
        this.totals.rateLimit429 += 1;
        const fnStats = this._ensureFunction(functionName);
        fnStats.rateLimit429 += 1;
        if (this.currentLocationId != null) {
            this._ensureLocation(this.currentLocationId).rateLimit429 += 1;
        }
        if (waitMs > 0) {
            this.recordSleep(waitMs, '429_cooldown');
        }
    }

    recordPageScan() {
        if (!this.enabled) return;
        this.totals.pagesScanned += 1;
        if (this.currentLocationId != null) {
            this._ensureLocation(this.currentLocationId).pagesScanned += 1;
        }
    }

    recordDuplicateCheck({ session = 0, db = 0 } = {}) {
        if (!this.enabled) return;
        this.totals.duplicatesSession += session;
        this.totals.duplicatesDb += db;
        if (this.currentLocationId != null) {
            const loc = this._ensureLocation(this.currentLocationId);
            loc.duplicatesSession += session;
            loc.duplicatesDb += db;
        }
        const fnStats = this._ensureFunction('duplicateCheck');
        fnStats.callCount += session + db;
    }

    recordMongoQuery(count = 1, durationMs = 0) {
        if (!this.enabled) return;
        this.totals.mongoQueries += count;
        if (this.currentLocationId != null) {
            this._ensureLocation(this.currentLocationId).mongoQueries += count;
        }
        const fnStats = this._ensureFunction('mongoQuery');
        fnStats.callCount += count;
        if (durationMs > 0) {
            fnStats.totalMs += durationMs;
            fnStats.responseTimesMs.push(durationMs);
        }
    }

    _incrementRequestCounter(name) {
        const map = {
            makeRequest: 'searchRequests',
            fetchPropertyDetails: 'detailsRequests',
            fetchPropertyContacts: 'contactsRequests',
            fetchPropertySources: 'sourcesRequests'
        };
        const key = map[name];
        if (key) this.totals[key] += 1;
    }

    _incrementLocationRequestCounter(loc, name) {
        const map = {
            makeRequest: 'searchRequests',
            fetchPropertyDetails: 'detailsRequests',
            fetchPropertyContacts: 'contactsRequests',
            fetchPropertySources: 'sourcesRequests'
        };
        const key = map[name];
        if (key) loc[key] += 1;
    }

    _recordDuration(fnStats, durationMs, meta) {
        fnStats.totalMs += durationMs;
        fnStats.minMs = Math.min(fnStats.minMs, durationMs);
        fnStats.maxMs = Math.max(fnStats.maxMs, durationMs);
        if (meta.responseTimeMs != null) {
            fnStats.responseTimesMs.push(meta.responseTimeMs);
        } else {
            fnStats.responseTimesMs.push(durationMs);
        }
    }

    _avg(arr) {
        if (!arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    _pct(part, total) {
        if (!total) return 0;
        return Math.round((part / total) * 1000) / 10;
    }

    buildReport() {
        const runEndMs = Date.now();
        const totalRunMs = runEndMs - this.runStartMs;

        const functionTable = Object.values(this.functions)
            .map((f) => ({
                function: f.name,
                callCount: f.callCount,
                totalMs: f.totalMs,
                avgMs: f.callCount ? Math.round(f.totalMs / f.callCount) : 0,
                minMs: f.minMs === Infinity ? 0 : f.minMs,
                maxMs: f.maxMs,
                pctOfRuntime: this._pct(f.totalMs, totalRunMs),
                retries: f.retries,
                rateLimit429: f.rateLimit429,
                avgResponseMs: Math.round(this._avg(f.responseTimesMs)),
                recordsProcessed: f.recordsProcessed,
                recordsSaved: f.recordsSaved,
                recordsSkipped: f.recordsSkipped
            }))
            .sort((a, b) => b.totalMs - a.totalMs);

        const locationRows = Array.from(this.locations.values()).map((loc) => ({
            ...loc,
            avgMsPerPage: loc.pagesScanned ? Math.round(loc.totalMs / loc.pagesScanned) : 0,
            apiRequests:
                loc.searchRequests +
                loc.detailsRequests +
                loc.contactsRequests +
                loc.sourcesRequests,
            valueScore:
                loc.propertiesSaved > 0
                    ? 'high'
                    : loc.totalMs > 60000 && loc.propertiesSaved === 0
                      ? 'low'
                      : 'medium'
        }));

        const sortByTime = [...locationRows].sort((a, b) => b.totalMs - a.totalMs);
        const sortByApi = [...locationRows].sort((a, b) => b.apiRequests - a.apiRequests);
        const sortByProps = [...locationRows].sort(
            (a, b) => b.propertiesDiscovered - a.propertiesDiscovered
        );

        const totalApiCalls =
            this.totals.searchRequests +
            this.totals.detailsRequests +
            this.totals.contactsRequests +
            this.totals.sourcesRequests;

        const enrichmentMs =
            (this.functions.fetchPropertyDetails?.totalMs || 0) +
            (this.functions.fetchPropertyContacts?.totalMs || 0) +
            (this.functions.fetchPropertySources?.totalMs || 0);

        const bottlenecks = [
            {
                name: 'Per-property enrichment (details+contacts+sources)',
                totalMs: enrichmentMs,
                pctOfRuntime: this._pct(enrichmentMs, totalRunMs),
                evidence: `${this.totals.detailsRequests + this.totals.contactsRequests + this.totals.sourcesRequests} enrichment API calls`,
                estimatedGainIfFixed: this.mode.searchOnly ? '0% (already search-only)' : '60-75% runtime reduction'
            },
            {
                name: 'Search pagination (makeRequest)',
                totalMs: this.functions.makeRequest?.totalMs || 0,
                pctOfRuntime: this._pct(this.functions.makeRequest?.totalMs || 0, totalRunMs),
                evidence: `${this.totals.searchRequests} search requests, ${this.totals.pagesScanned} pages`,
                estimatedGainIfFixed: '15-25% with fewer zero-new pages'
            },
            {
                name: 'Rate limit waits (429 + sleep)',
                totalMs: this.totals.throttleWaitMs + this.totals.sleepMs,
                pctOfRuntime: this._pct(this.totals.throttleWaitMs + this.totals.sleepMs, totalRunMs),
                evidence: `${this.totals.rateLimit429} rate-limit events, ${this.totals.retries} retries`,
                estimatedGainIfFixed: '10-20% with lower call volume'
            },
            {
                name: 'MongoDB duplicate checks',
                totalMs: this.functions.mongoQuery?.totalMs || 0,
                pctOfRuntime: this._pct(this.functions.mongoQuery?.totalMs || 0, totalRunMs),
                evidence: `${this.totals.mongoQueries} queries, ${this.totals.duplicatesDb} DB duplicates`,
                estimatedGainIfFixed: '5-10% with batch $in queries'
            },
            {
                name: 'saveProperties (overall)',
                totalMs: this.functions.saveProperties?.totalMs || 0,
                pctOfRuntime: this._pct(this.functions.saveProperties?.totalMs || 0, totalRunMs),
                evidence: `${this.totals.propertiesSaved} saved, ${this.totals.propertiesSkipped} skipped`,
                estimatedGainIfFixed: 'Depends on enrichment split'
            }
        ].sort((a, b) => b.totalMs - a.totalMs);

        return {
            meta: {
                runId: this.runId,
                generatedAt: new Date().toISOString(),
                totalRunMs,
                totalRunMinutes: Math.round(totalRunMs / 60000 * 10) / 10,
                mode: this.mode
            },
            totals: {
                ...this.totals,
                totalApiCalls,
                locationsProcessed: locationRows.length
            },
            averages: {
                msPerProperty:
                    this.totals.propertiesProcessed
                        ? Math.round(totalRunMs / this.totals.propertiesProcessed)
                        : 0,
                msPerLocation: locationRows.length
                    ? Math.round(totalRunMs / locationRows.length)
                    : 0,
                msPerSearchRequest: this.totals.searchRequests
                    ? Math.round((this.functions.makeRequest?.totalMs || 0) / this.totals.searchRequests)
                    : 0,
                msPerMongoQuery: this.totals.mongoQueries
                    ? Math.round((this.functions.mongoQuery?.totalMs || 0) / this.totals.mongoQueries)
                    : 0
            },
            functionTimingTable: functionTable,
            bottleneckRanking: bottlenecks,
            locations: {
                all: locationRows,
                top20ByTime: sortByTime.slice(0, 20),
                top20ByApiRequests: sortByApi.slice(0, 20),
                top20ByProperties: sortByProps.slice(0, 20),
                zeroNewProperties: locationRows.filter(
                    (l) => l.propertiesSaved === 0 && l.propertiesDiscovered === 0
                ),
                lowValue: locationRows.filter((l) => l.valueScore === 'low')
            },
            searchOnlyComparison: {
                currentModeApiCalls: totalApiCalls,
                estimatedSearchOnlyApiCalls: this.totals.searchRequests,
                enrichmentCallsAvoided:
                    this.totals.detailsRequests +
                    this.totals.contactsRequests +
                    this.totals.sourcesRequests,
                estimatedRuntimeReductionFactor: this.mode.searchOnly
                    ? 1
                    : totalApiCalls > 0
                      ? Math.round((totalApiCalls / Math.max(this.totals.searchRequests, 1)) * 10) / 10
                      : null
            },
            operationSample: this.operations.slice(-100)
        };
    }

    finalize(exportDir) {
        if (!this.enabled) return null;

        const report = this.buildReport();
        const dir = exportDir || process.env.EXPORT_DIRECTORY || path.join(process.cwd(), 'exports');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const jsonPath = path.join(dir, `perf-report-${this.runId}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

        const mdPath = path.join(dir, `perf-report-${this.runId}.md`);
        fs.writeFileSync(mdPath, this._toMarkdown(report), 'utf8');

        return { jsonPath, mdPath, report };
    }

    _toMarkdown(report) {
        const lines = [
            '# Scraper Performance Report',
            '',
            `**Run ID:** ${report.meta.runId}`,
            `**Total runtime:** ${report.meta.totalRunMinutes} min (${report.meta.totalRunMs} ms)`,
            `**SEARCH_ONLY:** ${report.meta.mode.searchOnly}`,
            '',
            '## Totals',
            '',
            '| Metric | Value |',
            '|--------|-------|'
        ];

        for (const [k, v] of Object.entries(report.totals)) {
            lines.push(`| ${k} | ${v} |`);
        }

        lines.push('', '## Function timing', '', '| Function | Calls | Total ms | Avg ms | % runtime | 429 | Retries |', '|----------|-------|----------|--------|-----------|-----|---------|');

        for (const f of report.functionTimingTable) {
            lines.push(
                `| ${f.function} | ${f.callCount} | ${f.totalMs} | ${f.avgMs} | ${f.pctOfRuntime}% | ${f.rateLimit429} | ${f.retries} |`
            );
        }

        lines.push('', '## Bottleneck ranking', '');
        for (const b of report.bottleneckRanking) {
            lines.push(`### ${b.name}`);
            lines.push(`- Time: ${b.totalMs}ms (${b.pctOfRuntime}%)`);
            lines.push(`- Evidence: ${b.evidence}`);
            lines.push(`- Est. gain if fixed: ${b.estimatedGainIfFixed}`);
            lines.push('');
        }

        return lines.join('\n');
    }
}

module.exports = PerformanceTracker;

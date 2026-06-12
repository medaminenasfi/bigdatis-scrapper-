/**
 * Extract source-only listing dates (never scrape time or DB timestamps).
 */

const MIN_VALID_MS = Date.UTC(2000, 0, 1);

function normalizeText(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function toIso(date) {
    if (!date || Number.isNaN(date.getTime())) return null;
    if (date.getTime() < MIN_VALID_MS) return null;
    if (date.getTime() > Date.now() + 86400000) return null;
    return date.toISOString();
}

function parseNumericTimestamp(value) {
    if (value == null) return null;
    const n = typeof value === 'string' ? parseInt(value, 10) : value;
    if (!Number.isFinite(n)) return null;
    const ms = n < 1e12 ? n * 1000 : n;
    return toIso(new Date(ms));
}

function parseRelativeDate(text, referenceDate = new Date()) {
    const t = normalizeText(text);
    const ref = new Date(referenceDate);

    if (/aujourd'?hui|today/.test(t)) return toIso(ref);
    if (/hier|yesterday/.test(t)) {
        ref.setDate(ref.getDate() - 1);
        return toIso(ref);
    }

    const m = t.match(/(\d+)\s*(minute|min|hour|heure|jour|day|semaine|week|mois|month)/);
    if (!m) return null;

    const n = parseInt(m[1], 10);
    const unit = m[2];
    if (/minute|min/.test(unit)) ref.setMinutes(ref.getMinutes() - n);
    else if (/hour|heure/.test(unit)) ref.setHours(ref.getHours() - n);
    else if (/jour|day/.test(unit)) ref.setDate(ref.getDate() - n);
    else if (/semaine|week/.test(unit)) ref.setDate(ref.getDate() - n * 7);
    else if (/mois|month/.test(unit)) ref.setMonth(ref.getMonth() - n);

    return toIso(ref);
}

function extractFromJsonLd($) {
    if (!$) return null;
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
        try {
            const data = JSON.parse($(scripts[i]).html() || '{}');
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
                const published = item.datePosted || item.datePublished;
                const updated = item.dateModified;
                if (published || updated) {
                    return {
                        firstPublishedAt: published ? toIso(new Date(published)) : null,
                        lastUpdatedAt: updated ? toIso(new Date(updated)) : null,
                        sourceType: 'json_ld',
                        publishedRaw: published || null,
                        updatedRaw: updated || null,
                    };
                }
            }
        } catch (_) {}
    }
    return null;
}

/**
 * BigDatis API / generic API object priority.
 */
function extractFromApiPayload(payload = {}) {
    const pub = payload.publication || {};
    const firstCandidates = [
        payload.firstSeenAt,
        pub.firstSeenAt,
        payload.createdAt,
        pub.createdAt,
        payload.datePublished,
        pub.publishedAt,
        payload.publishedAt,
    ];
    const updateCandidates = [
        payload.modifiedAt,
        pub.modifiedAt,
        payload.timestamp,
        pub.timestamp,
        payload.priceDroppedAt,
        pub.priceDroppedAt,
        payload.updatedAt,
        pub.updatedAt,
    ];

    let firstPublishedAt = null;
    let lastUpdatedAt = null;
    let publishedRaw = null;
    let updatedRaw = null;

    for (const raw of firstCandidates) {
        if (raw == null) continue;
        publishedRaw = raw;
        firstPublishedAt = parseNumericTimestamp(raw) || toIso(new Date(raw));
        if (firstPublishedAt) break;
    }

    for (const raw of updateCandidates) {
        if (raw == null) continue;
        updatedRaw = raw;
        lastUpdatedAt = parseNumericTimestamp(raw) || toIso(new Date(raw));
        if (lastUpdatedAt) break;
    }

    return {
        firstPublishedAt,
        lastUpdatedAt,
        sourceType: 'api',
        publishedRaw,
        updatedRaw,
    };
}

/**
 * Main entry — returns strict output shape.
 */
function extractSourceDates(input = {}, options = {}) {
    const referenceScrapeTime = options.referenceScrapeTime || new Date();

    let result = extractFromApiPayload(input);
    if (!result.firstPublishedAt && !result.lastUpdatedAt && input.html && input.$) {
        const fromLd = extractFromJsonLd(input.$);
        if (fromLd) result = { ...result, ...fromLd };
    }

    if (!result.firstPublishedAt && input.relativePublishedText) {
        result.firstPublishedAt = parseRelativeDate(input.relativePublishedText, referenceScrapeTime);
        result.publishedRaw = input.relativePublishedText;
        result.sourceType = result.sourceType || 'html_relative';
    }

    const scrapeIso = referenceScrapeTime.toISOString();
    const nearScrape = (iso) =>
        iso && Math.abs(new Date(iso).getTime() - referenceScrapeTime.getTime()) < 5 * 60 * 1000;

    if (nearScrape(result.firstPublishedAt)) result.firstPublishedAt = null;
    if (nearScrape(result.lastUpdatedAt)) result.lastUpdatedAt = null;

    return {
        first_published_at: result.firstPublishedAt || null,
        last_updated_at: result.lastUpdatedAt || null,
        raw_date_debug: {
            published_raw: result.publishedRaw ?? null,
            updated_raw: result.updatedRaw ?? null,
            source_type: result.sourceType || 'unknown',
            reference_scrape_time: scrapeIso,
        },
    };
}

module.exports = {
    extractSourceDates,
    parseNumericTimestamp,
    parseRelativeDate,
    toIso,
};

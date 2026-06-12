#!/usr/bin/env node
/**
 * Scrape 1 location × 1 page and print one listing with source dates.
 */
require('dotenv').config();
const { connectMongoDB, disconnectMongoDB } = require('../config/database');
const BigdatisScraper = require('../scraper/BigdatisScraper');
const Property = require('../models/Property');

async function main() {
    process.env.MAX_LOCATIONS_PER_RUN = '1';
    process.env.MAX_PAGES_PER_RUN = '1';

    console.log('▶ Verification scrape: 1 location, 1 page, full enrichment\n');

    await connectMongoDB();
    const before = new Date();

    const scraper = new BigdatisScraper({
        enableDuplicatesCheck: process.env.ENABLE_DUPLICATES_CHECK !== 'false',
        searchOnly: process.env.SEARCH_ONLY === 'true',
    });

    const result = await scraper.scrapeAllProperties(1);
    console.log('\nRun stats:', {
        saved: result.stats.totalSaved,
        updated: result.stats.totalUpdated,
        skipped: result.stats.totalSkipped,
        scraped: result.stats.totalScraped,
        errors: result.stats.errors,
    });

    let prop = await Property.findOne({
        'scrapingMeta.scrapedAt': { $gte: before },
    }).sort({ 'scrapingMeta.scrapedAt': -1 }).lean();

    if (!prop) {
        prop = await Property.findOne().sort({ 'scrapingMeta.scrapedAt': -1 }).lean();
        console.log('\n(No new save this run — showing most recently touched listing)\n');
    }

    if (!prop) {
        console.log('No properties in database.');
        await disconnectMongoDB();
        process.exit(1);
    }

    const pub = prop.publication || {};
    const meta = prop.scrapingMeta || {};

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('LISTING VERIFICATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ID:', prop.bigdatisId);
    console.log('Title:', prop.title);
    console.log('Price:', prop.price?.amount, prop.price?.currency);
    console.log('Location:', [prop.location?.city, prop.location?.region].filter(Boolean).join(', '));
    console.log('Images:', (prop.images || []).length);
    console.log('');
    console.log('SOURCE DATES (for UI):');
    console.log('  publishedAt:', pub.publishedAt ? new Date(pub.publishedAt).toISOString() : null);
    console.log('  updatedAt:  ', pub.updatedAt ? new Date(pub.updatedAt).toISOString() : null);
    console.log('  firstSeenAt:', pub.firstSeenAt ?? null);
    console.log('  modifiedAt:', pub.modifiedAt ?? null);
    console.log('');
    console.log('INTERNAL ONLY (not for UI):');
    console.log('  scrapedAt:', meta.scrapedAt ? new Date(meta.scrapedAt).toISOString() : null);
    console.log('');
    console.log('DATE PROVENANCE:', JSON.stringify(pub.dateProvenance || null, null, 2));

    await disconnectMongoDB();
    process.exit(0);
}

main().catch(async (err) => {
    console.error(err);
    try { await disconnectMongoDB(); } catch (_) {}
    process.exit(1);
});

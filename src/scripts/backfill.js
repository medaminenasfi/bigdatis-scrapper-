require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const BigdatisScraper = require('../scraper/BigdatisScraper');
const logger = require('../config/logger');

const PROGRESS_FILE = path.join(__dirname, '../../backfill-progress.json');

async function main() {
    console.log(`\n======================================================`);
    console.log(`🚀 BIGDATIS HISTORICAL BACKFILL SCRIPT`);
    console.log(`======================================================\n`);

    const args = process.argv.slice(2);
    const specificLocation = args.includes('--location') ? parseInt(args[args.indexOf('--location') + 1]) : null;
    const isDryRun = args.includes('--dry-run');
    const resume = args.includes('--resume');

    // 1. Configure the scraper for deep, slow scraping
    const scraperOptions = {
        searchOnly: true, // Crucial: avoid fetching details to save rate limits
        delay: parseInt(process.env.REQUEST_DELAY) || 2000, // Slower than normal
        maxRetries: 5,
        enableDuplicatesCheck: true
    };
    
    // Create custom scraper instance
    const scraper = new BigdatisScraper(scraperOptions);
    
    // Override max pages to go deep into history
    const MAX_PAGES = 2000;
    
    let targetLocations = specificLocation ? [specificLocation] : scraper.getTargetLocationIds();
    
    // Handle resume logic
    let progress = { completedLocations: [] };
    if (resume && fs.existsSync(PROGRESS_FILE)) {
        try {
            progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
            if (!specificLocation) {
                targetLocations = targetLocations.filter(id => !progress.completedLocations.includes(id));
                console.log(`\n⏭️  Resuming: Skipping ${progress.completedLocations.length} already completed locations.`);
                console.log(`📍 Remaining locations to scrape: ${targetLocations.length}\n`);
            }
        } catch (e) {
            console.error(`❌ Could not read progress file: ${e.message}`);
        }
    }

    if (targetLocations.length === 0) {
        console.log(`✅ All locations have been backfilled according to the progress file.`);
        return;
    }

    try {
        if (!isDryRun) {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log(`✅ Connected to MongoDB.`);
        } else {
            console.log(`⚠️  DRY RUN MODE: No data will be saved to MongoDB.`);
        }

        let totalSaved = 0;

        for (const locationId of targetLocations) {
            console.log(`\n======================================================`);
            console.log(`📍 Backfilling Location ID: ${locationId}`);
            console.log(`======================================================`);

            scraper.currentLocationIndex = scraper.targetLocationIds.indexOf(locationId);
            if (scraper.currentLocationIndex === -1) {
                // If it's a specific location not in the main list, set it manually
                scraper.targetLocationIds = [locationId];
                scraper.currentLocationIndex = 0;
            }

            if (isDryRun) {
                console.log(`Dry run: skipping actual scrape call for location ${locationId}.`);
                // Simulate saving progress
                if (!progress.completedLocations.includes(locationId)) {
                    progress.completedLocations.push(locationId);
                }
                continue;
            }

            try {
                // We use the internal scraper method for a single location
                const result = await scraper.scrapeLocationProperties(locationId, MAX_PAGES);
                
                console.log(`\n✅ Completed Location ${locationId}:`);
                console.log(`   Scraped: ${result.stats.scraped}`);
                console.log(`   Saved:   ${result.stats.saved}`);
                console.log(`   Updated: ${result.stats.updated}`);
                console.log(`   Skipped: ${result.stats.skipped}`);
                
                totalSaved += result.stats.saved || 0;

                // Save progress
                if (!progress.completedLocations.includes(locationId)) {
                    progress.completedLocations.push(locationId);
                    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
                    console.log(`💾 Progress saved.`);
                }

            } catch (err) {
                console.error(`❌ Error scraping location ${locationId}:`, err.message);
                console.log(`⚠️ Will pause for 30s before trying next location...`);
                await new Promise(r => setTimeout(r, 30000));
            }
            
            // Rest between locations
            console.log(`💤 Resting 5 seconds before next location...`);
            await new Promise(r => setTimeout(r, 5000));
        }

        console.log(`\n======================================================`);
        console.log(`🎉 BACKFILL COMPLETE! Total new properties saved: ${totalSaved}`);
        console.log(`======================================================\n`);

    } catch (error) {
        console.error(`\n❌ Fatal Error:`, error);
    } finally {
        if (!isDryRun) {
            await mongoose.disconnect();
            console.log(`🔌 Disconnected from DB.`);
        }
    }
}

main();

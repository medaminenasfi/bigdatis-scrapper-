require('dotenv').config();

const logger = require('./config/logger');
const { connectMongoDB, disconnectMongoDB } = require('./config/database');
const BigdatisScraper = require('./scraper/BigdatisScraper');
const Property = require('./models/Property');
const fs = require('fs').promises;
const path = require('path');

class ScrapingManager {
    constructor() {
        this.scraper = new BigdatisScraper({
            delay: parseInt(process.env.REQUEST_DELAY) || 1000,
            maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
            batchSize: parseInt(process.env.BATCH_SIZE) || 50,
            enableDuplicatesCheck: process.env.ENABLE_DUPLICATES_CHECK === 'true'
        });
    }

    async initialize() {
        try {
            logger.info('Initializing Bigdatis Scraper...');
            await connectMongoDB();
            logger.info('Initialization completed successfully');
        } catch (error) {
            logger.error('Initialization failed:', error);
            throw error;
        }
    }

    async runScraping(options = {}) {
        const {
            maxPages = parseInt(process.env.MAX_PAGES_PER_RUN) || null,
            exportFiles = true
        } = options;

        try {
            logger.info('Starting scraping session', { maxPages, exportFiles });
            
            // Run the scraper
            const result = await this.scraper.scrapeAllProperties(maxPages);
            
            // Export files if requested
            if (exportFiles && result.properties.length > 0) {
                await this.exportData(result.properties);
            }

            logger.info('Scraping session completed successfully', result.stats);
            return result.stats;

        } catch (error) {
            logger.error('Scraping session failed:', error);
            throw error;
        }
    }

    async exportData(properties) {
        if (!properties || properties.length === 0) {
            logger.warn('No properties to export');
            return;
        }

        try {
            const exportDir = path.join(process.cwd(), process.env.EXPORT_DIRECTORY || 'exports');
            
            // Ensure export directory exists
            await fs.mkdir(exportDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            
            // Export to JSON if enabled
            if (process.env.EXPORT_JSON === 'true') {
                const jsonFile = path.join(exportDir, `bigdatis_properties_${timestamp}.json`);
                await fs.writeFile(jsonFile, JSON.stringify(properties, null, 2), 'utf8');
                logger.info(`Exported ${properties.length} properties to JSON: ${jsonFile}`);
            }

            // Export to CSV if enabled
            if (process.env.EXPORT_CSV === 'true') {
                const csvFile = path.join(exportDir, `bigdatis_properties_${timestamp}.csv`);
                await this.exportToCsv(properties, csvFile);
                logger.info(`Exported ${properties.length} properties to CSV: ${csvFile}`);
            }

        } catch (error) {
            logger.error('Error exporting data:', error);
            throw error;
        }
    }

    async exportToCsv(properties, filename) {
        // Get all unique keys from all properties
        const allKeys = new Set();
        properties.forEach(prop => {
            if (typeof prop === 'object' && prop !== null) {
                Object.keys(prop).forEach(key => allKeys.add(key));
            }
        });

        const sortedKeys = Array.from(allKeys).sort();

        // Create CSV content
        let csvContent = sortedKeys.join(',') + '\n';

        properties.forEach(prop => {
            if (typeof prop === 'object' && prop !== null) {
                const row = sortedKeys.map(key => {
                    const value = prop[key];
                    if (value === null || value === undefined) {
                        return '';
                    } else if (typeof value === 'object') {
                        return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                    } else {
                        return `"${String(value).replace(/"/g, '""')}"`;
                    }
                }).join(',');
                csvContent += row + '\n';
            }
        });

        await fs.writeFile(filename, csvContent, 'utf8');
    }

    async getScrapingStatistics() {
        try {
            const totalProperties = await Property.countDocuments();
            const activeProperties = await Property.countDocuments({ 'publication.status': 'active' });
            
            return {
                totalProperties,
                activeProperties,
                timestamp: new Date()
            };
        } catch (error) {
            logger.error('Error getting statistics:', error);
            throw error;
        }
    }

    async cleanupOldData(daysOld = 30) {
        try {
            logger.info(`Starting cleanup of data older than ${daysOld} days`);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            
            const result = await Property.deleteMany({
                'publication.status': { $in: ['expired', 'removed'] },
                'scrapingMeta.scrapedAt': { $lt: cutoffDate }
            });
            
            logger.info(`Cleanup completed. Deleted ${result.deletedCount} old properties`);
            return result.deletedCount;
        } catch (error) {
            logger.error('Error during cleanup:', error);
            throw error;
        }
    }

    async shutdown() {
        try {
            logger.info('Shutting down scraping manager...');
            await disconnectMongoDB();
            logger.info('Shutdown completed');
        } catch (error) {
            logger.error('Error during shutdown:', error);
            throw error;
        }
    }
}

// Main execution function
async function main() {
    const manager = new ScrapingManager();

    try {
        // Initialize the system
        await manager.initialize();

        // Parse command line arguments
        const args = process.argv.slice(2);
        const command = args[0] || 'scrape';

        switch (command) {
            case 'scrape':
                const maxPages = args[1] ? parseInt(args[1]) : null;
                await manager.runScraping({ maxPages });
                break;

            case 'stats':
                const stats = await manager.getScrapingStatistics();
                console.log(JSON.stringify(stats, null, 2));
                break;

            case 'cleanup':
                const daysOld = args[1] ? parseInt(args[1]) : 30;
                await manager.cleanupOldData(daysOld);
                break;

            case 'test':
                // Test run with limited pages
                await manager.runScraping({ maxPages: 2, exportFiles: false });
                break;

            default:
                logger.info('Available commands:');
                logger.info('  scrape [maxPages] - Run full scraping (optional: limit pages)');
                logger.info('  test              - Test run with 2 pages');
                logger.info('  stats             - Show database and scraping statistics');
                logger.info('  cleanup [days]    - Clean up old data (default: 30 days)');
                break;
        }

    } catch (error) {
        logger.error('Application error:', error);
        process.exit(1);
    } finally {
        await manager.shutdown();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run main function if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = ScrapingManager;
const cron = require('node-cron');
const BigdatisScraper = require('../scraper/BigdatisScraper');
const logger = require('../config/logger');
const fs = require('fs').promises;
const path = require('path');

class ScrapingScheduler {
    constructor(options = {}) {
        this.scraper = new BigdatisScraper({
            enableDuplicatesCheck: options.enableDuplicatesCheck ?? true,
            delay: options.delay || parseInt(process.env.REQUEST_DELAY) || 1000,
            maxRetries: options.maxRetries || parseInt(process.env.MAX_RETRIES) || 3
        });
        
        this.isRunning = false;
        this.lastRunTime = null;
        this.nextRunTime = null;
        this.totalRuns = 0;
        this.successfulRuns = 0;
        this.failedRuns = 0;
        
        // Use your existing .env configuration
        this.cronPattern = process.env.SCRAPE_SCHEDULE || '0 7 * * *'; // Daily at 07:00
        this.maxPagesPerRun = parseInt(process.env.MAX_PAGES_PER_RUN) || null;
        
        // Status file to track runs
        this.statusFile = path.join(process.cwd(), 'scraping-status.json');
        
        this.initializeStatus();
    }
    
    async initializeStatus() {
        try {
            const status = await this.loadStatus();
            this.totalRuns = status.totalRuns || 0;
            this.successfulRuns = status.successfulRuns || 0;
            this.failedRuns = status.failedRuns || 0;
            this.lastRunTime = status.lastRunTime ? new Date(status.lastRunTime) : null;
        } catch (error) {
            logger.warn('Could not load previous status, starting fresh');
        }
    }
    
    async loadStatus() {
        try {
            const data = await fs.readFile(this.statusFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }
    
    async saveStatus() {
        const status = {
            totalRuns: this.totalRuns,
            successfulRuns: this.successfulRuns,
            failedRuns: this.failedRuns,
            lastRunTime: this.lastRunTime,
            nextRunTime: this.nextRunTime,
            isRunning: this.isRunning,
            lastUpdate: new Date(),
            configuration: {
                cronPattern: this.cronPattern,
                maxPagesPerRun: this.maxPagesPerRun,
                enableDuplicatesCheck: this.scraper.enableDuplicatesCheck,
                requestDelay: this.scraper.delay
            }
        };
        
        try {
            await fs.writeFile(this.statusFile, JSON.stringify(status, null, 2));
        } catch (error) {
            logger.warn(`Could not save status: ${error.message}`);
        }
    }
    
    async runScraping() {
        if (this.isRunning) {
            logger.info('⏭️ Scraper skipped (already running)');
            return;
        }
        
        this.isRunning = true;
        this.lastRunTime = new Date();
        this.totalRuns++;
        
        logger.info('🚀 Scraper started');
        logger.info(`⏰ Started at: ${this.lastRunTime.toLocaleString()}`);
        
        try {
            // Reset scraper stats
            this.scraper.resetStats();
            
            // Run the scraping
            const result = await this.scraper.scrapeAllProperties(this.maxPagesPerRun);
            
            // Log results
            const duration = Math.round((new Date() - this.lastRunTime) / 1000);
            logger.info('✅ Scraper finished');
            logger.info('✅ Scheduled scraping completed successfully', {
                runNumber: this.totalRuns,
                duration: `${duration}s`,
                propertiesScraped: result.stats.totalScraped,
                propertiesSaved: result.stats.totalSaved,
                propertiesUpdated: result.stats.totalUpdated,
                propertiesSkipped: result.stats.totalSkipped,
                errors: result.stats.errors,
                uniquePropertiesInSession: result.uniquePropertiesInSession
            });
            
            this.successfulRuns++;
            
            // Optional: Export data if configured
            if (process.env.EXPORT_CSV === 'true' || process.env.EXPORT_JSON === 'true') {
                await this.exportResults(result.properties);
            }
            
        } catch (error) {
            logger.error(`❌ Scheduled scraping run #${this.totalRuns} failed`, error);
            this.failedRuns++;
        } finally {
            this.isRunning = false;
            await this.saveStatus();
        }
    }
    
    async exportResults(properties) {
        if (!properties || properties.length === 0) return;
        
        const exportDir = process.env.EXPORT_DIRECTORY || 'exports';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        try {
            // Ensure export directory exists
            await fs.mkdir(exportDir, { recursive: true });
            
            if (process.env.EXPORT_JSON === 'true') {
                const jsonFile = path.join(exportDir, `scraping-${timestamp}.json`);
                await fs.writeFile(jsonFile, JSON.stringify(properties, null, 2));
                logger.info(`📄 Exported ${properties.length} properties to ${jsonFile}`);
            }
            
            if (process.env.EXPORT_CSV === 'true') {
                const csvFile = path.join(exportDir, `scraping-${timestamp}.csv`);
                const csvContent = this.convertToCSV(properties);
                await fs.writeFile(csvFile, csvContent);
                logger.info(`📊 Exported ${properties.length} properties to ${csvFile}`);
            }
            
        } catch (error) {
            logger.warn(`Failed to export results: ${error.message}`);
        }
    }
    
    convertToCSV(properties) {
        if (!properties || properties.length === 0) return '';
        
        const headers = ['id', 'title', 'price', 'area', 'propertyType', 'transactionType', 'timestamp'];
        const rows = properties.map(prop => [
            prop.id || '',
            (prop.title || '').replace(/,/g, ';'),
            prop.price || '',
            prop.area || '',
            prop.properties?.propertyType || '',
            prop.properties?.transactionType || '',
            prop.timestamp || ''
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    start() {
        logger.info(`🕐 Starting scraping scheduler with pattern: ${this.cronPattern}`);
        
        // Convert your existing SCRAPE_SCHEDULE or use default
        let cronPattern = this.cronPattern;
        
        // If using the default daily schedule
        if (cronPattern === '0 7 * * *') {
            logger.info(`📅 Scheduled to run daily at 07:00 (Africa/Tunis)`);
        } else if (cronPattern === '0 */6 * * *') {
            logger.info(`📅 Scheduled to run every 6 hours`);
        } else if (cronPattern === '*/30 * * * *') {
            logger.info(`📅 Scheduled to run every 30 minutes`);
        } else {
            logger.info(`📅 Custom schedule: ${cronPattern}`);
        }
        
        // Validate cron pattern
        if (!cron.validate(cronPattern)) {
            throw new Error(`Invalid cron pattern: ${cronPattern}`);
        }
        
        // Schedule the task
        this.task = cron.schedule(cronPattern, async () => {
            await this.runScraping();
        }, {
            scheduled: false,
            timezone: "Africa/Tunis"
        });
        
        // Start the scheduled task
        this.task.start();
        
        logger.info(`✅ Scheduler started successfully`);
        this.updateNextRunTime();
        logger.info(`⏰ Next run scheduled for: ${this.nextRunTime?.toLocaleString()}`);
        
        return this;
    }
    
    stop() {
        if (this.task) {
            this.task.stop();
            logger.info('🛑 Scheduler stopped');
        }
    }
    
    destroy() {
        this.stop();
        if (this.task) {
            this.task.destroy();
        }
    }
    
    updateNextRunTime() {
        const now = new Date();
        
        if (this.cronPattern === '0 7 * * *') {
            // Daily at 07:00
            const nextRun = new Date(now);
            nextRun.setHours(7, 0, 0, 0);
            
            // If today's 07:00 has passed, schedule for tomorrow
            if (nextRun <= now) {
                nextRun.setDate(nextRun.getDate() + 1);
            }
            
            this.nextRunTime = nextRun;
            
        } else if (this.cronPattern === '*/30 * * * *') {
            // Every 30 minutes
            const minutes = now.getMinutes();
            const nextMinutes = minutes < 30 ? 30 : 60;
            const nextRun = new Date(now);
            
            if (nextMinutes === 60) {
                nextRun.setHours(nextRun.getHours() + 1);
                nextRun.setMinutes(0);
            } else {
                nextRun.setMinutes(nextMinutes);
            }
            
            nextRun.setSeconds(0);
            nextRun.setMilliseconds(0);
            this.nextRunTime = nextRun;
            
        } else if (this.cronPattern === '0 */6 * * *') {
            // Every 6 hours
            const hours = now.getHours();
            const nextHour = Math.ceil((hours + 1) / 6) * 6;
            const nextRun = new Date(now);
            
            if (nextHour >= 24) {
                nextRun.setDate(nextRun.getDate() + 1);
                nextRun.setHours(0);
            } else {
                nextRun.setHours(nextHour);
            }
            
            nextRun.setMinutes(0);
            nextRun.setSeconds(0);
            nextRun.setMilliseconds(0);
            this.nextRunTime = nextRun;
        }
    }
    
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastRunTime: this.lastRunTime,
            nextRunTime: this.nextRunTime,
            totalRuns: this.totalRuns,
            successfulRuns: this.successfulRuns,
            failedRuns: this.failedRuns,
            successRate: this.totalRuns > 0 ? ((this.successfulRuns / this.totalRuns) * 100).toFixed(1) + '%' : '0%',
            cronPattern: this.cronPattern,
            configuration: {
                maxPagesPerRun: this.maxPagesPerRun,
                enableDuplicatesCheck: this.scraper.enableDuplicatesCheck,
                requestDelay: this.scraper.delay,
                exportCSV: process.env.EXPORT_CSV === 'true',
                exportJSON: process.env.EXPORT_JSON === 'true'
            }
        };
    }
    
    async triggerManualRun() {
        logger.info('🔧 Manual scraping run triggered');
        await this.runScraping();
    }
}

module.exports = ScrapingScheduler;
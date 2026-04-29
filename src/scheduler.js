#!/usr/bin/env node

require('dotenv').config();
const ScrapingScheduler = require('./services/scheduler');
const logger = require('./config/logger');

// Handle command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'start';

async function main() {
    try {
        // Initialize database connection
        const { connectMongoDB } = require('./config/database');
        await connectMongoDB();
        
        // Create logs directory if it doesn't exist
        const fs = require('fs');
        const logsDir = 'logs';
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // Create exports directory if export is enabled
        if (process.env.EXPORT_CSV === 'true' || process.env.EXPORT_JSON === 'true') {
            const exportDir = process.env.EXPORT_DIRECTORY || 'exports';
            if (!fs.existsSync(exportDir)) {
                fs.mkdirSync(exportDir, { recursive: true });
            }
        }
        
        const scheduler = new ScrapingScheduler({
            enableDuplicatesCheck: process.env.ENABLE_DUPLICATES_CHECK !== 'false',
            delay: parseInt(process.env.REQUEST_DELAY) || 1000,
            maxRetries: parseInt(process.env.MAX_RETRIES) || 3
        });
        
        switch (command) {
            case 'start':
                console.log('🚀 Starting Bigdatis Property Scraper Scheduler...\n');
                
                // Show configuration
                console.log('📋 Current Configuration:');
                console.log(`   Database: ${process.env.MONGODB_URI}`);
                console.log(`   Schedule: ${process.env.SCRAPE_SCHEDULE || '*/30 * * * *'}`);
                console.log(`   Max Pages Per Run: ${process.env.MAX_PAGES_PER_RUN || 'Unlimited'}`);
                console.log(`   Duplicate Check: ${process.env.ENABLE_DUPLICATES_CHECK !== 'false' ? 'Enabled' : 'Disabled'}`);
                console.log(`   Request Delay: ${process.env.REQUEST_DELAY || 1000}ms`);
                console.log(`   Max Retries: ${process.env.MAX_RETRIES || 3}`);
                console.log(`   Export CSV: ${process.env.EXPORT_CSV === 'true' ? 'Yes' : 'No'}`);
                console.log(`   Export JSON: ${process.env.EXPORT_JSON === 'true' ? 'Yes' : 'No'}`);
                console.log(`   Log Level: ${process.env.LOG_LEVEL || 'info'}`);
                console.log('');
                
                // Start the scheduler
                scheduler.start();
                
                // Show status every 10 minutes
                setInterval(() => {
                    const status = scheduler.getStatus();
                    logger.info('📊 Scheduler Status', status);
                }, 10 * 60 * 1000);
                
                // Handle graceful shutdown
                process.on('SIGINT', () => {
                    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
                    scheduler.destroy();
                    process.exit(0);
                });
                
                process.on('SIGTERM', () => {
                    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
                    scheduler.destroy();
                    process.exit(0);
                });
                
                console.log('✅ Scheduler is running! Press Ctrl+C to stop.');
                console.log('📊 Check the logs for scraping progress and results.');
                console.log(`📁 Logs location: ${process.env.LOG_FILE || 'logs/scraper.log'}\n`);
                
                break;
                
            case 'test':
                console.log('🧪 Running test scraping...\n');
                
                await scheduler.triggerManualRun();
                
                const status = scheduler.getStatus();
                console.log('\n📊 Test Results:');
                console.log(`   Success Rate: ${status.successRate}`);
                console.log(`   Last Run: ${status.lastRunTime?.toLocaleString() || 'Never'}`);
                console.log(`   Configuration: ${JSON.stringify(status.configuration, null, 2)}`);
                
                process.exit(0);
                break;
                
            case 'status':
                const currentStatus = scheduler.getStatus();
                console.log('📊 Current Scheduler Status:\n');
                console.log(`   Running: ${currentStatus.isRunning ? '✅ Yes' : '❌ No'}`);
                console.log(`   Total Runs: ${currentStatus.totalRuns}`);
                console.log(`   Successful: ${currentStatus.successfulRuns}`);
                console.log(`   Failed: ${currentStatus.failedRuns}`);
                console.log(`   Success Rate: ${currentStatus.successRate}`);
                console.log(`   Last Run: ${currentStatus.lastRunTime?.toLocaleString() || 'Never'}`);
                console.log(`   Next Run: ${currentStatus.nextRunTime?.toLocaleString() || 'Not scheduled'}`);
                console.log(`   Schedule: ${currentStatus.cronPattern}`);
                console.log('\n📋 Configuration:');
                console.log(`   Max Pages/Run: ${currentStatus.configuration.maxPagesPerRun || 'Unlimited'}`);
                console.log(`   Duplicate Check: ${currentStatus.configuration.enableDuplicatesCheck}`);
                console.log(`   Request Delay: ${currentStatus.configuration.requestDelay}ms`);
                console.log(`   Export CSV: ${currentStatus.configuration.exportCSV}`);
                console.log(`   Export JSON: ${currentStatus.configuration.exportJSON}`);
                
                process.exit(0);
                break;
                
            case 'help':
            default:
                console.log('🔧 Bigdatis Scraper Scheduler Commands:\n');
                console.log('  start    - Start the scheduler');
                console.log('  test     - Run a single scraping test');
                console.log('  status   - Show current scheduler status');
                console.log('  help     - Show this help message');
                console.log('\nExamples:');
                console.log('  node src/scheduler.js start');
                console.log('  node src/scheduler.js test');
                console.log('  node src/scheduler.js status');
                console.log('\nConfiguration:');
                console.log('  Edit your .env file to change schedule and settings');
                console.log(`  Current schedule: ${process.env.SCRAPE_SCHEDULE || '*/30 * * * *'}`);
                
                process.exit(0);
        }
        
    } catch (error) {
        logger.error('Failed to start scheduler:', error);
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

main();
#!/usr/bin/env node

require('dotenv').config();

const PropertyEnhancer = require('./src/scripts/enhance-properties');
const logger = require('./src/config/logger');
const path = require('path');

class EnhancementRunner {
    constructor() {
        this.enhancer = null;
    }

    async runEnhancement(options = {}) {
        try {
            console.log('🚀 Starting property enhancement...');
            console.log('📂 Using location mappings from: phase2-enhanced-final-results.json');
            
            // Initialize enhancer
            this.enhancer = new PropertyEnhancer({
                delay: options.delay || 2000,
                maxRetries: options.maxRetries || 3,
                batchSize: options.batchSize || 100,
                resumeFromId: options.resumeFromId
            });

            console.log('🔧 Initializing enhancer...');
            await this.enhancer.initialize();

            console.log('⚡ Running enhancement process...');
            // Run enhancement process
            await this.enhancer.enhanceAllProperties();

            console.log('📊 Getting final statistics...');
            const stats = await this.enhancer.getEnhancementStatistics();
            
            console.log('✅ Enhancement completed successfully!');
            return stats;

        } catch (error) {
            console.error('❌ Enhancement runner failed:', error.message);
            throw error;
        } finally {
            if (this.enhancer) {
                await this.enhancer.shutdown();
            }
        }
    }

    async showStatistics() {
        try {
            this.enhancer = new PropertyEnhancer();
            await this.enhancer.initialize();
            
            const stats = await this.enhancer.getEnhancementStatistics();
            
            console.log('\n📊 PROPERTY ENHANCEMENT STATISTICS');
            console.log('=' .repeat(50));
            console.log(`Original Properties: ${stats.originalProperties.toLocaleString()}`);
            console.log(`Enhanced Properties: ${stats.enhancedProperties.toLocaleString()}`);
            console.log(`Enhancement Rate: ${stats.enhancementRate}%`);
            
            if (stats.detailedStats.totalEnhanced) {
                console.log('\n📈 DETAILED STATISTICS:');
                console.log(`Average Price: ${Math.round(stats.detailedStats.avgPrice || 0).toLocaleString()} TND`);
                console.log(`Average Area: ${Math.round(stats.detailedStats.avgArea || 0)} m²`);
                console.log(`Average Price/m²: ${Math.round(stats.detailedStats.avgPricePerSqm || 0).toLocaleString()} TND`);
                console.log(`API Response Rate: ${Math.round((stats.detailedStats.apiResponseRate || 0) * 100)}%`);
                console.log(`Location Mapping Rate: ${Math.round((stats.detailedStats.locationMappingRate || 0) * 100)}%`);
                console.log(`Unique Locations: ${stats.detailedStats.uniqueLocationCount || 0}`);
            }
            
            console.log('\n🗺️  LOCATION MAPPER STATUS:');
            console.log(`Total Mappings Available: ${stats.locationMapperStats.totalMappings}`);
            console.log(`Success Rate: ${stats.locationMapperStats.overallSuccessRate}`);
            console.log(`Last Loaded: ${stats.locationMapperStats.lastLoadedAt || 'Never'}`);
            
            if (stats.processingStats.processed > 0) {
                console.log('\n⚡ LAST PROCESSING SESSION:');
                console.log(`Processed: ${stats.processingStats.processed.toLocaleString()}`);
                console.log(`Successful: ${stats.processingStats.successful.toLocaleString()}`);
                console.log(`Failed: ${stats.processingStats.failed.toLocaleString()}`);
                console.log(`API Calls: ${stats.processingStats.apiCalls.toLocaleString()}`);
                console.log(`Last Processed ID: ${stats.processingStats.lastProcessedId || 'None'}`);
            }
            
            return stats;
            
        } catch (error) {
            logger.error('Failed to get statistics:', error);
            throw error;
        } finally {
            if (this.enhancer) {
                await this.enhancer.shutdown();
            }
        }
    }

    async validateSetup() {
        try {
            logger.info('🔍 Validating enhancement setup...');
            
            // Check environment variables
            const requiredEnvVars = ['MONGODB_URI', 'ACCESS_TOKEN'];
            const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
            
            if (missingVars.length > 0) {
                throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
            }
            
            // Check if location mapping file exists
            const mappingFilePath = path.join(process.cwd(), 'phase2-enhanced-final-results.json');
            const fs = require('fs').promises;
            
            try {
                await fs.access(mappingFilePath);
                logger.info('✅ Location mapping file found');
            } catch (error) {
                throw new Error(`Location mapping file not found: ${mappingFilePath}`);
            }
            
            // Initialize enhancer to test connections
            this.enhancer = new PropertyEnhancer();
            await this.enhancer.initialize();
            
            // Test database connection
            const Property = require('./src/models/Property');
            const propertyCount = await Property.countDocuments();
            logger.info(`✅ Database connected - Found ${propertyCount.toLocaleString()} properties`);
            
            // Test location mapper
            const locationStats = this.enhancer.locationMapper.getStats();
            logger.info(`✅ Location mapper loaded - ${locationStats.totalMappings} mappings available`);
            
            // Test API connection with a sample call
            logger.info('🔌 Testing API connection...');
            const sampleProperty = await Property.findOne().lean();
            
            if (sampleProperty) {
                try {
                    await this.enhancer.getEnhancedPropertyData(sampleProperty.bigdatisId);
                    logger.info('✅ API connection successful');
                } catch (apiError) {
                    logger.warn('⚠️  API test failed:', apiError.message);
                }
            }
            
            logger.info('🎉 Setup validation completed successfully!');
            return true;
            
        } catch (error) {
            logger.error('❌ Setup validation failed:', error);
            throw error;
        } finally {
            if (this.enhancer) {
                await this.enhancer.shutdown();
            }
        }
    }

    async testRun() {
        try {
            console.log('🧪 Running enhancement test with 5 properties...');
            logger.info('🧪 Running enhancement test with 5 properties...');
            
            this.enhancer = new PropertyEnhancer({
                delay: 1000, // Faster for testing
                batchSize: 5
            });

            await this.enhancer.initialize();

            // Get first 5 properties for testing
            const Property = require('./src/models/Property');
            const testProperties = await Property.find().limit(5).lean();
            
            if (testProperties.length === 0) {
                console.log('⚠️ No properties found for testing');
                logger.warn('No properties found for testing');
                return;
            }
            
            console.log(`Testing with ${testProperties.length} properties`);
            logger.info(`Testing with ${testProperties.length} properties`);
            
            // Process test batch
            const results = await this.enhancer.processPropertiesBatch(testProperties);
            
            // Log results
            const testStats = results.reduce((acc, result) => {
                acc[result.status]++;
                return acc;
            }, { success: 0, failed: 0, skipped: 0 });
            
            console.log('🧪 Test completed:', testStats);
            logger.info('🧪 Test completed:', testStats);
            
            return testStats;
            
        } catch (error) {
            console.error('❌ Test run failed:', error.message);
            logger.error('Test run failed:', error);
            throw error;
        } finally {
            if (this.enhancer) {
                await this.enhancer.shutdown();
            }
        }
    }

    showHelp() {
        console.log(`
🚀 PROPERTY ENHANCEMENT RUNNER

USAGE:
  node run-enhancement.js <command> [options]

COMMANDS:
  enhance         Run the full enhancement process
  stats           Show enhancement statistics
  validate        Validate setup and connections
  test            Run a test with 5 properties
  help            Show this help message

OPTIONS:
  --delay <ms>           Delay between API calls (default: 2000)
  --batch-size <size>    Batch size for processing (default: 100)
  --max-retries <count>  Max retries for failed API calls (default: 3)
  --resume-from <id>     Resume from specific bigdatisId

EXAMPLES:
  node run-enhancement.js enhance
  node run-enhancement.js enhance --delay 3000 --batch-size 50
  node run-enhancement.js enhance --resume-from "803424"
  node run-enhancement.js stats
  node run-enhancement.js validate
  node run-enhancement.js test

ENVIRONMENT VARIABLES:
  MONGODB_URI     MongoDB connection string
  ACCESS_TOKEN    Bigdatis API access token
  REQUEST_DELAY   Default delay between requests (ms)
  MAX_RETRIES     Default max retries
        `);
    }
}

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    
    const options = {};
    
    for (let i = 1; i < args.length; i += 2) {
        const flag = args[i];
        const value = args[i + 1];
        
        switch (flag) {
            case '--delay':
                options.delay = parseInt(value);
                break;
            case '--batch-size':
                options.batchSize = parseInt(value);
                break;
            case '--max-retries':
                options.maxRetries = parseInt(value);
                break;
            case '--resume-from':
                options.resumeFromId = value;
                break;
        }
    }
    
    return { command, options };
}

// Main execution
async function main() {
    const { command, options } = parseArgs();
    const runner = new EnhancementRunner();
    
    try {
        switch (command) {
            case 'enhance':
                logger.info('🚀 Starting property enhancement...');
                const results = await runner.runEnhancement(options);
                logger.info('Enhancement completed successfully:', results);
                break;
                
            case 'stats':
                await runner.showStatistics();
                break;
                
            case 'validate':
                await runner.validateSetup();
                break;
                
            case 'test':
                await runner.testRun();
                break;
                
            case 'help':
            default:
                runner.showHelp();
                break;
        }
        
    } catch (error) {
        logger.error('Runner failed:', error);
        process.exit(1);
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

// Run if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = EnhancementRunner;
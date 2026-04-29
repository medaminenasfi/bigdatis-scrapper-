require('dotenv').config();

const axios = require('axios');
const { connectMongoDB, disconnectMongoDB } = require('../config/database');
const logger = require('../config/logger');
const Property = require('../models/Property');

class TimestampUpdater {
    constructor(options = {}) {
        this.apiBaseUrl = 'https://server.bigdatis.tn/api/properties/show/';
        this.delay = options.delay || parseInt(process.env.REQUEST_DELAY) || 2000;
        this.maxRetries = options.maxRetries || parseInt(process.env.MAX_RETRIES) || 3;
        this.batchSize = options.batchSize || 100;
        this.resumeFromId = options.resumeFromId || null;
        
        // Create axios instance
        this.client = axios.create({
            timeout: parseInt(process.env.TIMEOUT) || 30000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8'
            }
        });
        
        // Progress tracking
        this.stats = {
            totalProperties: 0,
            processed: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            apiCalls: 0,
            apiErrors: 0,
            startTime: null,
            endTime: null,
            lastProcessedId: null
        };
    }

    async initialize() {
        try {
            logger.info('Initializing Timestamp Updater...');
            await connectMongoDB();
            logger.info('Timestamp Updater initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Timestamp Updater:', error);
            throw error;
        }
    }

    async getEnhancedData(bigdatisId, retryCount = 0) {
        const url = `${this.apiBaseUrl}${bigdatisId}`;
        
        try {
            this.stats.apiCalls++;
            logger.debug(`API Request for property ${bigdatisId}`);
            
            const response = await this.client.get(url);
            
            if (response.data) {
                return response.data;
            } else {
                throw new Error('Empty response data');
            }
            
        } catch (error) {
            this.stats.apiErrors++;
            
            if (retryCount < this.maxRetries) {
                logger.warn(`API call failed for ${bigdatisId}, retrying (${retryCount + 1}/${this.maxRetries}):`, error.message);
                await this.sleep(this.delay * (retryCount + 1));
                return this.getEnhancedData(bigdatisId, retryCount + 1);
            }
            
            logger.error(`API call failed for ${bigdatisId} after ${this.maxRetries} retries:`, error.message);
            throw error;
        }
    }

    async updateProperty(property) {
        const bigdatisId = property.bigdatisId;
        
        try {
            // Check if already has timestamp fields
            if (property.publication && 
                property.publication.firstSeenAt && 
                property.publication.createdAt) {
                logger.debug(`Property ${bigdatisId} already has timestamps, skipping`);
                this.stats.skipped++;
                return { status: 'skipped', reason: 'already_has_timestamps' };
            }
            
            // Get enhanced data from API
            let enhancedData;
            try {
                enhancedData = await this.getEnhancedData(bigdatisId);
            } catch (apiError) {
                logger.error(`Failed to get enhanced data for ${bigdatisId}:`, apiError.message);
                this.stats.failed++;
                return { status: 'failed', reason: 'api_error', error: apiError.message };
            }
            
            // Update property with timestamp fields
            const updateData = {
                $set: {
                    'publication.firstSeenAt': enhancedData.firstSeenAt,
                    'publication.createdAt': enhancedData.createdAt,
                    'publication.modifiedAt': enhancedData.modifiedAt,
                    'publication.priceDroppedAt': enhancedData.priceDroppedAt,
                    'publication.timestamp': enhancedData.timestamp,
                    'publication.priceTimestamp': enhancedData.priceTimestamp
                }
            };
            
            await Property.updateOne({ bigdatisId }, updateData);
            
            this.stats.updated++;
            logger.debug(`Updated timestamps for property ${bigdatisId}`);
            
            return { status: 'success' };
            
        } catch (error) {
            logger.error(`Error updating property ${bigdatisId}:`, error);
            this.stats.failed++;
            return { status: 'failed', reason: 'processing_error', error: error.message };
        }
    }

    async processBatch(properties) {
        for (const property of properties) {
            try {
                const result = await this.updateProperty(property);
                
                this.stats.processed++;
                this.stats.lastProcessedId = property.bigdatisId;
                
                // Log progress every 50 properties
                if (this.stats.processed % 50 === 0) {
                    const progressPercent = Math.round((this.stats.processed / this.stats.totalProperties) * 100);
                    logger.info(`Progress: ${this.stats.processed}/${this.stats.totalProperties} (${progressPercent}%)`, {
                        updated: this.stats.updated,
                        skipped: this.stats.skipped,
                        failed: this.stats.failed,
                        apiErrors: this.stats.apiErrors
                    });
                }
                
                // Delay between API calls
                await this.sleep(this.delay);
                
            } catch (error) {
                logger.error(`Batch processing error for property ${property.bigdatisId}:`, error);
                this.stats.failed++;
                this.stats.processed++;
            }
        }
    }

    async updateAllProperties() {
        this.stats.startTime = new Date();
        
        try {
            logger.info('Starting timestamp update process...');
            
            // Build query
            const query = {};
            if (this.resumeFromId) {
                query.bigdatisId = { $gt: this.resumeFromId };
            }
            
            // Get total count
            this.stats.totalProperties = await Property.countDocuments(query);
            logger.info(`Found ${this.stats.totalProperties} properties to update`);
            
            if (this.stats.totalProperties === 0) {
                logger.info('No properties found to update');
                return;
            }
            
            // Process in batches
            let skip = 0;
            let hasMore = true;
            
            while (hasMore) {
                const properties = await Property.find(query)
                    .sort({ bigdatisId: 1 })
                    .skip(skip)
                    .limit(this.batchSize)
                    .lean();
                
                if (properties.length === 0) {
                    hasMore = false;
                    break;
                }
                
                logger.info(`Processing batch: ${skip + 1} to ${skip + properties.length}`);
                
                await this.processBatch(properties);
                
                skip += this.batchSize;
            }
            
        } catch (error) {
            logger.error('Fatal error during update process:', error);
            throw error;
        } finally {
            this.stats.endTime = new Date();
            this.logFinalResults();
        }
    }

    logFinalResults() {
        const duration = this.stats.endTime - this.stats.startTime;
        const successRate = this.stats.processed > 0 ? 
            Math.round((this.stats.updated / this.stats.processed) * 100) : 0;
        
        logger.info('\n🎉 TIMESTAMP UPDATE COMPLETED!');
        logger.info('=' .repeat(80));
        logger.info(`⏱️  Total duration: ${Math.round(duration / 1000 / 60)} minutes`);
        logger.info(`📊 Properties processed: ${this.stats.processed}/${this.stats.totalProperties}`);
        logger.info(`✅ Successfully updated: ${this.stats.updated}`);
        logger.info(`⏭️  Skipped (already has timestamps): ${this.stats.skipped}`);
        logger.info(`❌ Failed: ${this.stats.failed}`);
        logger.info(`🌐 API calls made: ${this.stats.apiCalls}`);
        logger.info(`🔥 API errors: ${this.stats.apiErrors}`);
        logger.info(`📈 Success rate: ${successRate}%`);
        
        if (this.stats.lastProcessedId) {
            logger.info(`🔄 Last processed ID: ${this.stats.lastProcessedId}`);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async shutdown() {
        try {
            logger.info('Shutting down Timestamp Updater...');
            await disconnectMongoDB();
            logger.info('Timestamp Updater shutdown complete');
        } catch (error) {
            logger.error('Error during shutdown:', error);
            throw error;
        }
    }
}

// Main execution
async function main() {
    const updater = new TimestampUpdater();
    
    try {
        await updater.initialize();
        await updater.updateAllProperties();
    } catch (error) {
        logger.error('Fatal error:', error);
        process.exit(1);
    } finally {
        await updater.shutdown();
    }
}

if (require.main === module) {
    main();
}

module.exports = TimestampUpdater;

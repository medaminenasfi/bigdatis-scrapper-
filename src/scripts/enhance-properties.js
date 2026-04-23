require('dotenv').config();

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { connectMongoDB, disconnectMongoDB } = require('../config/database');
const logger = require('../config/logger');
const Property = require('../models/Property');
const PropertyFinal = require('../models/PropertyFinal');
const LocationMapper = require('./location-mapper');

class PropertyEnhancer {
    constructor(options = {}) {
        this.apiBaseUrl = 'https://server.bigdatis.tn/api/properties/show/';
        this.delay = options.delay || parseInt(process.env.REQUEST_DELAY) || 2000; // Slightly higher delay for API calls
        this.maxRetries = options.maxRetries || parseInt(process.env.MAX_RETRIES) || 3;
        this.batchSize = options.batchSize || 100; // Process in batches
        this.resumeFromId = options.resumeFromId || null;
        
        // Create axios instance for API calls
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
        
        // Location mapper
        this.locationMapper = new LocationMapper();
        
        // Progress tracking
        this.stats = {
            totalProperties: 0,
            processed: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
            apiCalls: 0,
            apiErrors: 0,
            locationsMapped: 0,
            locationsNotFound: 0,
            startTime: null,
            endTime: null,
            lastProcessedId: null
        };
        
        // Progress file path
        this.progressFile = path.join(process.cwd(), 'enhancement-progress.json');
    }

    // Initialize the enhancer
    async initialize() {
        try {
            logger.info('Initializing Property Enhancer...');
            
            // Connect to MongoDB
            await connectMongoDB();
            
            // Load location mappings
            await this.locationMapper.loadMappings();
            
            // Load previous progress if available
            await this.loadProgress();
            
            logger.info('Property Enhancer initialized successfully', {
                locationMappings: this.locationMapper.getStats(),
                resumeFromId: this.resumeFromId
            });
            
        } catch (error) {
            logger.error('Failed to initialize Property Enhancer:', error);
            throw error;
        }
    }

    // Load previous progress for resuming
    async loadProgress() {
        try {
            const progressData = await fs.readFile(this.progressFile, 'utf8');
            const progress = JSON.parse(progressData);
            
            if (progress.lastProcessedId && !this.resumeFromId) {
                this.resumeFromId = progress.lastProcessedId;
                logger.info(`Resuming from last processed ID: ${this.resumeFromId}`);
            }
            
            if (progress.stats) {
                // Merge with existing stats but keep runtime stats fresh
                this.stats = {
                    ...progress.stats,
                    startTime: null,
                    endTime: null
                };
            }
            
        } catch (error) {
            logger.debug('No previous progress file found, starting fresh');
        }
    }

    // Save current progress
    async saveProgress() {
        try {
            const progressData = {
                timestamp: new Date().toISOString(),
                lastProcessedId: this.stats.lastProcessedId,
                stats: this.stats,
                completionRate: this.stats.totalProperties > 0 ? 
                    Math.round((this.stats.processed / this.stats.totalProperties) * 100) : 0
            };
            
            await fs.writeFile(this.progressFile, JSON.stringify(progressData, null, 2), 'utf8');
            
        } catch (error) {
            logger.warn('Failed to save progress:', error);
        }
    }

    // Make API call to get enhanced property data
    async getEnhancedPropertyData(bigdatisId, retryCount = 0) {
        const url = `${this.apiBaseUrl}${bigdatisId}`;
        
        try {
            this.stats.apiCalls++;
            logger.debug(`API Request for property ${bigdatisId}: ${url}`);
            
            const response = await this.client.get(url);
            
            if (response.data) {
                logger.debug(`API Success for property ${bigdatisId}: ${response.status}`);
                return response.data;
            } else {
                throw new Error('Empty response data');
            }
            
        } catch (error) {
            this.stats.apiErrors++;
            
            if (retryCount < this.maxRetries) {
                logger.warn(`API call failed for ${bigdatisId}, retrying (${retryCount + 1}/${this.maxRetries}):`, error.message);
                await this.sleep(this.delay * (retryCount + 1)); // Exponential backoff
                return this.getEnhancedPropertyData(bigdatisId, retryCount + 1);
            }
            
            logger.error(`API call failed for ${bigdatisId} after ${this.maxRetries} retries:`, error.message);
            throw error;
        }
    }

    // Process a single property
    async processProperty(property) {
        const bigdatisId = property.bigdatisId;
        
        try {
            logger.debug(`Processing property ${bigdatisId}`);
            
            // Check if already processed
            const existingFinal = await PropertyFinal.findOne({ bigdatisId });
            if (existingFinal) {
                logger.debug(`Property ${bigdatisId} already enhanced, skipping`);
                this.stats.skipped++;
                return { status: 'skipped', reason: 'already_exists' };
            }
            
            // Get enhanced data from API
            let enhancedData;
            try {
                enhancedData = await this.getEnhancedPropertyData(bigdatisId);
            } catch (apiError) {
                logger.error(`Failed to get enhanced data for ${bigdatisId}:`, apiError.message);
                
                // Create partial record with error
                const partialRecord = new PropertyFinal({
                    bigdatisId,
                    processingMeta: {
                        originalPropertyId: property._id,
                        apiResponseReceived: false,
                        locationMapped: false,
                        errors: [{
                            type: 'API_ERROR',
                            details: { message: apiError.message },
                            timestamp: new Date()
                        }]
                    }
                });
                
                await partialRecord.save();
                this.stats.failed++;
                return { status: 'failed', reason: 'api_error', error: apiError.message };
            }
            
            // Map location name
            let locationName = null;
            let locationMapped = false;
            
            if (property.location && property.location.locationId) {
                locationName = this.locationMapper.getLocationName(property.location.locationId);
                
                if (locationName) {
                    this.stats.locationsMapped++;
                    locationMapped = true;
                    logger.debug(`Mapped location ${property.location.locationId} to: ${locationName}`);
                } else {
                    this.stats.locationsNotFound++;
                    logger.debug(`Location mapping not found for ID: ${property.location.locationId}`);
                }
            }
            
            // Create enhanced property record
            const enhancedProperty = new PropertyFinal({
                bigdatisId,
                enhancedData,
                locationInfo: {
                    locationId: property.location?.locationId || null,
                    locationName: locationName,
                    mappingSource: 'phase2-enhanced-final-results.json',
                    mappedAt: new Date()
                },
                processingMeta: {
                    originalPropertyId: property._id,
                    apiResponseReceived: true,
                    locationMapped: locationMapped,
                    apiCallTimestamp: new Date(),
                    version: 1
                }
            });
            
            await enhancedProperty.save();
            
            this.stats.successful++;
            logger.debug(`Successfully enhanced property ${bigdatisId}`);
            
            return { 
                status: 'success', 
                hasLocationMapping: locationMapped,
                locationName: locationName 
            };
            
        } catch (error) {
            logger.error(`Error processing property ${bigdatisId}:`, error);
            this.stats.failed++;
            return { status: 'failed', reason: 'processing_error', error: error.message };
        }
    }

    // Process properties in batches
    async processPropertiesBatch(properties) {
        const results = [];
        
        for (const property of properties) {
            try {
                const result = await this.processProperty(property);
                results.push({ bigdatisId: property.bigdatisId, ...result });
                
                this.stats.processed++;
                this.stats.lastProcessedId = property.bigdatisId;
                
                // Log progress every 50 properties
                if (this.stats.processed % 50 === 0) {
                    const progressPercent = Math.round((this.stats.processed / this.stats.totalProperties) * 100);
                    logger.info(`Progress: ${this.stats.processed}/${this.stats.totalProperties} (${progressPercent}%)`, {
                        successful: this.stats.successful,
                        failed: this.stats.failed,
                        skipped: this.stats.skipped,
                        apiErrors: this.stats.apiErrors,
                        locationsMapped: this.stats.locationsMapped
                    });
                    
                    // Save progress
                    await this.saveProgress();
                }
                
                // Delay between API calls
                await this.sleep(this.delay);
                
            } catch (error) {
                logger.error(`Batch processing error for property ${property.bigdatisId}:`, error);
                results.push({ 
                    bigdatisId: property.bigdatisId, 
                    status: 'failed', 
                    reason: 'batch_error',
                    error: error.message 
                });
                this.stats.failed++;
                this.stats.processed++;
            }
        }
        
        return results;
    }

    // Main enhancement process
    async enhanceAllProperties() {
        this.stats.startTime = new Date();
        
        try {
            logger.info('Starting property enhancement process...');
            
            // Build query for properties to process
            const query = {};
            if (this.resumeFromId) {
                query.bigdatisId = { $gt: this.resumeFromId };
            }
            
            // Get total count
            this.stats.totalProperties = await Property.countDocuments(query);
            logger.info(`Found ${this.stats.totalProperties} properties to enhance`);
            
            if (this.stats.totalProperties === 0) {
                logger.info('No properties found to enhance');
                return;
            }
            
            // Process in batches
            let skip = 0;
            let hasMore = true;
            
            while (hasMore) {
                // Get batch of properties
                const properties = await Property.find(query)
                    .sort({ bigdatisId: 1 })
                    .skip(skip)
                    .limit(this.batchSize)
                    .lean(); // Use lean for better performance
                
                if (properties.length === 0) {
                    hasMore = false;
                    break;
                }
                
                logger.info(`Processing batch: ${skip + 1} to ${skip + properties.length}`);
                
                // Process batch
                const batchResults = await this.processPropertiesBatch(properties);
                
                // Log batch results
                const batchStats = batchResults.reduce((acc, result) => {
                    acc[result.status]++;
                    return acc;
                }, { success: 0, failed: 0, skipped: 0 });
                
                logger.info(`Batch completed:`, batchStats);
                
                skip += this.batchSize;
                
                // Memory usage check
                if (skip % (this.batchSize * 10) === 0) {
                    logger.memoryUsage();
                }
            }
            
        } catch (error) {
            logger.error('Fatal error during enhancement process:', error);
            throw error;
        } finally {
            this.stats.endTime = new Date();
            await this.saveProgress();
            this.logFinalResults();
        }
    }

    // Log final results
    logFinalResults() {
        const duration = this.stats.endTime - this.stats.startTime;
        const successRate = this.stats.processed > 0 ? 
            Math.round((this.stats.successful / this.stats.processed) * 100) : 0;
        const locationMappingRate = this.stats.processed > 0 ? 
            Math.round((this.stats.locationsMapped / this.stats.processed) * 100) : 0;
        
        logger.info('\n🎉 PROPERTY ENHANCEMENT COMPLETED!');
        logger.info('=' .repeat(80));
        logger.info(`⏱️  Total duration: ${Math.round(duration / 1000 / 60)} minutes`);
        logger.info(`📊 Properties processed: ${this.stats.processed}/${this.stats.totalProperties}`);
        logger.info(`✅ Successfully enhanced: ${this.stats.successful}`);
        logger.info(`❌ Failed: ${this.stats.failed}`);
        logger.info(`⏭️  Skipped (already exists): ${this.stats.skipped}`);
        logger.info(`🌐 API calls made: ${this.stats.apiCalls}`);
        logger.info(`🔥 API errors: ${this.stats.apiErrors}`);
        logger.info(`📍 Locations mapped: ${this.stats.locationsMapped}`);
        logger.info(`❓ Locations not found: ${this.stats.locationsNotFound}`);
        logger.info(`📈 Success rate: ${successRate}%`);
        logger.info(`🗺️  Location mapping rate: ${locationMappingRate}%`);
        
        if (this.stats.lastProcessedId) {
            logger.info(`🔄 Last processed ID: ${this.stats.lastProcessedId}`);
        }
    }

    // Sleep utility
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get enhancement statistics
    async getEnhancementStatistics() {
        try {
            const propertyFinalStats = await PropertyFinal.getEnhancementStatistics();
            const totalOriginal = await Property.countDocuments();
            const totalEnhanced = await PropertyFinal.countDocuments();
            
            return {
                originalProperties: totalOriginal,
                enhancedProperties: totalEnhanced,
                enhancementRate: totalOriginal > 0 ? Math.round((totalEnhanced / totalOriginal) * 100) : 0,
                detailedStats: propertyFinalStats[0] || {},
                locationMapperStats: this.locationMapper.getStats(),
                processingStats: this.stats
            };
            
        } catch (error) {
            logger.error('Error getting enhancement statistics:', error);
            throw error;
        }
    }

    // Cleanup and shutdown
    async shutdown() {
        try {
            logger.info('Shutting down Property Enhancer...');
            await this.saveProgress();
            await disconnectMongoDB();
            logger.info('Property Enhancer shutdown complete');
        } catch (error) {
            logger.error('Error during shutdown:', error);
            throw error;
        }
    }
}

module.exports = PropertyEnhancer;
const mongoose = require('mongoose');
const Property = require('./src/models/Property');
const axios = require('axios');
const logger = require('./src/config/logger');
require('dotenv').config();

class PropertyUpdater {
    constructor() {
        this.baseUrl = process.env.BIGDATIS_API_URL || 'https://server.bigdatis.tn/api/properties/search';
        this.token = process.env.ACCESS_TOKEN;
        this.client = axios.create({
            timeout: 10000,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            }
        });
        this.stats = {
            total: 0,
            updated: 0,
            skipped: 0,
            errors: 0
        };
    }

    async fetchPropertyDetails(propertyId, retryCount = 0) {
        const startTime = Date.now();
        const detailUrl = `${this.baseUrl.replace('/search', '')}/show/${propertyId}`;
        
        try {
            const response = await this.client.get(detailUrl);
            const responseTime = Date.now() - startTime;
            
            logger.debug(`Fetched details for property ${propertyId} (${responseTime}ms)`);
            return response.data;
        } catch (error) {
            if (retryCount < 2) {
                logger.warn(`Failed to fetch details for property ${propertyId}, retrying (${retryCount + 1}/2)`);
                await this.sleep(1000);
                return this.fetchPropertyDetails(propertyId, retryCount + 1);
            }
            
            logger.warn(`Failed to fetch details for property ${propertyId} after retries: ${error.message}`);
            return null;
        }
    }

    async fetchPropertyContacts(propertyId, retryCount = 0) {
        const startTime = Date.now();
        const contactsUrl = `${this.baseUrl.replace('/search', '')}/show/${propertyId}/contacts`;
        
        try {
            const response = await this.client.get(contactsUrl);
            const responseTime = Date.now() - startTime;
            
            logger.debug(`Fetched contacts for property ${propertyId} (${responseTime}ms)`);
            return response.data;
        } catch (error) {
            if (retryCount < 2) {
                logger.warn(`Failed to fetch contacts for property ${propertyId}, retrying (${retryCount + 1}/2)`);
                await this.sleep(1000);
                return this.fetchPropertyContacts(propertyId, retryCount + 1);
            }
            
            logger.warn(`Failed to fetch contacts for property ${propertyId} after retries: ${error.message}`);
            return null;
        }
    }

    extractImages(property) {
        const images = property.images || property.photos || [];
        
        if (Array.isArray(images)) {
            return images.map((img, index) => ({
                url: typeof img === 'string' ? img : img.url,
                caption: typeof img === 'object' ? img.caption || '' : '',
                isPrimary: index === 0
            }));
        }
        
        // Check for thumbnailUrl (single image)
        if (property.thumbnailUrl) {
            return [{
                url: property.thumbnailUrl.startsWith('http') ? 
                    property.thumbnailUrl : 
                    `https://server.bigdatis.tn${property.thumbnailUrl}`,
                caption: '',
                isPrimary: true
            }];
        }
        
        // Check for imageUrls array
        if (property.imageUrls && Array.isArray(property.imageUrls)) {
            return property.imageUrls.map((url, index) => ({
                url: url.startsWith('http') ? url : `https://server.bigdatis.tn${url}`,
                caption: '',
                isPrimary: index === 0
            }));
        }
        
        return [];
    }

    extractContact(property) {
        // Check if it's an array from the dedicated contacts endpoint
        if (Array.isArray(property) && property.length > 0) {
            const contact = property[0];
            return {
                name: contact.contactName || contact.name || '',
                phone: contact.contactPhones && Array.isArray(contact.contactPhones) 
                    ? contact.contactPhones.join(', ') 
                    : (contact.phone || ''),
                email: contact.email || '',
                isAgency: contact.sellerType === 'agency',
                agencyName: contact.agencyName || '',
                active: contact.active || false
            };
        }
        
        // Check for contacts array (Bigdatis detail endpoint format)
        if (property.contacts && Array.isArray(property.contacts) && property.contacts.length > 0) {
            const contact = property.contacts[0];
            return {
                name: contact.contactName || contact.name || '',
                phone: contact.phone || '',
                email: contact.email || '',
                isAgency: contact.sellerType === 'agency',
                agencyName: property.agencyName || '',
                active: contact.active || false
            };
        }
        
        // Fallback to individual fields
        return {
            name: property.contactName || property.contact?.name || '',
            phone: property.phone || property.contact?.phone || '',
            email: property.email || property.contact?.email || '',
            isAgency: property.isAgency || property.contact?.isAgency || false,
            agencyName: property.agencyName || property.contact?.agencyName || ''
        };
    }

    async updateProperty(property) {
        const propertyId = property.bigdatisId;
        
        try {
            // Check if property already has images and contacts
            const hasImages = property.images && property.images.length > 0;
            const hasPhone = property.contact && property.contact.phone;
            
            if (hasImages && hasPhone) {
                logger.debug(`Property ${propertyId} already has images and contacts, skipping`);
                this.stats.skipped++;
                return false;
            }
            
            // Fetch property details from detail endpoint to get images
            const propertyDetails = await this.fetchPropertyDetails(propertyId);
            if (propertyDetails) {
                const images = this.extractImages(propertyDetails);
                if (images.length > 0) {
                    property.images = images;
                    logger.debug(`Fetched ${images.length} images for property ${propertyId}`);
                }
            }
            
            // Fetch contacts from dedicated contacts endpoint to get phone numbers
            const propertyContacts = await this.fetchPropertyContacts(propertyId);
            if (propertyContacts) {
                const contact = this.extractContact(propertyContacts);
                if (contact.phone) {
                    property.contact = contact;
                    logger.debug(`Fetched contact for property ${propertyId}: ${contact.phone}`);
                }
            }
            
            // Save the updated property
            await property.save();
            this.stats.updated++;
            logger.info(`Updated property ${propertyId} with images and/or contacts`);
            return true;
            
        } catch (error) {
            logger.error(`Error updating property ${propertyId}:`, error);
            this.stats.errors++;
            return false;
        }
    }

    sleep(ms) {
        // Add random variation (±30%) to avoid detection
        const variation = 0.3;
        const randomMs = ms + (Math.random() - 0.5) * 2 * ms * variation;
        return new Promise(resolve => setTimeout(resolve, Math.max(randomMs, 1000)));
    }

    async runUpdate() {
        try {
            // Connect to MongoDB (using same database as scraper - 'test')
            const uri = process.env.MONGODB_URI;
            await mongoose.connect(uri); // scraper uses default 'test' database
            logger.info('Connected to MongoDB');
            
            // Find properties missing images or contacts
            const query = {
                $or: [
                    { images: { $size: 0 } },
                    { images: { $exists: false } },
                    { 'contact.phone': { $in: ['', null] } },
                    { 'contact.phone': { $exists: false } }
                ]
            };
            
            const properties = await Property.find(query);
            logger.info(`Found ${properties.length} properties missing images or contacts`);
            this.stats.total = properties.length;
            
            // Process properties in batches to avoid overwhelming the API
            const batchSize = 10;
            for (let i = 0; i < properties.length; i += batchSize) {
                const batch = properties.slice(i, i + batchSize);
                
                logger.info(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(properties.length/batchSize)} (${batch.length} properties)`);
                
                for (const property of batch) {
                    await this.updateProperty(property);
                    // Small delay between requests
                    await this.sleep(500);
                }
                
                // Longer delay between batches
                if (i + batchSize < properties.length) {
                    await this.sleep(2000);
                }
                
                // Log progress
                logger.info(`Progress: ${this.stats.updated + this.stats.skipped + this.stats.errors}/${this.stats.total} processed`);
            }
            
            // Final statistics
            logger.info('\n=== UPDATE COMPLETE ===');
            logger.info(`Total properties: ${this.stats.total}`);
            logger.info(`Updated: ${this.stats.updated}`);
            logger.info(`Skipped: ${this.stats.skipped}`);
            logger.info(`Errors: ${this.stats.errors}`);
            logger.info(`Success rate: ${((this.stats.updated / this.stats.total) * 100).toFixed(1)}%`);
            
        } catch (error) {
            logger.error('Fatal error:', error);
        } finally {
            await mongoose.disconnect();
            logger.info('Disconnected from MongoDB');
        }
    }
}

// Run the updater
if (require.main === module) {
    const updater = new PropertyUpdater();
    updater.runUpdate().catch(console.error);
}

module.exports = PropertyUpdater;

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../config/logger');
const Property = require('../models/Property');

class BigdatisScraper {
    constructor(options = {}) {
        this.baseUrl = process.env.BIGDATIS_API_URL || "https://server.bigdatis.tn/api/properties/search";
        this.delay = options.delay || parseInt(process.env.REQUEST_DELAY) || 1000;
        this.maxRetries = options.maxRetries || parseInt(process.env.MAX_RETRIES) || 3;
        this.batchSize = options.batchSize || parseInt(process.env.BATCH_SIZE) || 50;
        this.enableDuplicatesCheck = options.enableDuplicatesCheck ?? 
            (process.env.ENABLE_DUPLICATES_CHECK === 'true');
        
        // Location-based scraping configuration
        this.targetLocationIds = this.getTargetLocationIds();
        this.currentLocationIndex = 0;
        this.locationStats = new Map(); // Track stats per location
        
        // Create axios instance with default config
        this.client = axios.create({
            timeout: parseInt(process.env.TIMEOUT) || 30000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            }
        });
        
        // Default search payload
        this.basePayload = {
            filter: {
                propertyFilters: [
                    {
                        property: "transactionType",
                        values: ["sale"]
                    },
                    {
                        property: "propertyType",
                        values: ["flat", "house"]
                    },
                    {
                        property: "typology",
                        values: ["s+3", "s+1", "s+2", "s+4", "s+5", "s+6", "s+7", "s+8+"]
                    }
                ],
                location: {
                    id: null, // Will be set dynamically per location
                    additionalIds: []
                },
                price: {
                    min: null,
                    max: null,
                    excludeMissing: false
                },
                area: {
                    min: null,
                    max: null,
                    excludeMissing: false
                },
                contactHasPhone: false,
                agencies: [],
                includedFlags: [],
                excludedFlags: []
            },
            orderBy: "date"
        };

        this.stats = {
            totalScraped: 0,
            totalSaved: 0,
            totalUpdated: 0,
            totalSkipped: 0,
            errors: 0,
            locationsProcessed: 0,
            locationsCompleted: 0,
            startTime: null,
            endTime: null
        };
    }

    // Get all target location IDs from the provided data
    getTargetLocationIds() {
        return [
            // Ariana
            286, 287, 290, 292, 299, 300, 301, 308, 309, 310, 311, 312, 316, 320, 321, 325, 329, 343, 344, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 361, 364, 371, 378, 385, 390, 391, 392, 398, 399, 400, 404, 405, 412, 414, 415, 417, 418, 422, 429, 430, 434, 436, 437, 440, 449, 450, 451, 452, 455, 464, 465, 466, 467, 468, 491, 492, 493, 4881, 4882, 5173, 5203, 5293, 5294, 5295, 5314, 5316, 5317, 5386,
            
            // Ben Arous
            804, 805, 811, 816, 818, 822, 835, 845, 879, 909, 910, 923, 932, 933, 934, 939, 941, 942, 946, 948, 951, 956, 961, 962, 963, 964, 966, 967, 968, 969, 987, 989, 990, 991, 992, 993, 996, 1000, 1001, 1013, 1014, 1018, 1022, 1028, 1030, 1040, 1045, 1047, 1051, 1052, 1060, 1063, 1066, 1069, 1075, 1077, 1080, 1084, 1087, 1089, 1090, 1091, 1092, 1096, 1106, 1108, 1109, 1111, 1112, 1113, 1116, 5174, 5175, 5176, 5177, 5283, 5284, 5289, 5313, 5320, 5321, 5322, 5323, 5324, 5325,
            
            // La Manouba
            2321, 2323, 2330, 2335, 2336, 2350, 2361, 2379, 2384, 2385, 2386, 2393, 2394, 2396, 2397, 2407, 2409, 2418, 2419, 2440, 2458, 5326, 5328, 5329, 5331, 5332, 5333,
            
            // Tunis
            4808, 4809, 4812, 4813, 4816, 4818, 4819, 4820, 4821, 4822, 4823, 4824, 4825, 4827, 4829, 4830, 4832, 4834, 4835, 4836, 4837, 4838, 4840, 4841, 4846, 4848, 4850, 4855, 4856, 4857, 4859, 4864, 4865, 4868, 4869, 4870, 4871, 4875, 4879, 4880, 4883, 4885, 4886, 4890, 4894, 4896, 4897, 4898, 4901, 4902, 4903, 4906, 4907, 4908, 4909, 4912, 4913, 4914, 4915, 4918, 4919, 4923, 4924, 4926, 4930, 4932, 4933, 4934, 4938, 4939, 4940, 4941, 4942, 4946, 4947, 4950, 4953, 4956, 4957, 4959, 4963, 4964, 4965, 4971, 4973, 4974, 4975, 4976, 4977, 4978, 4979, 4980, 4981, 4986, 4988, 4989, 4992, 4993, 4994, 4995, 4997, 4998, 4999, 5001, 5002, 5003, 5004, 5006, 5007, 5016, 5017, 5146, 5187, 5188, 5189, 5190, 5191, 5192, 5193, 5194, 5196, 5197, 5199, 5200, 5201, 5202, 5204, 5205, 5206, 5207, 5208, 5209, 5210, 5211, 5212, 5213, 5214, 5215, 5216, 5217, 5218, 5219, 5220, 5221, 5222, 5223, 5288, 5290, 5292, 5296, 5297, 5298, 5299, 5300, 5301, 5315, 5318, 5319, 5327, 5334, 5335, 5336, 5384, 5385
        ];
    }

    // Initialize location stats tracking
    initLocationStats(locationId) {
        if (!this.locationStats.has(locationId)) {
            this.locationStats.set(locationId, {
                locationId,
                scraped: 0,
                saved: 0,
                updated: 0,
                skipped: 0,
                errors: 0,
                pages: 0,
                startTime: new Date(),
                endTime: null,
                status: 'processing'
            });
        }
        return this.locationStats.get(locationId);
    }

    // Get current location being processed
    getCurrentLocation() {
        if (this.currentLocationIndex < this.targetLocationIds.length) {
            return this.targetLocationIds[this.currentLocationIndex];
        }
        return null;
    }

    // Move to next location
    moveToNextLocation() {
        const currentLocationId = this.getCurrentLocation();
        
        if (currentLocationId) {
            const locationStats = this.locationStats.get(currentLocationId);
            if (locationStats) {
                locationStats.endTime = new Date();
                locationStats.status = 'completed';
                this.stats.locationsCompleted++;
            }
        }
        
        this.currentLocationIndex++;
        
        if (this.currentLocationIndex < this.targetLocationIds.length) {
            const nextLocationId = this.getCurrentLocation();
            logger.scrapingInfo(`Moving to next location: ${nextLocationId} (${this.currentLocationIndex + 1}/${this.targetLocationIds.length})`);
            return nextLocationId;
        }
        
        return null;
    }

    async makeRequest(payload, retryCount = 0) {
        const startTime = Date.now();
        
        try {
            logger.apiRequest(this.baseUrl, 'POST', { payload });
            
            // Debug: Log headers being sent
            if (retryCount === 0) {
                logger.debug('Request headers:', {
                    'Authorization': this.client.defaults.headers.Authorization ? 'Bearer ***' : 'Missing',
                    'Content-Type': this.client.defaults.headers['Content-Type']
                });
            }
            
            const response = await this.client.post(this.baseUrl, payload);
            const responseTime = Date.now() - startTime;
            
            logger.apiResponse(this.baseUrl, response.status, responseTime);
            return response.data;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            if (retryCount < this.maxRetries) {
                logger.warn(`Request failed, retrying (${retryCount + 1}/${this.maxRetries}):`, error.message);
                await this.sleep(this.delay * (retryCount + 1)); // Exponential backoff
                return this.makeRequest(payload, retryCount + 1);
            }
            
            logger.error(`Request failed after ${this.maxRetries} retries:`, error.message);
            if (error.response) {
                logger.error(`Status: ${error.response.status}`);
                logger.error(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
            }
            
            this.stats.errors++;
            
            // Update location stats
            const currentLocationId = this.getCurrentLocation();
            if (currentLocationId) {
                const locationStats = this.locationStats.get(currentLocationId);
                if (locationStats) {
                    locationStats.errors++;
                }
            }
            
            throw error;
        }
    }

    extractProperties(responseData) {
        const possibleKeys = [
            'properties',
            'data',
            'results',
            'items',
            'listings',
            'content'
        ];

        for (const key of possibleKeys) {
            if (responseData[key] && Array.isArray(responseData[key])) {
                return responseData[key];
            }
        }

        if (Array.isArray(responseData)) {
            return responseData;
        }

        logger.debug(`Response keys: ${Object.keys(responseData)}`);
        return [];
    }

    extractNextOffset(responseData, properties) {
        // Method 1: Check if the API returns the next offset directly
        if (typeof responseData === 'object' && responseData !== null) {
            const offsetKeys = ['nextOffset', 'next_offset', 'cursor', 'next_cursor', 'pagination'];
            
            for (const key of offsetKeys) {
                if (responseData[key]) {
                    logger.debug(`Found next offset in '${key}': ${responseData[key]}`);
                    return String(responseData[key]);
                }
            }
            
            if (responseData.pagination && typeof responseData.pagination === 'object') {
                for (const key of offsetKeys) {
                    if (responseData.pagination[key]) {
                        logger.debug(`Found next offset in pagination.${key}: ${responseData.pagination[key]}`);
                        return String(responseData.pagination[key]);
                    }
                }
            }
        }

        // Method 2: Generate offset from the last property
        if (properties && properties.length > 0) {
            const lastProperty = properties[properties.length - 1];
            
            const timestampFields = ['createdAt', 'created_at', 'dateCreated', 'date_created', 'timestamp', 'publishedAt', 'date'];
            const idFields = ['id', '_id', 'propertyId', 'property_id', 'listingId', 'listing_id'];
            
            let timestamp = null;
            let propId = null;
            
            // Extract timestamp
            for (const field of timestampFields) {
                if (lastProperty[field]) {
                    const timestampValue = lastProperty[field];
                    if (typeof timestampValue === 'string') {
                        try {
                            const date = new Date(timestampValue);
                            if (!isNaN(date.getTime())) {
                                timestamp = String(Math.floor(date.getTime() / 1000));
                                break;
                            }
                            if (/^\d+$/.test(timestampValue)) {
                                timestamp = timestampValue;
                                break;
                            }
                        } catch (e) {
                            // Continue to next field
                        }
                    } else if (typeof timestampValue === 'number') {
                        timestamp = String(Math.floor(timestampValue));
                        break;
                    }
                }
            }
            
            // Extract ID
            for (const field of idFields) {
                if (lastProperty[field]) {
                    propId = String(lastProperty[field]);
                    break;
                }
            }
            
            if (timestamp && propId) {
                const offset = `${timestamp}_${propId}`;
                logger.debug(`Generated offset from last property: ${offset}`);
                return offset;
            } else if (timestamp) {
                logger.debug(`Generated offset from timestamp only: ${timestamp}`);
                return timestamp;
            }
        }

        return null;
    }

    normalizePropertyData(rawProperty) {
        // Transform raw API data into our schema format
        const normalized = {
            bigdatisId: this.extractBigdatisId(rawProperty),
            title: rawProperty.title || rawProperty.name || '',
            description: rawProperty.description || '',
            propertyType: this.normalizePropertyType(rawProperty.propertyType || rawProperty.type),
            transactionType: rawProperty.transactionType || 'sale',
            typology: rawProperty.typology || rawProperty.rooms,
            
            location: {
                city: rawProperty.city || rawProperty.location?.city || '',
                region: rawProperty.region || rawProperty.location?.region || '',
                neighborhood: rawProperty.neighborhood || rawProperty.location?.neighborhood || '',
                address: rawProperty.address || rawProperty.location?.address || '',
                coordinates: {
                    latitude: rawProperty.latitude || rawProperty.coordinates?.lat || rawProperty.location?.coordinates?.latitude,
                    longitude: rawProperty.longitude || rawProperty.coordinates?.lng || rawProperty.location?.coordinates?.longitude
                },
                locationId: rawProperty.locationId || rawProperty.location?.id
            },
            
            price: {
                amount: this.parsePrice(rawProperty.price || rawProperty.amount),
                currency: rawProperty.currency || 'TND',
                pricePerSquareMeter: this.calculatePricePerSqm(rawProperty),
                negotiable: rawProperty.negotiable || false
            },
            
            area: {
                total: this.parseArea(rawProperty.area || rawProperty.totalArea),
                built: this.parseArea(rawProperty.builtArea),
                land: this.parseArea(rawProperty.landArea),
                unit: 'm2'
            },
            
            rooms: {
                bedrooms: this.parseNumber(rawProperty.bedrooms),
                bathrooms: this.parseNumber(rawProperty.bathrooms),
                totalRooms: this.parseNumber(rawProperty.totalRooms || rawProperty.rooms),
                livingRooms: this.parseNumber(rawProperty.livingRooms),
                kitchens: this.parseNumber(rawProperty.kitchens)
            },
            
            features: this.extractFeatures(rawProperty),
            contact: this.extractContact(rawProperty),
            images: this.extractImages(rawProperty),
            
            publication: {
                publishedAt: this.parseDate(rawProperty.publishedAt || rawProperty.createdAt),
                updatedAt: this.parseDate(rawProperty.updatedAt),
                expiresAt: this.parseDate(rawProperty.expiresAt),
                status: rawProperty.status || 'active',
                views: this.parseNumber(rawProperty.views) || 0
            },
            
            rawData: rawProperty,
            
            scrapingMeta: {
                scrapedAt: new Date(),
                lastUpdated: new Date(),
                version: 1,
                source: 'bigdatis',
                locationId: this.getCurrentLocation() // Track which location this property came from
            }
        };

        return normalized;
    }

    extractBigdatisId(property) {
        return property.id || property._id || property.propertyId || property.listing_id || 
            `${property.title}_${property.price}_${Date.now()}`;
    }

    normalizePropertyType(type) {
        if (!type) return 'flat';
        
        const typeMap = {
            'apartment': 'flat',
            'appartement': 'flat',
            'villa': 'house',
            'maison': 'house'
        };
        
        return typeMap[type.toLowerCase()] || type.toLowerCase();
    }

    parsePrice(price) {
        if (typeof price === 'number') return price;
        if (typeof price === 'string') {
            const cleaned = price.replace(/[^\d.]/g, '');
            return parseFloat(cleaned) || null;
        }
        return null;
    }

    parseArea(area) {
        if (typeof area === 'number') return area;
        if (typeof area === 'string') {
            const cleaned = area.replace(/[^\d.]/g, '');
            return parseFloat(cleaned) || null;
        }
        return null;
    }

    parseNumber(value) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const num = parseInt(value);
            return isNaN(num) ? null : num;
        }
        return null;
    }

    parseDate(dateStr) {
        if (!dateStr) return null;
        try {
            return new Date(dateStr);
        } catch {
            return null;
        }
    }

    calculatePricePerSqm(property) {
        const price = this.parsePrice(property.price);
        const area = this.parseArea(property.area || property.totalArea);
        
        if (price && area && area > 0) {
            return Math.round(price / area);
        }
        return null;
    }

    extractFeatures(property) {
        return {
            furnished: this.parseBoolean(property.furnished),
            parking: this.parseBoolean(property.parking),
            garage: this.parseBoolean(property.garage),
            garden: this.parseBoolean(property.garden),
            balcony: this.parseBoolean(property.balcony),
            terrace: this.parseBoolean(property.terrace),
            pool: this.parseBoolean(property.pool || property.swimming_pool),
            elevator: this.parseBoolean(property.elevator),
            airConditioning: this.parseBoolean(property.airConditioning || property.ac),
            heating: this.parseBoolean(property.heating),
            security: this.parseBoolean(property.security),
            internetReady: this.parseBoolean(property.internet || property.wifi)
        };
    }

    parseBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return ['true', 'yes', 'oui', '1'].includes(value.toLowerCase());
        }
        return false;
    }

    extractContact(property) {
        return {
            name: property.contactName || property.contact?.name || '',
            phone: property.phone || property.contact?.phone || '',
            email: property.email || property.contact?.email || '',
            isAgency: this.parseBoolean(property.isAgency || property.contact?.isAgency),
            agencyName: property.agencyName || property.contact?.agencyName || ''
        };
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
        
        return [];
    }

    async saveProperties(properties, offset = null, skipDuplicateCheck = false) {
        if (!properties || properties.length === 0) {
            return { saved: 0, updated: 0, skipped: 0 };
        }

        let saved = 0;
        let updated = 0;
        let skipped = 0;
        const currentLocationId = this.getCurrentLocation();

        for (const rawProperty of properties) {
            try {
                const normalizedData = this.normalizePropertyData(rawProperty);
                
                if (this.enableDuplicatesCheck && !skipDuplicateCheck) {
                    const existingProperty = await Property.findDuplicates(normalizedData);
                    
                    if (existingProperty) {
                        if (existingProperty.hasSignificantChanges(normalizedData)) {
                            // Update existing property
                            Object.assign(existingProperty, normalizedData);
                            existingProperty.scrapingMeta.version += 1;
                            existingProperty.scrapingMeta.offset = offset;
                            await existingProperty.save();
                            updated++;
                            logger.debug(`Updated property: ${normalizedData.bigdatisId} (Location: ${currentLocationId})`);
                        } else {
                            skipped++;
                            logger.debug(`Skipped unchanged property: ${normalizedData.bigdatisId} (Location: ${currentLocationId})`);
                        }
                        continue;
                    }
                }

                // Save new property
                normalizedData.scrapingMeta.offset = offset;
                const property = new Property(normalizedData);
                await property.save();
                saved++;
                logger.debug(`Saved new property: ${normalizedData.bigdatisId} (Location: ${currentLocationId})`);

            } catch (error) {
                logger.error(`Error saving property (Location: ${currentLocationId}):`, error);
                this.stats.errors++;
                
                // Update location stats
                if (currentLocationId) {
                    const locationStats = this.locationStats.get(currentLocationId);
                    if (locationStats) {
                        locationStats.errors++;
                    }
                }
            }
        }

        // Update location stats
        if (currentLocationId) {
            const locationStats = this.locationStats.get(currentLocationId);
            if (locationStats) {
                locationStats.saved += saved;
                locationStats.updated += updated;
                locationStats.skipped += skipped;
            }
        }

        logger.databaseAction('batch_save', 'properties', saved + updated, {
            saved,
            updated,
            skipped,
            total: properties.length,
            locationId: currentLocationId
        });

        return { saved, updated, skipped };
    }

    sleep(ms) {
        // Add random variation (±30%) to avoid detection
        const variation = 0.3;
        const randomMs = ms + (Math.random() - 0.5) * 2 * ms * variation;
        return new Promise(resolve => setTimeout(resolve, Math.max(randomMs, 1000)));
    }

    // Scrape properties for a specific location
    async scrapeLocationProperties(locationId, maxPages = null) {
        logger.scrapingInfo(`Starting scraping for location ID: ${locationId}`);
        
        const locationStats = this.initLocationStats(locationId);
        const allProperties = [];
        const seenPropertyIds = new Set();
        let page = 0;
        let offset = null;
        let consecutiveEmptyPages = 0;
        const maxConsecutiveEmptyPages = 7; // Stop after 3 consecutive empty pages

        try {
            while (true) {
                const payload = {
                    ...this.basePayload,
                    filter: {
                        ...this.basePayload.filter,
                        location: {
                            id: parseInt(locationId),
                            additionalIds: []
                        }
                    }
                };

                if (offset) {
                    payload.offset = offset;
                    logger.scrapingInfo(`Location ${locationId}, Page ${page}: Using offset: ${offset}`);
                } else {
                    logger.scrapingInfo(`Location ${locationId}, Page ${page}: First page (no offset)`);
                }

                let responseData;
                try {
                    responseData = await this.makeRequest(payload);
                } catch (error) {
                    logger.scrapingError(`Request failed for location ${locationId}, page ${page}`, error);
                    break;
                }

                const properties = this.extractProperties(responseData);

                if (!properties || properties.length === 0) {
                    consecutiveEmptyPages++;
                    logger.scrapingInfo(`No properties found for location ${locationId}, page ${page}. Empty pages: ${consecutiveEmptyPages}/${maxConsecutiveEmptyPages}`);
                    
                    if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
                        logger.scrapingInfo(`Reached ${maxConsecutiveEmptyPages} consecutive empty pages for location ${locationId}. Moving to next location.`);
                        break;
                    }
                    
                    // Try to get next offset even if no properties
                    const nextOffset = this.extractNextOffset(responseData, []);
                    if (!nextOffset) {
                        logger.scrapingInfo(`No next offset found for location ${locationId}. Ending location scraping.`);
                        break;
                    }
                    
                    offset = nextOffset;
                    page += 1;
                    await this.sleep(this.delay);
                    continue;
                }

                // Reset consecutive empty pages counter
                consecutiveEmptyPages = 0;

                // Filter out properties we've already seen in this session AND check database
                const newPropertiesForSession = [];
                const duplicatesFromSession = [];
                const existingInDb = [];

                for (const prop of properties) {
                    const propId = this.extractBigdatisId(prop);
                    
                    // Check session duplicates first (faster)
                    if (seenPropertyIds.has(propId)) {
                        duplicatesFromSession.push(propId);
                        continue;
                    }
                    
                    // Check if exists in database
                    try {
                        const existingProp = await Property.findOne({ bigdatisId: propId });
                        if (existingProp) {
                            existingInDb.push(propId);
                            seenPropertyIds.add(propId);
                            continue;
                        }
                    } catch (dbError) {
                        logger.warn(`Database check failed for property ${propId} (Location: ${locationId}):`, dbError.message);
                    }
                    
                    // Truly new property
                    seenPropertyIds.add(propId);
                    newPropertiesForSession.push(prop);
                }

                locationStats.scraped += newPropertiesForSession.length;
                locationStats.pages = page + 1;
                this.stats.totalScraped += newPropertiesForSession.length;

                logger.scrapingInfo(`Location ${locationId}, Page ${page}: Retrieved ${newPropertiesForSession.length} NEW properties (${existingInDb.length} exist in DB, ${duplicatesFromSession.length} session duplicates). Location total: ${locationStats.scraped}`);

                // Save properties to database (ONLY the truly new ones)
                if (newPropertiesForSession.length > 0) {
                    const saveResult = await this.saveProperties(newPropertiesForSession, offset, true);
                    this.stats.totalSaved += saveResult.saved;
                    this.stats.totalUpdated += saveResult.updated;
                    this.stats.totalSkipped += saveResult.skipped;
                }

                // Collect for potential file export
                allProperties.push(...properties);

                const nextOffset = this.extractNextOffset(responseData, properties);

                if (!nextOffset) {
                    logger.scrapingInfo(`No next offset found for location ${locationId}. Completed location scraping.`);
                    break;
                }

                if (maxPages && page >= maxPages - 1) {
                    logger.scrapingInfo(`Reached maximum pages limit (${maxPages}) for location ${locationId}`);
                    break;
                }

                offset = nextOffset;
                page += 1;

                await this.sleep(this.delay);
            }

        } catch (error) {
            logger.scrapingError(`Fatal error during location ${locationId} scraping`, error);
            locationStats.status = 'error';
            throw error;
        } finally {
            locationStats.endTime = new Date();
            const duration = locationStats.endTime - locationStats.startTime;
            
            logger.scrapingInfo(`Completed location ${locationId}`, {
                duration: `${Math.round(duration / 1000)}s`,
                pages: locationStats.pages,
                scraped: locationStats.scraped,
                saved: locationStats.saved,
                updated: locationStats.updated,
                skipped: locationStats.skipped,
                errors: locationStats.errors
            });
        }

        return {
            locationId,
            properties: allProperties,
            stats: locationStats,
            uniquePropertiesInSession: seenPropertyIds.size
        };
    }

    // Main scraping method with location-based approach
    async scrapeAllProperties(maxPages = null) {
        this.stats.startTime = new Date();
        logger.scrapingInfo('Starting location-based property scraping session');
        logger.scrapingInfo(`Total locations to process: ${this.targetLocationIds.length}`);

        const allProperties = [];
        const locationResults = [];

        try {
            // Process each location one by one
            while (this.currentLocationIndex < this.targetLocationIds.length) {
                const currentLocationId = this.getCurrentLocation();
                
                if (!currentLocationId) {
                    break;
                }

                this.stats.locationsProcessed++;
                
                logger.scrapingInfo(`\n${'='.repeat(60)}`);
                logger.scrapingInfo(`Processing location ${currentLocationId} (${this.currentLocationIndex + 1}/${this.targetLocationIds.length})`);
                logger.scrapingInfo(`${'='.repeat(60)}\n`);

                try {
                    const locationResult = await this.scrapeLocationProperties(currentLocationId, maxPages);
                    locationResults.push(locationResult);
                    allProperties.push(...locationResult.properties);
                    
                    // Log progress every 10 locations
                    if (this.stats.locationsProcessed % 10 === 0) {
                        logger.memoryUsage();
                        this.logOverallProgress();
                    }
                    
                } catch (error) {
                    logger.scrapingError(`Failed to process location ${currentLocationId}`, error);
                    
                    // Mark location as failed but continue with next
                    const locationStats = this.locationStats.get(currentLocationId);
                    if (locationStats) {
                        locationStats.status = 'failed';
                        locationStats.endTime = new Date();
                    }
                }

                // Move to next location
                this.moveToNextLocation();
                
                // Brief pause between locations
                await this.sleep(this.delay * 2);
            }

        } catch (error) {
            logger.scrapingError('Fatal error during location-based scraping', error);
            throw error;
        } finally {
            this.stats.endTime = new Date();
            this.logFinalResults();
        }

        return {
            properties: allProperties,
            stats: this.stats,
            locationResults,
            locationStats: Object.fromEntries(this.locationStats)
        };
    }

    // Log overall progress
    logOverallProgress() {
        const completedLocations = Array.from(this.locationStats.values()).filter(s => s.status === 'completed').length;
        const failedLocations = Array.from(this.locationStats.values()).filter(s => s.status === 'failed').length;
        
        logger.scrapingInfo(`\n📊 OVERALL PROGRESS UPDATE:`);
        logger.scrapingInfo(`   🎯 Locations: ${completedLocations} completed, ${failedLocations} failed, ${this.targetLocationIds.length - this.stats.locationsProcessed} remaining`);
        logger.scrapingInfo(`   🏠 Properties: ${this.stats.totalScraped} scraped, ${this.stats.totalSaved} saved, ${this.stats.totalUpdated} updated`);
        logger.scrapingInfo(`   ❌ Errors: ${this.stats.errors}`);
        logger.scrapingInfo(`   📈 Success rate: ${Math.round((completedLocations / this.stats.locationsProcessed) * 100)}%\n`);
    }

    // Log final results
    logFinalResults() {
        const duration = this.stats.endTime - this.stats.startTime;
        const completedLocations = Array.from(this.locationStats.values()).filter(s => s.status === 'completed').length;
        const failedLocations = Array.from(this.locationStats.values()).filter(s => s.status === 'failed').length;
        
        logger.scrapingInfo('\n🎉 LOCATION-BASED SCRAPING COMPLETED!');
        logger.scrapingInfo('=' .repeat(80));
        logger.scrapingInfo(`⏱️  Total duration: ${Math.round(duration / 1000 / 60)} minutes`);
        logger.scrapingInfo(`📍 Locations processed: ${this.stats.locationsProcessed}/${this.targetLocationIds.length}`);
        logger.scrapingInfo(`✅ Locations completed: ${completedLocations}`);
        logger.scrapingInfo(`❌ Locations failed: ${failedLocations}`);
        logger.scrapingInfo(`🏠 Total properties scraped: ${this.stats.totalScraped}`);
        logger.scrapingInfo(`💾 Properties saved: ${this.stats.totalSaved}`);
        logger.scrapingInfo(`🔄 Properties updated: ${this.stats.totalUpdated}`);
        logger.scrapingInfo(`⏭️  Properties skipped: ${this.stats.totalSkipped}`);
        logger.scrapingInfo(`🐛 Total errors: ${this.stats.errors}`);
        logger.scrapingInfo(`📊 Overall success rate: ${Math.round((completedLocations / this.stats.locationsProcessed) * 100)}%`);
    }

    getStats() {
        return { 
            ...this.stats,
            locationStats: Object.fromEntries(this.locationStats),
            currentLocation: this.getCurrentLocation(),
            progress: {
                currentLocationIndex: this.currentLocationIndex,
                totalLocations: this.targetLocationIds.length,
                remainingLocations: this.targetLocationIds.length - this.currentLocationIndex
            }
        };
    }

    resetStats() {
        this.stats = {
            totalScraped: 0,
            totalSaved: 0,
            totalUpdated: 0,
            totalSkipped: 0,
            errors: 0,
            locationsProcessed: 0,
            locationsCompleted: 0,
            startTime: null,
            endTime: null
        };
        
        this.locationStats.clear();
        this.currentLocationIndex = 0;
    }
}

module.exports = BigdatisScraper;
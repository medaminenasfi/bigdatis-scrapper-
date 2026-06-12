const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../config/logger');
const Property = require('../models/Property');
const { applyVisibilityToPublication } = require('../utils/visibility');
const PerformanceTracker = require('../utils/performanceTracker');

class BigdatisScraper {
    constructor(options = {}) {
        this.baseUrl = process.env.BIGDATIS_API_URL || "https://server.bigdatis.tn/api/properties/search";
        this.accessToken = process.env.ACCESS_TOKEN || '';
        this.delay = options.delay || parseInt(process.env.REQUEST_DELAY) || 1000;
        this.maxRetries = options.maxRetries || parseInt(process.env.MAX_RETRIES) || 3;
        this.batchSize = options.batchSize || parseInt(process.env.BATCH_SIZE) || 50;
        this.enableDuplicatesCheck = options.enableDuplicatesCheck ?? 
            (process.env.ENABLE_DUPLICATES_CHECK === 'true');
        this.searchOnly = options.searchOnly ?? (process.env.SEARCH_ONLY === 'true');
        this.skipNoPhoto = options.skipNoPhoto ?? (process.env.SKIP_NO_PHOTO === 'true');
        
        // Location-based scraping configuration
        this.targetLocationIds = this.getTargetLocationIds();
        this.currentLocationIndex = 0;
        this.locationStats = new Map(); // Track stats per location
        
        // Photo retry queue for properties that failed to get images
        this.photoRetryQueue = new Map(); // propertyId => retry attempts
        
        // Create axios instance with default config
        this.client = axios.create({
            timeout: parseInt(process.env.TIMEOUT) || 30000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`,
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

        this.accessTokenExpiresAt = this.getAccessTokenExpiry(this.accessToken);
        if (!this.accessToken) {
            logger.error('ACCESS_TOKEN is not configured');
        } else if (this.accessTokenExpiresAt && this.accessTokenExpiresAt.getTime() <= Date.now()) {
            logger.error(`ACCESS_TOKEN is expired since ${this.accessTokenExpiresAt.toISOString()}`);
        } else if (this.accessTokenExpiresAt) {
            logger.info(`ACCESS_TOKEN expires at ${this.accessTokenExpiresAt.toISOString()}`);
        }
        
        // Parse configurable filters
        const transactionTypes = process.env.TRANSACTION_TYPES ? process.env.TRANSACTION_TYPES.split(',') : ["sale"];
        const propertyTypes = process.env.PROPERTY_TYPES ? process.env.PROPERTY_TYPES.split(',') : ["flat", "house"];
        const typologies = process.env.TYPOLOGIES ? process.env.TYPOLOGIES.split(',') : ["s+1", "s+2", "s+3", "s+4", "s+5", "s+6", "s+7", "s+8+"];
        
        // Default search payload
        this.basePayload = {
            filter: {
                propertyFilters: [
                    {
                        property: "transactionType",
                        values: transactionTypes
                    },
                    {
                        property: "propertyType",
                        values: propertyTypes
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
        
        // Only add typology filter if it's not set to "all" (empty or explicit "all")
        if (typologies.length > 0 && typologies[0] !== '' && typologies[0].toLowerCase() !== 'all') {
            this.basePayload.filter.propertyFilters.push({
                property: "typology",
                values: typologies
            });
        }

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

        this.perf = new PerformanceTracker();
        this._locationNameIndex = this._buildLocationNameIndex();
    }

    _buildLocationNameIndex() {
        const index = new Map();
        try {
            const fs = require('fs');
            const filteredPath = path.join(__dirname, '../../exports/usable-locations-filtered.json');
            const cachePath = path.join(__dirname, '../../locations-cache.json');
            let list = [];
            if (fs.existsSync(filteredPath)) {
                list = JSON.parse(fs.readFileSync(filteredPath, 'utf8'));
            } else if (fs.existsSync(cachePath)) {
                list = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            }
            for (const loc of list) {
                if (!loc?.id) continue;
                const name = loc.name || '';
                const parts = name.split(',').map((p) => p.trim());
                index.set(String(loc.id), {
                    name,
                    governorate: parts[parts.length - 1] || null
                });
            }
        } catch (e) {
            logger.warn(`Could not build location name index: ${e.message}`);
        }
        return index;
    }

    _applyLocationMeta(locationId) {
        const meta = this._locationNameIndex.get(String(locationId));
        if (meta) {
            this.perf.setLocationMeta(locationId, meta);
        }
    }

    getAccessTokenExpiry(token) {
        if (!token) {
            return null;
        }

        try {
            const parts = token.split('.');
            if (parts.length < 2) {
                return null;
            }

            let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (payload.length % 4 !== 0) {
                payload += '=';
            }

            const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
            if (!decoded.exp) {
                return null;
            }

            return new Date(decoded.exp * 1000);
        } catch (error) {
            logger.warn(`Unable to decode ACCESS_TOKEN expiry: ${error.message}`);
            return null;
        }
    }

    ensureAccessTokenIsValid() {
        if (!this.accessToken) {
            throw new Error('ACCESS_TOKEN is missing. Set a valid BigDatis JWT before scraping.');
        }

        if (this.accessTokenExpiresAt && this.accessTokenExpiresAt.getTime() <= Date.now()) {
            throw new Error(`ACCESS_TOKEN expired at ${this.accessTokenExpiresAt.toISOString()}. Refresh it before scraping.`);
        }
    }

    // Get all target location IDs - load from CDN cache or fallback
    getTargetLocationIds() {
        try {
            const fs = require('fs');
            const { filterLocations, parseAllowedGovernorates } = require('../utils/locationFilter');
            const maxLocationsPerRun = parseInt(process.env.MAX_LOCATIONS_PER_RUN) || null;
            const allowedGovernorates = parseAllowedGovernorates(process.env.TARGET_GOVERNORATES);

            const matchesTargetGovernorates = (locationName) =>
                filterLocations([{ name: locationName }]).length > 0;

            // Allow using a filtered, user-provided list when requested
            const useFiltered = process.env.USE_FILTERED_LOCATIONS === 'true';
            const filteredPath = path.join(__dirname, '../../exports/usable-locations-filtered.json');
            if (useFiltered && fs.existsSync(filteredPath)) {
                const filtered = JSON.parse(fs.readFileSync(filteredPath, 'utf8'));
                const filteredByGov = filterLocations(filtered);
                const allIds = filteredByGov.map(loc => loc.id);
                const ids = maxLocationsPerRun ? allIds.slice(0, maxLocationsPerRun) : allIds;
                logger.info(
                    `Loaded ${ids.length} location IDs from usable-locations-filtered.json ` +
                    `(governorates: ${allowedGovernorates.join(', ')})` +
                    (maxLocationsPerRun ? ` [limited to first ${maxLocationsPerRun}]` : '')
                );
                return ids;
            }

            const cachePath = path.join(__dirname, '../../locations-cache.json');
            if (fs.existsSync(cachePath)) {
                const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                const filteredByGov = filterLocations(data.filter(loc => loc.use !== false));
                const allIds = filteredByGov.map(loc => loc.id);
                const usableIds = maxLocationsPerRun ? allIds.slice(0, maxLocationsPerRun) : allIds;
                logger.info(
                    `Loaded ${usableIds.length} location IDs from CDN cache ` +
                    `(governorates: ${allowedGovernorates.join(', ')})` +
                    (maxLocationsPerRun ? ` [limited to first ${maxLocationsPerRun}]` : '')
                );
                return usableIds;
            }
        } catch (e) {
            logger.warn(`Failed to load locations from cache: ${e.message}. Using hardcoded fallback.`);
        }
        
        // Fallback to the original hardcoded list if cache fails
        const fallbackIds = [41, 44, 45, 47, 49, 52, 126, 128, 131, 133, 167, 168, 169, 170, 171, 173, 176, 177, 178, 179, 180, 181, 182, 183, 184, 189, 190, 192, 194, 196, 199, 200, 201, 203, 204, 205, 235, 237, 240, 241, 242, 243, 262, 263, 264, 265, 269, 270, 271, 272, 273, 274, 277, 278, 279, 290, 308, 309, 311, 436, 437, 440, 811, 822, 965, 3292, 3312, 3345, 3373, 3421, 3424, 3436, 3476, 3489, 3491, 3499, 3526, 3722, 3960, 4443, 4495, 4830, 4994, 5002, 5173, 5174, 5175, 5176, 5177, 5193, 5283, 5288, 5289, 5290, 5291, 5292, 5293, 5294, 5295, 5296, 5297, 5298, 5299, 5300, 5301, 5302, 5303, 5305, 5306, 5307, 5308, 5309, 5311, 5312, 5313, 5314, 5315, 5316, 5317, 5318, 5319, 5320, 5321, 5322, 5323, 5324, 5325, 5326, 5327, 5328, 5329, 5330, 5331, 5332, 5333, 5334, 5335, 5336, 5377, 5380, 5384, 5385, 5386];
        return maxLocationsPerRun ? fallbackIds.slice(0, maxLocationsPerRun) : fallbackIds;
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
        if (retryCount === 0) {
            this.perf.recordPageScan();
        }

        return this.perf.track(
            'makeRequest',
            () => this._makeRequestImpl(payload, retryCount),
            { incrementRequest: retryCount === 0 }
        );
    }

    async _makeRequestImpl(payload, retryCount = 0) {
        const startTime = Date.now();
        
        try {
            logger.apiRequest(this.baseUrl, 'POST', { payload });
            
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
            const status = error.response?.status;

            if (status === 401 || status === 403) {
                logger.error(`Authentication failed with status ${status}. Check ACCESS_TOKEN before retrying.`);
                throw error;
            }

            if (status === 429) {
                let retryAfterValue = error.response.headers['retry-after'];
                let backoffDelay = this.delay * Math.pow(2, retryCount + 1);
                
                if (retryAfterValue) {
                    const parsedRetryAfter = Number(retryAfterValue);
                    if (Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0) {
                        backoffDelay = parsedRetryAfter * 1000;
                    } else {
                        const retryDate = new Date(retryAfterValue);
                        if (!isNaN(retryDate.getTime())) {
                            backoffDelay = Math.max(0, retryDate.getTime() - Date.now());
                        }
                    }
                }
                
                backoffDelay = Math.max(backoffDelay, 60000);
                const maxRateLimitRetries = 10;
                if (retryCount < maxRateLimitRetries) {
                    this.perf.record429('makeRequest', backoffDelay);
                    this.perf.recordRetry('makeRequest');
                    logger.warn(`Rate limited (429). Global cooldown ${backoffDelay}ms before retry (${retryCount + 1}/${maxRateLimitRetries}).`);
                    await this.sleep(backoffDelay, '429_cooldown');
                    return this._makeRequestImpl(payload, retryCount + 1);
                }
            }
            
            if (retryCount < this.maxRetries) {
                this.perf.recordRetry('makeRequest');
                logger.warn(`Request failed, retrying (${retryCount + 1}/${this.maxRetries}):`, error.message);
                await this.sleep(this.delay * Math.pow(2, retryCount + 1));
                return this._makeRequestImpl(payload, retryCount + 1);
            }
            
            logger.error(`Request failed after ${this.maxRetries} retries:`, error.message);
            if (error.response) {
                logger.error(`Status: ${error.response.status}`);
                logger.error(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
            }
            
            this.stats.errors++;
            
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

    async fetchPropertyDetails(propertyId, retryCount = 0) {
        return this.perf.track(
            'fetchPropertyDetails',
            () => this._fetchPropertyDetailsImpl(propertyId, retryCount),
            { incrementRequest: retryCount === 0, propertyId }
        );
    }

    async _fetchPropertyDetailsImpl(propertyId, retryCount = 0) {
        const startTime = Date.now();
        const detailUrl = `${this.baseUrl.replace('/search', '')}/show/${propertyId}`;
        
        try {
            const response = await this.client.get(detailUrl);
            const responseTime = Date.now() - startTime;
            logger.debug(`Fetched details for property ${propertyId} (${responseTime}ms)`);
            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 429) {
                const retryAfter = error.response.headers['retry-after'];
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : this.delay * (retryCount + 2);
                
                if (retryCount < this.maxRetries) {
                    this.perf.record429('fetchPropertyDetails', waitTime);
                    this.perf.recordRetry('fetchPropertyDetails');
                    logger.warn(`Rate limited for property ${propertyId}, waiting ${waitTime}ms before retry (${retryCount + 1}/${this.maxRetries})`);
                    await this.sleep(waitTime, '429_cooldown');
                    return this._fetchPropertyDetailsImpl(propertyId, retryCount + 1);
                }
                
                logger.error(`Rate limit exceeded for property ${propertyId} after ${this.maxRetries} retries - giving up`);
                return null;
            }
            
            if (retryCount < this.maxRetries) {
                this.perf.recordRetry('fetchPropertyDetails');
                logger.warn(`Failed to fetch details for property ${propertyId}, retrying (${retryCount + 1}/${this.maxRetries}): ${error.message}`);
                await this.sleep(this.delay * (retryCount + 1));
                return this._fetchPropertyDetailsImpl(propertyId, retryCount + 1);
            }
            
            logger.warn(`Failed to fetch details for property ${propertyId} after ${this.maxRetries} retries: ${error.message}`);
            return null;
        }
    }

    async fetchPropertyContacts(propertyId, retryCount = 0) {
        return this.perf.track(
            'fetchPropertyContacts',
            () => this._fetchPropertyContactsImpl(propertyId, retryCount),
            { incrementRequest: retryCount === 0, propertyId }
        );
    }

    async _fetchPropertyContactsImpl(propertyId, retryCount = 0) {
        const startTime = Date.now();
        const contactsUrl = `${this.baseUrl.replace('/search', '')}/show/${propertyId}/contacts`;
        
        try {
            const response = await this.client.get(contactsUrl);
            const responseTime = Date.now() - startTime;
            logger.debug(`Fetched contacts for property ${propertyId} (${responseTime}ms)`);
            return response.data;
        } catch (error) {
            if (error.response?.status === 429 && retryCount < this.maxRetries) {
                const waitTime = this.delay * (retryCount + 2);
                this.perf.record429('fetchPropertyContacts', waitTime);
                this.perf.recordRetry('fetchPropertyContacts');
                await this.sleep(waitTime, '429_cooldown');
                return this._fetchPropertyContactsImpl(propertyId, retryCount + 1);
            }
            if (retryCount < this.maxRetries) {
                this.perf.recordRetry('fetchPropertyContacts');
                logger.warn(`Failed to fetch contacts for property ${propertyId}, retrying (${retryCount + 1}/${this.maxRetries}): ${error.message}`);
                await this.sleep(this.delay * (retryCount + 1));
                return this._fetchPropertyContactsImpl(propertyId, retryCount + 1);
            }
            
            logger.warn(`Failed to fetch contacts for property ${propertyId} after ${this.maxRetries} retries: ${error.message}`);
            return null;
        }
    }

    async fetchPropertySources(propertyId, retryCount = 0) {
        return this.perf.track(
            'fetchPropertySources',
            () => this._fetchPropertySourcesImpl(propertyId, retryCount),
            { incrementRequest: retryCount === 0, propertyId }
        );
    }

    async _fetchPropertySourcesImpl(propertyId, retryCount = 0) {
        const startTime = Date.now();
        const sourcesUrl = `${this.baseUrl.replace('/search', '')}/show/${propertyId}/sources`;
        
        try {
            const response = await this.client.get(sourcesUrl);
            const responseTime = Date.now() - startTime;
            logger.debug(`Fetched sources for property ${propertyId} (${responseTime}ms)`);
            return response.data;
        } catch (error) {
            if (error.response?.status === 429 && retryCount < this.maxRetries) {
                const waitTime = this.delay * (retryCount + 2);
                this.perf.record429('fetchPropertySources', waitTime);
                this.perf.recordRetry('fetchPropertySources');
                await this.sleep(waitTime, '429_cooldown');
                return this._fetchPropertySourcesImpl(propertyId, retryCount + 1);
            }
            if (retryCount < this.maxRetries) {
                this.perf.recordRetry('fetchPropertySources');
                logger.warn(`Failed to fetch sources for property ${propertyId}, retrying (${retryCount + 1}/${this.maxRetries}): ${error.message}`);
                await this.sleep(this.delay * (retryCount + 1));
                return this._fetchPropertySourcesImpl(propertyId, retryCount + 1);
            }
            
            logger.warn(`Failed to fetch sources for property ${propertyId} after ${this.maxRetries} retries: ${error.message}`);
            return null;
        }
    }

    extractProperties(responseData) {
        if (!responseData) return [];

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
            } else if (propId) {
                logger.debug(`Generated offset from property ID only: ${propId}`);
                return propId;
            } 
            return null;
        }
    }

    // Extract Bigdatis ID from raw property
    extractBigdatisId(rawProperty) {
        if (!rawProperty) return null;
        return rawProperty.id || rawProperty.idsAlt || rawProperty._id || String(rawProperty.bigdatisId) || null;
    }

    normalizePropertyData(rawProperty) {
        // Transform raw API data into our schema format
        const bigdatisId = this.extractBigdatisId(rawProperty);
        
        // Get official location mapping
        const locationMapping = this.createLocationIdMapping();
        const rawLocationId = rawProperty.locationId || rawProperty.location?.id;
        const officialLocation = locationMapping[rawLocationId] || {};
        
        // Enhanced location handling with fallback
        let city = officialLocation.city || rawProperty.city || rawProperty.location?.city || '';
        let region = officialLocation.region || rawProperty.region || rawProperty.location?.region || '';
        let neighborhood = officialLocation.neighborhood || rawProperty.neighborhood || rawProperty.location?.neighborhood || '';
        
        // Fallback: Extract location from title if no official mapping found
        if (!officialLocation.city && rawLocationId) {
            const { extractLocationFromTitle, logUnmappedLocation } = require('../../official-location-mapping.js');
            const fallbackLocation = extractLocationFromTitle(rawProperty.title || rawProperty.name || '', rawLocationId);
            
            if (fallbackLocation) {
                city = city || fallbackLocation.city;
                region = region || fallbackLocation.region;
                neighborhood = neighborhood || fallbackLocation.neighborhood;
                logger.debug(`Used fallback location extraction for property ${bigdatisId}, locationId ${rawLocationId}`);
            } else {
                // Log unmapped location IDs for future investigation
                logUnmappedLocation(rawLocationId, rawProperty.title || rawProperty.name || '', rawProperty.address || '');
                logger.warn(`Unmapped location ID ${rawLocationId} for property ${bigdatisId}: "${rawProperty.title || rawProperty.name || ''}"`);
            }
        }
        
        const normalized = {
            bigdatisId: bigdatisId,
            url: null, // Will be populated from sources endpoint
            sources: [], // Will be populated from sources endpoint with real source URLs
            title: rawProperty.title || rawProperty.name || '',
            description: rawProperty.description || '',
            propertyType: this.normalizePropertyType(rawProperty.propertyType || rawProperty.type),
            transactionType: rawProperty.transactionType || 'sale',
            typology: rawProperty.typology || rawProperty.rooms,
            
            location: {
                city,
                region,
                neighborhood,
                address: rawProperty.address || rawProperty.location?.address || '',
                coordinates: {
                    latitude: rawProperty.latitude || rawProperty.coordinates?.lat || rawProperty.location?.coordinates?.latitude,
                    longitude: rawProperty.longitude || rawProperty.coordinates?.lng || rawProperty.location?.coordinates?.longitude
                },
                locationId: rawLocationId,
                mappingSource: officialLocation.city ? 'official' : (city ? 'fallback' : 'raw'),
                hasCompleteMapping: !!(city && region)
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
                publishedAt: null,
                updatedAt: null,
                expiresAt: this.parseDate(rawProperty.expiresAt),
                status: rawProperty.status || 'active',
                views: this.parseNumber(rawProperty.views) || 0,
                firstSeenAt: rawProperty.firstSeenAt ?? null,
                createdAt: rawProperty.createdAt ?? null,
                modifiedAt: rawProperty.modifiedAt ?? null,
                timestamp: rawProperty.timestamp ?? null,
                priceDroppedAt: rawProperty.priceDroppedAt ?? null,
                priceTimestamp: rawProperty.priceTimestamp ?? null,
            },
            
            rawData: rawProperty,
            
            scrapingMeta: {
                scrapedAt: new Date(),
                version: 1,
                source: 'bigdatis',
                locationId: this.getCurrentLocation(),
                locationMappingQuality: officialLocation.city ? 'official' : (city ? 'fallback' : 'missing')
            }
        };

        this.applySourceDates(normalized, rawProperty);
        normalized.publication = applyVisibilityToPublication(normalized.publication);

        return normalized;
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
            const cleaned = price.replace(/[^\d.,]/g, '');
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
            // Handle Unix timestamp (could be seconds or milliseconds)
            if (typeof dateStr === 'number') {
                // If timestamp is in seconds (less than 10000000000), convert to milliseconds
                const timestamp = dateStr < 10000000000 ? dateStr * 1000 : dateStr;
                const date = new Date(timestamp);
                // Reject invalid dates (before year 2000)
                if (date.getTime() < 946684800000) { // Before Jan 1, 2000
                    return null;
                }
                return date;
            }
            
            // Handle string Unix timestamp
            if (typeof dateStr === 'string' && /^\d+$/.test(dateStr)) {
                const timestamp = parseInt(dateStr);
                // If timestamp is in seconds (less than 10000000000), convert to milliseconds
                const convertedTimestamp = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
                const date = new Date(convertedTimestamp);
                // Reject invalid dates (before year 2000)
                if (date.getTime() < 946684800000) {
                    return null;
                }
                return date;
            }
            
            // Handle ISO date strings
            const date = new Date(dateStr);
            // Reject invalid dates (before year 2000)
            if (date.getTime() < 946684800000) {
                return null;
            }
            return date;
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
            isAgency: this.parseBoolean(property.isAgency || property.contact?.isAgency),
            agencyName: property.agencyName || property.contact?.agencyName || ''
        };
    }

    extractImages(property) {
        const images = property.images || property.photos || [];
        
        if (Array.isArray(images) && images.length > 0) {
            return images.map((img, index) => ({
                url: typeof img === 'string' ? img : img.url,
                caption: typeof img === 'object' ? img.caption || '' : '',
                isPrimary: index === 0
            }));
        }

        if (property.thumbnailUrl) {
            const url = String(property.thumbnailUrl).startsWith('http')
                ? property.thumbnailUrl
                : `https://server.bigdatis.tn/${property.thumbnailUrl}`;
            return [{ url, caption: '', isPrimary: true }];
        }
        
        return [];
    }

    applySourceDates(normalizedData, rawProperty, detailPayload = null) {
        const { extractSourceDates } = require('../utils/sourceDateExtractor');
        const merged = {
            ...(rawProperty || {}),
            ...(detailPayload || {}),
            publication: {
                ...(normalizedData.publication || {}),
                ...(detailPayload || {}),
            },
        };
        const extracted = extractSourceDates(merged, {
            referenceScrapeTime: normalizedData.scrapingMeta?.scrapedAt || new Date(),
        });

        if (!normalizedData.publication) {
            normalizedData.publication = {};
        }

        normalizedData.publication.publishedAt = extracted.first_published_at
            ? this.parseDate(extracted.first_published_at)
            : null;
        normalizedData.publication.updatedAt = extracted.last_updated_at
            ? this.parseDate(extracted.last_updated_at)
            : null;
        normalizedData.publication.dateProvenance = extracted.raw_date_debug;

        if (detailPayload) {
            normalizedData.publication.firstSeenAt = detailPayload.firstSeenAt ?? normalizedData.publication.firstSeenAt;
            normalizedData.publication.createdAt = detailPayload.createdAt ?? normalizedData.publication.createdAt;
            normalizedData.publication.modifiedAt = detailPayload.modifiedAt ?? normalizedData.publication.modifiedAt;
            normalizedData.publication.timestamp = detailPayload.timestamp ?? normalizedData.publication.timestamp;
            normalizedData.publication.priceDroppedAt = detailPayload.priceDroppedAt ?? normalizedData.publication.priceDroppedAt;
            normalizedData.publication.priceTimestamp = detailPayload.priceTimestamp ?? normalizedData.publication.priceTimestamp;
        }
    }

    async saveProperties(properties, offset = null, skipDuplicateCheck = false) {
        if (!properties || properties.length === 0) {
            return { saved: 0, updated: 0, skipped: 0 };
        }

        return this.perf.track(
            'saveProperties',
            () => this._savePropertiesImpl(properties, offset, skipDuplicateCheck),
            { recordsProcessed: properties.length }
        );
    }

    async _savePropertiesImpl(properties, offset = null, skipDuplicateCheck = false) {
        let saved = 0;
        let updated = 0;
        let skipped = 0;
        const currentLocationId = this.getCurrentLocation();

        for (const rawProperty of properties) {
            try {
                const normalizedData = this.normalizePropertyData(rawProperty);
                const propertyId = normalizedData.bigdatisId;
                
                let hasImages = false;

                if (!this.searchOnly) {
                    // Fetch property details from detail endpoint to get images and description
                    const propertyDetails = await this.fetchPropertyDetails(propertyId);
                    
                    if (propertyDetails) {
                        // Merge detail data into normalized data
                        normalizedData.images = this.extractImages(propertyDetails);
                        hasImages = normalizedData.images.length > 0;
                        
                        if (propertyDetails.description) {
                            normalizedData.description = propertyDetails.description;
                            logger.info(`Property ${propertyId}: DESCRIPTION FOUND (${propertyDetails.description.length} chars)`);
                        } else {
                            logger.debug(`Property ${propertyId}: No description in API response`);
                        }
                        
                        if (hasImages) {
                            logger.info(`Property ${propertyId}: ${normalizedData.images.length} IMAGES FOUND`);
                        } else {
                            logger.warn(`Property ${propertyId}: NO IMAGES FOUND - checking fallback sources`);
                            // Try to extract images from raw property data as fallback
                            const fallbackImages = this.extractImages(rawProperty);
                            if (fallbackImages.length > 0) {
                                normalizedData.images = fallbackImages;
                                hasImages = true;
                                logger.info(`Property ${propertyId}: ${fallbackImages.length} FALLBACK IMAGES FOUND from raw data`);
                            }
                        }
                        
                        // Add enhanced timestamp fields from API response
                        if (!normalizedData.publication) {
                            normalizedData.publication = {};
                        }
                        this.applySourceDates(normalizedData, rawProperty, propertyDetails);
                        normalizedData.publication = applyVisibilityToPublication(normalizedData.publication);
                    } else {
                        // Detail endpoint failed completely - try fallback
                        logger.warn(`Property ${propertyId}: DETAIL ENDPOINT FAILED - trying fallback image extraction`);
                        const fallbackImages = this.extractImages(rawProperty);
                        if (fallbackImages.length > 0) {
                            normalizedData.images = fallbackImages;
                            hasImages = true;
                            logger.info(`Property ${propertyId}: ${fallbackImages.length} FALLBACK IMAGES FOUND from raw data`);
                        } else {
                            logger.error(`Property ${propertyId}: NO IMAGES AVAILABLE - saved without photos`);
                            // Add to retry queue for later attempt
                            this.photoRetryQueue.set(propertyId, 0);
                        }
                    }
                    
                    // Fetch contacts from dedicated contacts endpoint to get phone numbers
                    const propertyContacts = await this.fetchPropertyContacts(propertyId);
                    if (propertyContacts) {
                        normalizedData.contact = this.extractContact(propertyContacts);
                        logger.debug(`Fetched contacts for property ${propertyId}: ${normalizedData.contact.phone || 'no phone'}`);
                    }
                    
                    // Fetch sources from dedicated sources endpoint to get source URLs
                    const propertySources = await this.fetchPropertySources(propertyId);
                    if (propertySources) {
                        normalizedData.sources = propertySources;
                        // Use first source URL as primary URL
                        if (propertySources.length > 0 && propertySources[0].url) {
                            normalizedData.url = propertySources[0].url;
                        }
                        logger.debug(`Fetched sources for property ${propertyId}: ${propertySources.length} sources`);
                    }
                        // Optionally skip saving properties without photos
                        if (this.skipNoPhoto && !hasImages) {
                            skipped++;
                            logger.info(`Property ${propertyId}: SKIPPED (no images) {skipNoPhoto}`);
                            // Update location stats incrementally
                            if (currentLocationId) {
                                const locationStats = this.locationStats.get(currentLocationId);
                                if (locationStats) {
                                    locationStats.skipped++;
                                }
                            }
                            continue;
                        }
                } else {
                    // Search-only mode: extract from search payload (includes firstSeenAt when present)
                    this.applySourceDates(normalizedData, rawProperty);
                    const fallbackImages = this.extractImages(rawProperty);
                    if (fallbackImages.length > 0) {
                        normalizedData.images = fallbackImages;
                        hasImages = true;
                        logger.debug(`Property ${propertyId}: Search-only mode - extracted ${fallbackImages.length} images from raw data`);
                    }
                    if (this.skipNoPhoto && !hasImages) {
                        skipped++;
                        logger.info(`Property ${propertyId}: SKIPPED (no images) {skipNoPhoto}`);
                        if (currentLocationId) {
                            const locationStats = this.locationStats.get(currentLocationId);
                            if (locationStats) locationStats.skipped++;
                        }
                        continue;
                    }
                }

                normalizedData.publication = applyVisibilityToPublication(normalizedData.publication);
                
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

    sleep(ms, reason = 'delay') {
        const variation = 0.3;
        const randomMs = ms + (Math.random() - 0.5) * 2 * ms * variation;
        const actualMs = Math.max(randomMs, reason === '429_cooldown' ? ms : 1000);
        this.perf.recordSleep(actualMs, reason);
        return new Promise(resolve => setTimeout(resolve, actualMs));
    }

    // Scrape properties for a specific location
    async scrapeLocationProperties(locationId, maxPages = null) {
        logger.scrapingInfo(`Starting scraping for location ID: ${locationId}`);
        this._applyLocationMeta(locationId);
        this.perf.startLocation(locationId);
        
        const locationStats = this.initLocationStats(locationId);
        const allProperties = [];
        const seenPropertyIds = new Set();
        let page = 0;
        let offset = null;
        let consecutiveEmptyPages = 0;
        let consecutiveZeroNewPages = 0; // Track pages with 0 NEW properties
        let lastOffset = null;
        let sameOffsetCount = 0;
        const maxConsecutiveEmptyPages = 7; // Stop after 7 consecutive empty pages
        const maxConsecutiveZeroNewPages = 10; // Stop after 10 pages with 0 NEW properties
        const maxSameOffset = 3; // Stop if same offset used 3 times
        const maxPagesPerLocation = maxPages || 500; // Hard limit per location

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
                        this.perf.recordDuplicateCheck({ session: 1 });
                        continue;
                    }
                    
                    // Check if exists in database (only if duplicate check is enabled)
                    if (this.enableDuplicatesCheck) {
                        try {
                            const dbStart = Date.now();
                            const existingProp = await Property.findOne({ bigdatisId: propId });
                            this.perf.recordMongoQuery(1, Date.now() - dbStart);
                            if (existingProp) {
                                existingInDb.push(propId);
                                seenPropertyIds.add(propId);
                                this.perf.recordDuplicateCheck({ db: 1 });
                                continue;
                            }
                        } catch (dbError) {
                            logger.warn(`Database check failed for property ${propId} (Location: ${locationId}):`, dbError.message);
                        }
                    }
                    
                    // Truly new property
                    seenPropertyIds.add(propId);
                    newPropertiesForSession.push(prop);
                }

                locationStats.scraped += newPropertiesForSession.length;
                locationStats.pages = page + 1;
                this.stats.totalScraped += newPropertiesForSession.length;

                logger.scrapingInfo(`Location ${locationId}, Page ${page}: Retrieved ${newPropertiesForSession.length} NEW properties (${existingInDb.length} exist in DB, ${duplicatesFromSession.length} session duplicates). Location total: ${locationStats.scraped}`);

                // Check for consecutive pages with 0 NEW properties
                if (newPropertiesForSession.length === 0) {
                    consecutiveZeroNewPages++;
                    logger.scrapingInfo(`Zero NEW properties for location ${locationId}, page ${page}. Count: ${consecutiveZeroNewPages}/${maxConsecutiveZeroNewPages}`);
                    
                    if (consecutiveZeroNewPages >= maxConsecutiveZeroNewPages) {
                        logger.scrapingInfo(`Reached ${maxConsecutiveZeroNewPages} consecutive pages with 0 NEW properties for location ${locationId}. Moving to next location.`);
                        break;
                    }
                } else {
                    consecutiveZeroNewPages = 0; // Reset counter when we get new properties
                }

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

                // Check for same offset being used repeatedly (infinite loop detection)
                if (nextOffset === lastOffset) {
                    sameOffsetCount++;
                    logger.scrapingInfo(`Same offset detected: ${nextOffset}. Count: ${sameOffsetCount}/${maxSameOffset}`);
                    
                    if (sameOffsetCount >= maxSameOffset) {
                        logger.scrapingInfo(`Same offset used ${maxSameOffset} times for location ${locationId}. Breaking to prevent infinite loop.`);
                        break;
                    }
                } else {
                    sameOffsetCount = 0; // Reset counter when offset changes
                }
                lastOffset = nextOffset;

                // Check max pages limit
                if (page >= maxPagesPerLocation - 1) {
                    logger.scrapingInfo(`Reached maximum pages limit (${maxPagesPerLocation}) for location ${locationId}`);
                    break;
                }

                if (maxPages && page >= maxPages - 1) {
                    logger.scrapingInfo(`Reached user-specified maximum pages limit (${maxPages}) for location ${locationId}`);
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
            this.perf.endLocation(locationId, locationStats);
            
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
        this.ensureAccessTokenIsValid();
        this.stats.startTime = new Date();
        logger.scrapingInfo('Starting location-based property scraping session');
        logger.scrapingInfo(`Total locations to process: ${this.targetLocationIds.length}`);

        // Fetch complete location data from Bigdatis CDN before scraping
        const { fetchAndCacheLocations } = require('../../official-location-mapping.js');
        await fetchAndCacheLocations();

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
            
            await this.perf.track('retryPhotoRequests', () => this.retryPhotoRequests());

            const perfExport = this.perf.finalize();
            if (perfExport) {
                logger.info(`📊 Performance report written: ${perfExport.jsonPath}`);
            }
        }

        return {
            properties: allProperties,
            stats: this.stats,
            locationResults,
            locationStats: Object.fromEntries(this.locationStats),
            performanceReport: this.perf.buildReport()
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

    // Retry photo requests for properties that failed initially
    async retryPhotoRequests() {
        if (this.photoRetryQueue.size === 0) {
            logger.info('No properties in photo retry queue');
            return;
        }

        logger.info(`Starting photo retry for ${this.photoRetryQueue.size} properties`);
        let successCount = 0;
        let failedCount = 0;

        for (const [propertyId, retryAttempts] of this.photoRetryQueue.entries()) {
            if (retryAttempts >= 2) {
                logger.debug(`Property ${propertyId}: Max photo retries reached, skipping`);
                continue;
            }

            logger.debug(`Property ${propertyId}: Retrying photo request (attempt ${retryAttempts + 1})`);
            
            try {
                // Wait longer between retries to avoid rate limiting
                await this.sleep(this.delay * 3);
                
                const propertyDetails = await this.fetchPropertyDetails(propertyId);
                if (propertyDetails) {
                    const images = this.extractImages(propertyDetails);
                    if (images.length > 0) {
                        // Update the property in database with the new images
                        const property = await Property.findOne({ bigdatisId: propertyId });
                        if (property) {
                            property.images = images;
                            property.scrapingMeta.lastUpdated = new Date();
                            property.scrapingMeta.version += 1;
                            await property.save();
                            
                            logger.info(`Property ${propertyId}: SUCCESS - ${images.length} photos added on retry`);
                            successCount++;
                            this.photoRetryQueue.delete(propertyId);
                        } else {
                            logger.warn(`Property ${propertyId}: Property not found in database for photo update`);
                        }
                    } else {
                        logger.debug(`Property ${propertyId}: Still no images on retry`);
                        this.photoRetryQueue.set(propertyId, retryAttempts + 1);
                    }
                } else {
                    logger.debug(`Property ${propertyId}: Detail endpoint still failed on retry`);
                    this.photoRetryQueue.set(propertyId, retryAttempts + 1);
                }
            } catch (error) {
                logger.error(`Property ${propertyId}: Photo retry failed: ${error.message}`);
                this.photoRetryQueue.set(propertyId, retryAttempts + 1);
            }
        }

        logger.info(`Photo retry completed: ${successCount} succeeded, ${failedCount} failed`);
    }

    // Location mapping — backed by CDN cache or hardcoded fallback
    createLocationIdMapping() {
        const { createLocationMapping } = require('../../official-location-mapping.js');
        return createLocationMapping();
    }

}

module.exports = BigdatisScraper;

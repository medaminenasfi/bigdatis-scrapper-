const fs = require('fs').promises;
const path = require('path');
const logger = require('../config/logger');

class LocationMapper {
    constructor(mappingFilePath = null) {
        this.mappingFilePath = mappingFilePath || path.join(process.cwd(), 'phase2-enhanced-final-results.json');
        this.locationMappings = new Map();
        this.isLoaded = false;
        this.stats = {
            totalMappings: 0,
            successfulMappings: 0,
            failedMappings: 0,
            lastLoadedAt: null
        };
    }

    // Load location mappings from the JSON file
    async loadMappings() {
        try {
            logger.info(`Loading location mappings from: ${this.mappingFilePath}`);
            
            const fileContent = await fs.readFile(this.mappingFilePath, 'utf8');
            const mappingData = JSON.parse(fileContent);
            
            // Clear existing mappings
            this.locationMappings.clear();
            
            // Load mappings from the file
            if (mappingData.locationMappings) {
                for (const [locationId, locationInfo] of Object.entries(mappingData.locationMappings)) {
                    this.locationMappings.set(locationId, {
                        id: locationInfo.id,
                        name: locationInfo.name,
                        propertyCount: locationInfo.propertyCount,
                        extractedAt: locationInfo.extractedAt
                    });
                }
            }
            
            // Update stats
            this.stats = {
                totalMappings: this.locationMappings.size,
                successfulMappings: mappingData.summary?.successfulMappings || this.locationMappings.size,
                failedMappings: mappingData.summary?.failedMappings || 0,
                lastLoadedAt: new Date(),
                overallSuccessRate: mappingData.summary?.overallSuccessRate || '0%'
            };
            
            this.isLoaded = true;
            
            logger.info(`Successfully loaded ${this.locationMappings.size} location mappings`, {
                successfulMappings: this.stats.successfulMappings,
                failedMappings: this.stats.failedMappings,
                successRate: this.stats.overallSuccessRate
            });
            
            return true;
            
        } catch (error) {
            logger.error('Failed to load location mappings:', error);
            this.isLoaded = false;
            throw new Error(`Failed to load location mappings: ${error.message}`);
        }
    }

    // Get location name by ID
    getLocationName(locationId) {
        if (!this.isLoaded) {
            throw new Error('Location mappings not loaded. Call loadMappings() first.');
        }
        
        const locationIdStr = String(locationId);
        const mapping = this.locationMappings.get(locationIdStr);
        
        if (mapping) {
            return mapping.name;
        }
        
        // Log missing location ID for debugging
        logger.debug(`Location ID not found in mappings: ${locationIdStr}`);
        return null;
    }

    // Get full location info by ID
    getLocationInfo(locationId) {
        if (!this.isLoaded) {
            throw new Error('Location mappings not loaded. Call loadMappings() first.');
        }
        
        const locationIdStr = String(locationId);
        return this.locationMappings.get(locationIdStr) || null;
    }

    // Check if location ID exists in mappings
    hasLocation(locationId) {
        if (!this.isLoaded) {
            return false;
        }
        
        const locationIdStr = String(locationId);
        return this.locationMappings.has(locationIdStr);
    }

    // Get all location IDs
    getAllLocationIds() {
        if (!this.isLoaded) {
            throw new Error('Location mappings not loaded. Call loadMappings() first.');
        }
        
        return Array.from(this.locationMappings.keys());
    }

    // Get all location names
    getAllLocationNames() {
        if (!this.isLoaded) {
            throw new Error('Location mappings not loaded. Call loadMappings() first.');
        }
        
        return Array.from(this.locationMappings.values()).map(mapping => mapping.name);
    }

    // Search locations by name (partial match)
    searchLocationsByName(searchTerm) {
        if (!this.isLoaded) {
            throw new Error('Location mappings not loaded. Call loadMappings() first.');
        }
        
        const searchTermLower = searchTerm.toLowerCase();
        const results = [];
        
        for (const [locationId, locationInfo] of this.locationMappings) {
            if (locationInfo.name.toLowerCase().includes(searchTermLower)) {
                results.push({
                    locationId,
                    ...locationInfo
                });
            }
        }
        
        return results;
    }

    // Get locations by region/governorate
    getLocationsByRegion(region) {
        if (!this.isLoaded) {
            throw new Error('Location mappings not loaded. Call loadMappings() first.');
        }
        
        const regionLower = region.toLowerCase();
        const results = [];
        
        for (const [locationId, locationInfo] of this.locationMappings) {
            // Location names are in format: "Specific Location, City, Region"
            const nameParts = locationInfo.name.split(',');
            if (nameParts.length >= 3) {
                const locationRegion = nameParts[2].trim().toLowerCase();
                if (locationRegion === regionLower) {
                    results.push({
                        locationId,
                        ...locationInfo
                    });
                }
            }
        }
        
        return results;
    }

    // Get mapping statistics
    getStats() {
        return {
            ...this.stats,
            isLoaded: this.isLoaded,
            mappingFilePath: this.mappingFilePath
        };
    }

    // Batch map location IDs to names
    batchMapLocations(locationIds) {
        if (!this.isLoaded) {
            throw new Error('Location mappings not loaded. Call loadMappings() first.');
        }
        
        const results = {
            mapped: [],
            notFound: [],
            total: locationIds.length
        };
        
        for (const locationId of locationIds) {
            const locationName = this.getLocationName(locationId);
            
            if (locationName) {
                results.mapped.push({
                    locationId: String(locationId),
                    locationName
                });
            } else {
                results.notFound.push(String(locationId));
            }
        }
        
        return results;
    }

    // Validate mapping file
    async validateMappingFile() {
        try {
            const fileContent = await fs.readFile(this.mappingFilePath, 'utf8');
            const mappingData = JSON.parse(fileContent);
            
            const validation = {
                isValid: true,
                errors: [],
                stats: {
                    hasLocationMappings: !!(mappingData.locationMappings),
                    mappingCount: mappingData.locationMappings ? Object.keys(mappingData.locationMappings).length : 0,
                    hasSummary: !!(mappingData.summary),
                    hasTimestamp: !!(mappingData.timestamp)
                }
            };
            
            // Validate structure
            if (!mappingData.locationMappings) {
                validation.isValid = false;
                validation.errors.push('Missing locationMappings object');
            }
            
            if (!mappingData.summary) {
                validation.errors.push('Missing summary object (non-critical)');
            }
            
            // Validate sample mappings
            if (mappingData.locationMappings) {
                const sampleIds = Object.keys(mappingData.locationMappings).slice(0, 5);
                
                for (const locationId of sampleIds) {
                    const mapping = mappingData.locationMappings[locationId];
                    
                    if (!mapping.id || !mapping.name) {
                        validation.isValid = false;
                        validation.errors.push(`Invalid mapping structure for location ${locationId}`);
                    }
                }
            }
            
            return validation;
            
        } catch (error) {
            return {
                isValid: false,
                errors: [`Failed to validate mapping file: ${error.message}`],
                stats: {}
            };
        }
    }

    // Reload mappings (useful for development)
    async reloadMappings() {
        logger.info('Reloading location mappings...');
        this.isLoaded = false;
        return await this.loadMappings();
    }

    // Export mapped locations to different formats
    async exportMappings(outputPath, format = 'json') {
        if (!this.isLoaded) {
            throw new Error('Location mappings not loaded. Call loadMappings() first.');
        }
        
        try {
            let content;
            
            switch (format.toLowerCase()) {
                case 'json':
                    content = JSON.stringify(Object.fromEntries(this.locationMappings), null, 2);
                    break;
                    
                case 'csv':
                    const csvHeaders = 'LocationID,LocationName,PropertyCount,ExtractedAt\n';
                    const csvRows = Array.from(this.locationMappings.entries())
                        .map(([id, info]) => `"${id}","${info.name}","${info.propertyCount}","${info.extractedAt}"`)
                        .join('\n');
                    content = csvHeaders + csvRows;
                    break;
                    
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }
            
            await fs.writeFile(outputPath, content, 'utf8');
            logger.info(`Exported ${this.locationMappings.size} location mappings to: ${outputPath}`);
            
            return outputPath;
            
        } catch (error) {
            logger.error(`Failed to export mappings to ${outputPath}:`, error);
            throw error;
        }
    }
}

module.exports = LocationMapper;
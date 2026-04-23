require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const { chromium } = require('playwright'); // npm install playwright

class EnhancedLocationMapper {
    constructor() {
        this.apiHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
            'Accept': 'application/json',
            'Origin': 'https://bigdatis.tn',
            'Referer': 'https://bigdatis.tn/',
        };
        
        this.baseSearchPayload = {
            "filter": {
                "propertyFilters": [
                    {
                        "property": "transactionType",
                        "values": ["sale"]
                    },
                    {
                        "property": "propertyType",
                        "values": ["flat", "house"]
                    }
                ],
                "location": {
                    "id": null,
                    "additionalIds": []
                },
                "price": {
                    "min": null,
                    "max": null,
                    "excludeMissing": false
                },
                "area": {
                    "min": null,
                    "max": null,
                    "excludeMissing": false
                },
                "contactHasPhone": false,
                "agencies": [],
                "includedFlags": [],
                "excludedFlags": []
            },
            "orderBy": "date"
        };
        
        this.allLocationIds = new Set();
        this.locationMappings = {};
        this.processedIds = new Set();
        this.failedMappings = {}; // Enhanced failure tracking
        this.browser = null;
    }

    // Initialize browser for JavaScript rendering
    async initBrowser() {
        if (!this.browser) {
            console.log('🚀 Launching headless browser with Playwright...');
            this.browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            console.log('✅ Browser launched successfully');
        }
        return this.browser;
    }

    // Close browser when done
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            console.log('🔒 Browser closed');
        }
    }

    // Load existing data from previous runs
    async loadExistingData() {
        try {
            // Load successful mappings
            const mappingsData = await fs.readFile('location-mappings-progress.json', 'utf8');
            const parsed = JSON.parse(mappingsData);
            
            if (parsed.locationMappings) {
                this.locationMappings = parsed.locationMappings;
                console.log(`🔄 Loaded ${Object.keys(this.locationMappings).length} existing successful mappings`);
            }
            
            // Load discovered location IDs
            const idsData = await fs.readFile('discovered-location-ids.json', 'utf8');
            const idsJSON = JSON.parse(idsData);
            
            if (idsJSON.locationIds && Array.isArray(idsJSON.locationIds)) {
                idsJSON.locationIds.forEach(id => this.allLocationIds.add(String(id)));
                console.log(`🔄 Loaded ${this.allLocationIds.size} total location IDs`);
            }
            
            return Array.from(this.allLocationIds);
        } catch (error) {
            console.log('📝 No existing data found, starting fresh');
            return [];
        }
    }

    // Identify failed location IDs that need retry
    getFailedLocationIds() {
        const allIds = Array.from(this.allLocationIds);
        const successfulIds = Object.keys(this.locationMappings);
        const failedIds = allIds.filter(id => !successfulIds.includes(id));
        
        console.log(`🎯 Identified ${failedIds.length} failed location IDs for retry`);
        return failedIds;
    }

    // Enhanced sample selection with diversity
    selectDiverseSamples(properties, maxSamples = 5) {
        if (!properties || properties.length === 0) return [];
        
        const samples = [];
        const totalProperties = properties.length;
        
        if (totalProperties <= maxSamples) {
            // If we have fewer properties than maxSamples, take them all
            return properties.map(prop => ({
                id: prop.id,
                title: prop.title,
                locationId: prop.locationId
            }));
        }
        
        // Diverse sampling strategy
        // Take samples from beginning, middle, and end to increase variety
        const indices = [
            0, // First property
            Math.floor(totalProperties * 0.25), // Quarter way
            Math.floor(totalProperties * 0.5),  // Middle
            Math.floor(totalProperties * 0.75), // Three quarters
            totalProperties - 1 // Last property
        ];
        
        // Remove duplicates and ensure we don't exceed bounds
        const uniqueIndices = [...new Set(indices)].filter(i => i < totalProperties);
        
        for (const index of uniqueIndices.slice(0, maxSamples)) {
            const prop = properties[index];
            samples.push({
                id: prop.id,
                title: prop.title,
                locationId: prop.locationId
            });
        }
        
        return samples;
    }

    // Enhanced location processing with better failure tracking
    async processLocationWithEnhancedSampling(locationId, isRetry = false) {
        const retryPrefix = isRetry ? '🔄 RETRY: ' : '';
        console.log(`${retryPrefix}📍 Processing location ${locationId}...`);
        
        try {
            const payload = {
                ...this.baseSearchPayload,
                filter: {
                    ...this.baseSearchPayload.filter,
                    location: {
                        id: parseInt(locationId),
                        additionalIds: []
                    }
                }
            };
            
            const response = await axios.post('https://server.bigdatis.tn/api/properties/search', payload, {
                headers: this.apiHeaders,
                timeout: 15000
            });
            
            const properties = response.data;
            
            if (!properties || properties.length === 0) {
                this.recordFailure(locationId, 'NO_PROPERTIES', 'No properties found for this location');
                console.log(`   ❌ No properties found for location ${locationId}`);
                return false;
            }
            
            // Enhanced sampling: Use diverse sample selection
            const sampleSize = isRetry ? 8 : 5; // More samples for retries
            const samples = this.selectDiverseSamples(properties, sampleSize);
            
            console.log(`   🔍 Testing ${samples.length} diverse samples from ${properties.length} total properties`);
            
            // Test ALL samples, not just until first success
            let extractionResults = [];
            let successfulExtraction = null;
            
            for (let i = 0; i < samples.length; i++) {
                const listing = samples[i];
                try {
                    console.log(`   📄 Testing sample ${i + 1}/${samples.length}: listing ${listing.id}`);
                    
                    const locationName = await this.extractLocationFromDetailPage(listing.id);
                    
                    if (locationName) {
                        console.log(`   ✅ SUCCESS: Extracted "${locationName}" from listing ${listing.id}`);
                        
                        extractionResults.push({
                            success: true,
                            listingId: listing.id,
                            locationName: locationName,
                            sampleIndex: i + 1
                        });
                        
                        if (!successfulExtraction) {
                            successfulExtraction = {
                                locationName,
                                listingId: listing.id,
                                sampleTitle: listing.title,
                                propertyCount: properties.length,
                                extractedAt: new Date().toISOString(),
                                sampleIndex: i + 1,
                                totalSamplesTested: samples.length,
                                isRetry: isRetry
                            };
                        }
                    } else {
                        console.log(`   ❌ Failed to extract from listing ${listing.id}`);
                        extractionResults.push({
                            success: false,
                            listingId: listing.id,
                            error: 'No location found',
                            sampleIndex: i + 1
                        });
                    }
                    
                } catch (error) {
                    console.log(`   ⚠️ Error testing listing ${listing.id}: ${error.message}`);
                    extractionResults.push({
                        success: false,
                        listingId: listing.id,
                        error: error.message,
                        sampleIndex: i + 1
                    });
                }
                
                await this.sleep(2000); // Delay between samples
            }
            
            if (successfulExtraction) {
                // Save successful mapping
                this.locationMappings[locationId] = successfulExtraction;
                console.log(`   🎯 MAPPED: Location ${locationId} → "${successfulExtraction.locationName}"`);
                return true;
            } else {
                // Record detailed failure
                this.recordFailure(locationId, 'EXTRACTION_FAILED', 'All sample extractions failed', {
                    propertyCount: properties.length,
                    samplesTest: samples.length,
                    extractionResults: extractionResults
                });
                console.log(`   ❌ All ${samples.length} samples failed for location ${locationId}`);
                return false;
            }
            
        } catch (error) {
            if (error.response && error.response.status === 429) {
                console.log(`   ⚠️ Rate limited for location ${locationId}, waiting 60 seconds...`);
                await this.sleep(60000);
                return false; // Will be retried later
            } else {
                this.recordFailure(locationId, 'API_ERROR', error.message);
                console.log(`   ❌ API error for location ${locationId}: ${error.message}`);
                return false;
            }
        }
    }

    // Enhanced failure tracking
    recordFailure(locationId, failureType, message, details = {}) {
        this.failedMappings[locationId] = {
            failureType,
            message,
            details,
            timestamp: new Date().toISOString(),
            retryCount: (this.failedMappings[locationId]?.retryCount || 0) + 1
        };
    }

    // PHASE 2: Enhanced retry system for failed locations
    async retryFailedLocations() {
        console.log('\n🔄 PHASE 2: Enhanced retry system for failed locations...\n');
        
        const failedIds = this.getFailedLocationIds();
        
        if (failedIds.length === 0) {
            console.log('✅ No failed locations to retry!');
            return;
        }
        
        console.log(`🎯 Starting enhanced retry for ${failedIds.length} failed locations`);
        console.log('📈 Using enhanced sampling strategy: 8 diverse samples per location\n');
        
        let retrySuccessCount = 0;
        let retryFailCount = 0;
        
        for (const locationId of failedIds) {
            const success = await this.processLocationWithEnhancedSampling(locationId, true);
            
            if (success) {
                retrySuccessCount++;
                console.log(`   🎉 RETRY SUCCESS: ${retrySuccessCount}/${failedIds.length} recovered`);
            } else {
                retryFailCount++;
            }
            
            // Progress update every 25 locations
            if ((retrySuccessCount + retryFailCount) % 25 === 0) {
                console.log(`\n📊 RETRY PROGRESS:`);
                console.log(`   ✅ Recovered: ${retrySuccessCount}`);
                console.log(`   ❌ Still failed: ${retryFailCount}`);
                console.log(`   📈 Retry success rate: ${Math.round((retrySuccessCount / (retrySuccessCount + retryFailCount)) * 100)}%`);
                console.log(`   ⏳ Remaining: ${failedIds.length - retrySuccessCount - retryFailCount}\n`);
                
                // Save intermediate results
                await this.saveProgress();
            }
            
            await this.sleep(1000); // Be gentle with API
        }
        
        console.log(`\n🎯 RETRY PHASE COMPLETE:`);
        console.log(`   🎉 Recovered: ${retrySuccessCount} locations`);
        console.log(`   ❌ Still failed: ${retryFailCount} locations`);
        console.log(`   📈 Retry success rate: ${Math.round((retrySuccessCount / failedIds.length) * 100)}%`);
        
        // Final save
        await this.saveProgress();
    }

    // Save progress with enhanced failure tracking
    async saveProgress() {
        const totalSuccessful = Object.keys(this.locationMappings).length;
        const totalLocations = this.allLocationIds.size;
        const overallSuccessRate = Math.round((totalSuccessful / totalLocations) * 100);
        
        const progressData = {
            timestamp: new Date().toISOString(),
            summary: {
                totalLocationIds: totalLocations,
                successfulMappings: totalSuccessful,
                failedMappings: Object.keys(this.failedMappings).length,
                overallSuccessRate: `${overallSuccessRate}%`
            },
            progress: {
                extractionSuccessful: totalSuccessful,
                extractionFailed: Object.keys(this.failedMappings).length,
                successRate: overallSuccessRate
            },
            locationMappings: this.locationMappings,
            failureAnalysis: this.analyzeFailures()
        };
        
        await fs.writeFile('enhanced-location-mappings-progress.json', JSON.stringify(progressData, null, 2));
        console.log(`💾 Progress saved: ${totalSuccessful}/${totalLocations} mapped (${overallSuccessRate}%)`);
    }

    // Analyze failure patterns
    analyzeFailures() {
        const failureTypes = {};
        const failedIds = Object.keys(this.failedMappings);
        
        for (const id of failedIds) {
            const failure = this.failedMappings[id];
            if (!failureTypes[failure.failureType]) {
                failureTypes[failure.failureType] = [];
            }
            failureTypes[failure.failureType].push(id);
        }
        
        const analysis = {
            totalFailed: failedIds.length,
            failureBreakdown: {}
        };
        
        for (const [type, ids] of Object.entries(failureTypes)) {
            analysis.failureBreakdown[type] = {
                count: ids.length,
                percentage: Math.round((ids.length / failedIds.length) * 100),
                sampleIds: ids.slice(0, 5) // First 5 IDs as examples
            };
        }
        
        return analysis;
    }

    // ENHANCED STRATEGY: Precise location extraction with combined location parts
    async extractLocationFromDetailPage(listingId) {
        const detailUrl = `https://bigdatis.tn/details/vente/u${listingId}`;
        
        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            });
            
            await page.goto(detailUrl, { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            
            await page.waitForTimeout(3000);
            const html = await page.content();
            
            if (html.length < 10000) {
                await page.close();
                return null;
            }
            
            // ENHANCED STRATEGY: 4-method fallback system
            const locationData = await page.evaluate(() => {
                // Method 1: Find the li element that contains the location icon
                const locationLi = document.querySelector('li:has(i.icon-location-outline)');
                
                if (locationLi) {
                    const propertyValue = locationLi.querySelector('.property-value');
                    const propertyName = locationLi.querySelector('.property-name');
                    
                    if (propertyValue && propertyName) {
                        return {
                            specificLocation: propertyValue.textContent.trim(),
                            broaderArea: propertyName.textContent.trim(),
                            method: 'icon-selector'
                        };
                    }
                }
                
                // Method 2: Search through all ul.properties li elements
                const propertiesUl = document.querySelector('ul.properties');
                if (propertiesUl) {
                    const allLis = propertiesUl.querySelectorAll('li');
                    for (const li of allLis) {
                        const icon = li.querySelector('i');
                        if (icon && (icon.className.includes('location') || icon.className.includes('icon-location'))) {
                            const propertyValue = li.querySelector('.property-value');
                            const propertyName = li.querySelector('.property-name');
                            
                            if (propertyValue && propertyName) {
                                return {
                                    specificLocation: propertyValue.textContent.trim(),
                                    broaderArea: propertyName.textContent.trim(),
                                    method: 'properties-search'
                                };
                            }
                        }
                    }
                }
                
                // Method 3: Position-based (usually 3rd li in properties)
                const allPropertiesLis = document.querySelectorAll('ul.properties li');
                if (allPropertiesLis.length >= 3) {
                    const thirdLi = allPropertiesLis[2];
                    const propertyValue = thirdLi.querySelector('.property-value');
                    const propertyName = thirdLi.querySelector('.property-name');
                    
                    if (propertyValue && propertyName) {
                        const valueText = propertyValue.textContent.trim();
                        if (!valueText.includes('m²') && !valueText.includes('S+') && !valueText.match(/^\d+$/)) {
                            return {
                                specificLocation: valueText,
                                broaderArea: propertyName.textContent.trim(),
                                method: 'position-based'
                            };
                        }
                    }
                }
                
                // Method 4: Fallback search through all .property-value elements
                const allPropertyValues = document.querySelectorAll('.property-value');
                for (const element of allPropertyValues) {
                    const text = element.textContent.trim();
                    
                    if (text.includes('m²') || text.includes('DT') || text.includes('S+') || text.match(/^\d+$/)) {
                        continue;
                    }
                    
                    if (text.length > 3 && text.match(/[a-zA-ZÀ-ÿ]/)) {
                        const parentLi = element.closest('li');
                        if (parentLi) {
                            const propertyName = parentLi.querySelector('.property-name');
                            if (propertyName) {
                                return {
                                    specificLocation: text,
                                    broaderArea: propertyName.textContent.trim(),
                                    method: 'fallback-search'
                                };
                            }
                        }
                    }
                }
                
                return null;
            });

            await page.close();

            if (locationData) {
                const combinedLocation = `${locationData.specificLocation}, ${locationData.broaderArea}`;
                return combinedLocation;
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Main enhanced processing method
    async runEnhancedProcessing() {
        console.log('🚀 STARTING ENHANCED LOCATION MAPPING - PHASE 2 OPTIMIZATION...\n');
        console.log('🎯 Target: 95%+ success rate with enhanced sampling and retry system');
        console.log('🔧 Enhanced features:');
        console.log('   • 5 diverse samples per location (vs 3 previously)');
        console.log('   • 8 samples for retry attempts');
        console.log('   • Comprehensive failure tracking');
        console.log('   • Smart retry system for failed locations');
        console.log('=' .repeat(80));
        
        const startTime = new Date();
        
        try {
            await this.initBrowser();
            
            // Load existing data
            await this.loadExistingData();
            
            // Start retry system for failed locations
            await this.retryFailedLocations();
            
            await this.closeBrowser();
            
            // Final results
            const finalResults = {
                timestamp: new Date().toISOString(),
                processingTime: new Date() - startTime,
                summary: {
                    totalLocationIds: this.allLocationIds.size,
                    successfulMappings: Object.keys(this.locationMappings).length,
                    failedMappings: Object.keys(this.failedMappings).length,
                    finalSuccessRate: `${Math.round((Object.keys(this.locationMappings).length / this.allLocationIds.size) * 100)}%`
                },
                locationMappings: this.locationMappings,
                failureAnalysis: this.analyzeFailures(),
                enhancedFeatures: {
                    diverseSampling: true,
                    enhancedRetrySystem: true,
                    comprehensiveFailureTracking: true,
                    fourMethodExtraction: true
                }
            };
            
            await fs.writeFile('phase2-enhanced-final-results.json', JSON.stringify(finalResults, null, 2));
            
            console.log('\n🎉 PHASE 2 ENHANCEMENT COMPLETE!');
            console.log('=' .repeat(80));
            console.log(`⏱️  Total processing time: ${Math.round((new Date() - startTime) / 1000 / 60)} minutes`);
            console.log(`📍 Total location IDs: ${this.allLocationIds.size}`);
            console.log(`✅ Successful mappings: ${Object.keys(this.locationMappings).length}`);
            console.log(`❌ Failed mappings: ${Object.keys(this.failedMappings).length}`);
            console.log(`📊 Final success rate: ${finalResults.summary.finalSuccessRate}`);
            console.log(`💾 Final results saved to: phase2-enhanced-final-results.json`);
            
            return finalResults;
            
        } catch (error) {
            console.error('\n❌ ENHANCEMENT PROCESS FAILED:', error);
            throw error;
        }
    }
}

// Main execution
async function main() {
    console.log('🗺️  ENHANCED LOCATION MAPPER - PHASE 2 OPTIMIZATION');
    console.log('Strategy: Load Existing Data → Enhanced Retry → 95%+ Success Rate');
    console.log('🔧 Enhanced Features: Diverse Sampling + Smart Retry + Failure Analysis');
    console.log('');
    
    const mapper = new EnhancedLocationMapper();
    await mapper.runEnhancedProcessing();
}

main().catch(console.error);
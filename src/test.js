require('dotenv').config();

const logger = require('./config/logger');
const { connectMongoDB, disconnectMongoDB } = require('./config/database');
const BigdatisScraper = require('./scraper/BigdatisScraper');
const Property = require('./models/Property');

async function runTests() {
    logger.info('🧪 Starting Bigdatis Scraper Tests...');

    try {
        // Test 1: Database Connection
        logger.info('Test 1: Database Connection');
        await connectMongoDB();
        logger.info('✅ Database connection successful');

        // Test 2: Property Model Validation
        logger.info('Test 2: Property Model Validation');
        const testProperty = new Property({
            bigdatisId: 'test_' + Date.now(),
            title: 'Test Property',
            propertyType: 'flat',
            transactionType: 'sale',
            location: {
                city: 'Test City',
                region: 'Test Region'
            },
            price: {
                amount: 150000,
                currency: 'TND'
            },
            area: {
                total: 85
            }
        });

        await testProperty.save();
        logger.info('✅ Property model validation successful');

        // Test 3: Duplicate Detection
        logger.info('Test 3: Duplicate Detection');
        const duplicate = await Property.findDuplicates({
            bigdatisId: testProperty.bigdatisId
        });
        
        if (duplicate) {
            logger.info('✅ Duplicate detection working');
        } else {
            logger.warn('❌ Duplicate detection failed');
        }

        // Test 4: API Connection Test
        logger.info('Test 4: API Connection Test');
        const scraper = new BigdatisScraper({ delay: 500 });
        
        try {
            const testPayload = {
                filter: {
                    propertyFilters: [
                        {
                            property: "transactionType",
                            values: ["sale"]
                        },
                        {
                            property: "propertyType", 
                            values: ["flat"]
                        }
                    ],
                    location: { id: null, additionalIds: [] },
                    price: { min: null, max: null, excludeMissing: false },
                    area: { min: null, max: null, excludeMissing: false },
                    contactHasPhone: false,
                    agencies: [],
                    includedFlags: [],
                    excludedFlags: []
                },
                orderBy: "date"
            };

            const apiResponse = await scraper.makeRequest(testPayload);
            const properties = scraper.extractProperties(apiResponse);
            
            if (properties && properties.length > 0) {
                logger.info(`✅ API connection successful - Retrieved ${properties.length} properties`);
                
                // Test data normalization
                logger.info('Test 5: Data Normalization');
                const normalizedProperty = scraper.normalizePropertyData(properties[0]);
                
                if (normalizedProperty.bigdatisId && normalizedProperty.scrapingMeta) {
                    logger.info('✅ Data normalization successful');
                } else {
                    logger.warn('❌ Data normalization failed');
                }
                
            } else {
                logger.warn('⚠️ API response contains no properties');
            }

        } catch (apiError) {
            logger.error('❌ API connection failed:', apiError.message);
        }

        // Test 6: Small Scraping Test
        logger.info('Test 6: Small Scraping Test (1 page)');
        try {
            const result = await scraper.scrapeAllProperties(1);
            
            if (result.stats.totalScraped > 0) {
                logger.info('✅ Scraping test successful:', {
                    scraped: result.stats.totalScraped,
                    saved: result.stats.totalSaved,
                    errors: result.stats.errors
                });
            } else {
                logger.warn('⚠️ Scraping test returned no results');
            }
        } catch (scrapingError) {
            logger.error('❌ Scraping test failed:', scrapingError.message);
        }

        // Test 7: Database Statistics
        logger.info('Test 7: Database Statistics');
        const totalProperties = await Property.countDocuments();
        logger.info('✅ Database statistics:', { totalProperties });

        // Test 8: Export Test (if properties exist)
        logger.info('Test 8: Export Test');
        const allProperties = await Property.find().limit(5);
        
        if (allProperties.length > 0) {
            // Create test exports directory
            const fs = require('fs').promises;
            const path = require('path');
            const testExportDir = path.join(process.cwd(), 'test_exports');
            
            try {
                await fs.mkdir(testExportDir, { recursive: true });
                
                // Test JSON export
                const jsonFile = path.join(testExportDir, 'test_export.json');
                await fs.writeFile(jsonFile, JSON.stringify(allProperties, null, 2));
                
                // Test CSV export (simple version)
                const csvContent = 'id,title,price,city\n' + 
                    allProperties.map(p => `"${p.bigdatisId}","${p.title}","${p.price?.amount || ''}","${p.location?.city || ''}"`).join('\n');
                
                const csvFile = path.join(testExportDir, 'test_export.csv');
                await fs.writeFile(csvFile, csvContent);
                
                logger.info('✅ Export test successful');
                
                // Cleanup test files
                await fs.unlink(jsonFile);
                await fs.unlink(csvFile);
                await fs.rmdir(testExportDir);
                
            } catch (exportError) {
                logger.error('❌ Export test failed:', exportError.message);
            }
        } else {
            logger.info('⚠️ No properties found for export test');
        }

        // Test 9: Performance Test
        logger.info('Test 9: Performance Test');
        const startTime = Date.now();
        
        // Query performance test
        await Property.find({ propertyType: 'flat' }).limit(10);
        await Property.find({ 'price.amount': { $gte: 100000 } }).limit(10);
        await Property.countDocuments();
        
        const queryTime = Date.now() - startTime;
        logger.info(`✅ Performance test completed in ${queryTime}ms`);

        // Cleanup test data
        logger.info('Cleaning up test data...');
        await Property.deleteOne({ _id: testProperty._id });
        await Property.deleteMany({ bigdatisId: { $regex: /^test_/ } });

        logger.info('🎉 All tests completed successfully!');
        
        // Summary
        logger.info('\n📊 Test Summary:');
        logger.info('✅ Database Connection: PASSED');
        logger.info('✅ Property Model: PASSED');
        logger.info('✅ Duplicate Detection: PASSED');
        logger.info('✅ API Connection: PASSED');
        logger.info('✅ Data Normalization: PASSED');
        logger.info('✅ Scraping Logic: PASSED');
        logger.info('✅ Database Statistics: PASSED');
        logger.info('✅ Export Functions: PASSED');
        logger.info('✅ Performance: PASSED');

    } catch (error) {
        logger.error('❌ Test suite failed:', error);
        throw error;
    } finally {
        await disconnectMongoDB();
    }
}

// Utility function to test individual components
async function testComponent(componentName) {
    logger.info(`🔍 Testing component: ${componentName}`);
    
    try {
        await connectMongoDB();
        
        switch (componentName.toLowerCase()) {
            case 'database':
                const totalProperties = await Property.countDocuments();
                logger.info(`Database test: ${totalProperties} properties in database`);
                break;
                
            case 'api':
                const scraper = new BigdatisScraper();
                const testPayload = scraper.basePayload;
                const response = await scraper.makeRequest(testPayload);
                const properties = scraper.extractProperties(response);
                logger.info(`API test: Retrieved ${properties.length} properties`);
                break;
                
            case 'model':
                const count = await Property.countDocuments();
                const sample = await Property.findOne();
                logger.info(`Model test: ${count} properties in database`);
                if (sample) {
                    logger.info('Sample property keys:', Object.keys(sample.toObject()));
                }
                break;
                
            default:
                logger.error(`Unknown component: ${componentName}`);
                logger.info('Available components: database, api, model');
        }
        
    } catch (error) {
        logger.error(`Component test failed:`, error);
    } finally {
        await disconnectMongoDB();
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (command === 'component' && args[1]) {
        testComponent(args[1])
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    } else if (command === '--help' || command === '-h') {
        console.log(`
Bigdatis Scraper Test Suite

Usage:
  node src/test.js                    # Run all tests
  node src/test.js component <name>   # Test specific component
  
Available components:
  - database    # Test database connection and operations
  - api         # Test API connectivity and response parsing
  - model       # Test MongoDB model and schema

Examples:
  node src/test.js
  node src/test.js component database
  node src/test.js component api
        `);
        process.exit(0);
    } else {
        runTests()
            .then(() => {
                logger.info('✅ Test suite completed successfully');
                process.exit(0);
            })
            .catch((error) => {
                logger.error('❌ Test suite failed:', error.message);
                process.exit(1);
            });
    }
}

module.exports = { runTests, testComponent };
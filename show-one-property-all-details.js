/**
 * Show One Property - All Details
 * 
 * Displays one complete property with all available information in detail
 */

const mongoose = require('mongoose');
require('dotenv').config();
const { getLocationText, getAdminLocation, hasCompleteLocation, getLocationConfidence } = require('./location-helpers');

async function showOnePropertyAllDetails() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: 'test',
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 30000
        });

        const db = mongoose.connection.db;
        
        console.log('='.repeat(100));
        console.log('SHOWING ONE PROPERTY - ALL DETAILS');
        console.log('='.repeat(100));
        
        // Find a property with complete data
        console.log('\n🔍 FINDING PROPERTY WITH COMPLETE DATA...');
        
        const completeProperty = await db.collection('properties')
            .find({
                title: { $exists: true, $ne: '' },
                description: { $exists: true, $ne: '' },
                'price.amount': { $exists: true, $ne: null },
                'location.city': { $exists: true, $ne: '' },
                'contact.phone': { $exists: true, $ne: '' },
                images: { $exists: true, $ne: null },
                'images.0': { $exists: true }
            })
            .sort({ 'scrapingMeta.scrapedAt': -1 })
            .limit(1)
            .toArray()
            .then(results => results[0]);
        
        if (!completeProperty) {
            console.log('❌ No property with complete data found');
            await mongoose.disconnect();
            return;
        }
        
        console.log(`\n🏠 PROPERTY SELECTED: ${completeProperty.bigdatisId}`);
        console.log('='.repeat(100));
        
        // ===== BASIC INFORMATION =====
        console.log('\n📋 BASIC INFORMATION');
        console.log('-'.repeat(50));
        console.log(`Property ID: ${completeProperty.bigdatisId}`);
        console.log(`Title: ${completeProperty.title}`);
        console.log(`Description Length: ${completeProperty.description ? completeProperty.description.length + ' characters' : 'No description'}`);
        console.log(`Property Type: ${completeProperty.propertyType || 'N/A'}`);
        console.log(`Transaction Type: ${completeProperty.transactionType || 'N/A'}`);
        console.log(`Typology: ${completeProperty.typology || 'N/A'}`);
        
        // ===== LOCATION INFORMATION =====
        console.log('\n📍 LOCATION INFORMATION');
        console.log('-'.repeat(50));
        console.log(`City: ${completeProperty.location?.city || 'N/A'}`);
        console.log(`Region: ${completeProperty.location?.region || 'N/A'}`);
        console.log(`Neighborhood: ${completeProperty.location?.neighborhood || 'N/A'}`);
        console.log(`Address: ${completeProperty.location?.address || 'N/A'}`);
        console.log(`Location ID: ${completeProperty.location?.locationId || 'N/A'}`);
        console.log(`Coordinates: ${completeProperty.location?.coordinates || 'N/A'}`);
        
        // Location Display
        console.log(`\n🗺️ Location Display:`);
        console.log(`  Readable: "${getLocationText(completeProperty)}"`);
        console.log(`  Admin: "${getAdminLocation(completeProperty)}"`);
        console.log(`  Complete: ${hasCompleteLocation(completeProperty)}`);
        console.log(`  Confidence: ${getLocationConfidence(completeProperty)}`);
        
        // ===== PRICE INFORMATION =====
        console.log('\n💰 PRICE INFORMATION');
        console.log('-'.repeat(50));
        if (completeProperty.price) {
            console.log(`Amount: ${completeProperty.price.amount} ${completeProperty.price.currency || 'TND'}`);
            console.log(`Price per m²: ${completeProperty.price.pricePerMeter || 'N/A'}`);
            console.log(`Negotiable: ${completeProperty.price.negotiable || 'N/A'}`);
            if (completeProperty.price.frequency) {
                console.log(`Frequency: ${completeProperty.price.frequency}`);
            }
        } else {
            console.log('❌ No price information available');
        }
        
        // ===== AREA INFORMATION =====
        console.log('\n📏 AREA INFORMATION');
        console.log('-'.repeat(50));
        if (completeProperty.area) {
            console.log(`Total Area: ${completeProperty.area.total || 'N/A'} m²`);
            console.log(`Built Area: ${completeProperty.area.built || 'N/A'} m²`);
            console.log(`Land Area: ${completeProperty.area.land || 'N/A'} m²`);
        } else {
            console.log('❌ No area information available');
        }
        
        // ===== ROOM INFORMATION =====
        console.log('\n🏠 ROOM INFORMATION');
        console.log('-'.repeat(50));
        if (completeProperty.rooms) {
            console.log(`Bedrooms: ${completeProperty.rooms.bedrooms || 'N/A'}`);
            console.log(`Bathrooms: ${completeProperty.rooms.bathrooms || 'N/A'}`);
            console.log(`Total Rooms: ${completeProperty.rooms.total || 'N/A'}`);
            console.log(`Living Rooms: ${completeProperty.rooms.livingRooms || 'N/A'}`);
            console.log(`Kitchens: ${completeProperty.rooms.kitchens || 'N/A'}`);
        } else {
            console.log('❌ No room information available');
        }
        
        // ===== FEATURES =====
        console.log('\n✨ FEATURES & AMENITIES');
        console.log('-'.repeat(50));
        const features = [
            'furnished', 'parking', 'garage', 'garden', 'balcony', 'terrace', 
            'pool', 'elevator', 'ac', 'heating', 'security', 'internet'
        ];
        
        features.forEach(feature => {
            const value = completeProperty.features?.[feature];
            const status = value !== undefined ? (value ? '✅ YES' : '❌ NO') : '❓ N/A';
            const icon = value === true ? '🟢' : value === false ? '🔴' : '⚪';
            console.log(`${icon} ${feature.charAt(0).toUpperCase() + feature.slice(1)}: ${status}`);
        });
        
        // ===== CONTACT INFORMATION =====
        console.log('\n📞 CONTACT INFORMATION');
        console.log('-'.repeat(50));
        if (completeProperty.contact) {
            console.log(`Phone: ${completeProperty.contact.phone || 'N/A'}`);
            console.log(`Email: ${completeProperty.contact.email || 'N/A'}`);
            console.log(`Name: ${completeProperty.contact.name || 'N/A'}`);
            console.log(`Is Agency: ${completeProperty.contact.isAgency || 'N/A'}`);
            console.log(`Agency Name: ${completeProperty.contact.agencyName || 'N/A'}`);
        } else {
            console.log('❌ No contact information available');
        }
        
        // ===== IMAGES =====
        console.log('\n🖼️ IMAGES');
        console.log('-'.repeat(50));
        if (completeProperty.images && completeProperty.images.length > 0) {
            console.log(`Total Images: ${completeProperty.images.length}`);
            console.log('Image Details:');
            
            completeProperty.images.forEach((image, index) => {
                const primary = image.isPrimary ? ' 🌟 PRIMARY' : '';
                console.log(`  ${index + 1}.${primary} ${image.url}`);
                if (image.caption) {
                    console.log(`     Caption: ${image.caption}`);
                }
            });
        } else {
            console.log('❌ No images available');
        }
        
        // ===== SOURCES =====
        console.log('\n🔗 SOURCES');
        console.log('-'.repeat(50));
        if (completeProperty.sources && completeProperty.sources.length > 0) {
            console.log(`Total Sources: ${completeProperty.sources.length}`);
            completeProperty.sources.forEach((source, index) => {
                console.log(`\n  Source ${index + 1}:`);
                console.log(`    URL: ${source.url}`);
                console.log(`    Source ID: ${source.sourceId || 'N/A'}`);
                console.log(`    Seller Type: ${source.sellerType || 'N/A'}`);
                if (source.lastModified) {
                    console.log(`    Last Modified: ${new Date(source.lastModified).toISOString()}`);
                }
                if (source.price) {
                    console.log(`    Source Price: ${source.price}`);
                }
            });
        } else {
            console.log('❌ No source information available');
        }
        
        // ===== PUBLICATION INFORMATION =====
        console.log('\n📅 PUBLICATION INFORMATION');
        console.log('-'.repeat(50));
        if (completeProperty.publication) {
            console.log(`Published: ${completeProperty.publication.publishedAt ? new Date(completeProperty.publication.publishedAt).toLocaleString() : 'N/A'}`);
            console.log(`Updated: ${completeProperty.publication.updatedAt ? new Date(completeProperty.publication.updatedAt).toLocaleString() : 'N/A'}`);
            console.log(`Expires: ${completeProperty.publication.expiresAt ? new Date(completeProperty.publication.expiresAt).toLocaleString() : 'N/A'}`);
            console.log(`Status: ${completeProperty.publication.status || 'N/A'}`);
            console.log(`Views: ${completeProperty.publication.views || 'N/A'}`);
        } else {
            console.log('❌ No publication information available');
        }
        
        // ===== SCRAPING METADATA =====
        console.log('\n🤖 SCRAPING METADATA');
        console.log('-'.repeat(50));
        if (completeProperty.scrapingMeta) {
            console.log(`Scraped At: ${completeProperty.scrapingMeta.scrapedAt ? new Date(completeProperty.scrapingMeta.scrapedAt).toLocaleString() : 'N/A'}`);
            console.log(`Last Updated: ${completeProperty.scrapingMeta.updatedAt ? new Date(completeProperty.scrapingMeta.updatedAt).toLocaleString() : 'N/A'}`);
            console.log(`Version: ${completeProperty.scrapingMeta.version || 'N/A'}`);
            console.log(`Source: ${completeProperty.scrapingMeta.source || 'N/A'}`);
            console.log(`Location ID: ${completeProperty.scrapingMeta.locationId || 'N/A'}`);
        } else {
            console.log('❌ No scraping metadata available');
        }
        
        // ===== RAW DATA SAMPLE =====
        console.log('\n🔬 RAW DATA SAMPLE');
        console.log('-'.repeat(50));
        if (completeProperty.rawData) {
            console.log(`Raw Location ID: ${completeProperty.rawData.locationId || 'N/A'}`);
            console.log(`Raw Price: ${completeProperty.rawData.price || 'N/A'}`);
            console.log(`Raw Area: ${completeProperty.rawData.area || 'N/A'}`);
            console.log(`Raw Title: ${completeProperty.rawData.title ? completeProperty.rawData.title.substring(0, 80) + '...' : 'N/A'}`);
            console.log(`Raw Description: ${completeProperty.rawData.description ? completeProperty.rawData.description.substring(0, 80) + '...' : 'N/A'}`);
            
            // Show raw data keys
            const rawKeys = Object.keys(completeProperty.rawData);
            console.log(`Raw Data Keys: ${rawKeys.join(', ')}`);
        } else {
            console.log('❌ No raw data available');
        }
        
        // ===== FULL DESCRIPTION =====
        if (completeProperty.description) {
            console.log('\n📝 FULL DESCRIPTION');
            console.log('-'.repeat(50));
            console.log(completeProperty.description);
        }
        
        // ===== DATA COMPLETENESS ANALYSIS =====
        console.log('\n📊 DATA COMPLETENESS ANALYSIS');
        console.log('-'.repeat(50));
        
        const checks = [
            { field: 'title', label: 'Title', weight: 10 },
            { field: 'description', label: 'Description', weight: 20 },
            { field: 'price.amount', label: 'Price', weight: 15 },
            { field: 'location.city', label: 'Location', weight: 10 },
            { field: 'location.neighborhood', label: 'Neighborhood', weight: 10 },
            { field: 'contact.phone', label: 'Contact', weight: 15 },
            { field: 'images', label: 'Images', weight: 10 },
            { field: 'sources', label: 'Sources', weight: 10 }
        ];
        
        let totalScore = 0;
        let maxScore = 100;
        
        console.log('Field Status:');
        checks.forEach(({ field, label, weight }) => {
            const value = field.split('.').reduce((obj, key) => obj?.[key], completeProperty);
            const hasValue = value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
            const status = hasValue ? '✅' : '❌';
            const points = hasValue ? weight : 0;
            totalScore += points;
            
            console.log(`  ${status} ${label}: ${points}/${weight} points`);
        });
        
        const percentage = (totalScore / maxScore) * 100;
        
        console.log(`\n🎯 TOTAL SCORE: ${totalScore}/${maxScore} (${percentage.toFixed(1)}%)`);
        
        if (percentage >= 90) {
            console.log('🌟 EXCELLENT: Property has almost complete data');
        } else if (percentage >= 70) {
            console.log('✅ GOOD: Property has most required data');
        } else if (percentage >= 50) {
            console.log('⚠️  FAIR: Property has some data but missing key fields');
        } else {
            console.log('❌ POOR: Property is missing most important data');
        }
        
        // ===== SUMMARY =====
        console.log('\n📋 PROPERTY SUMMARY');
        console.log('-'.repeat(50));
        console.log(`🏠 ${completeProperty.title}`);
        console.log(`📍 ${getLocationText(completeProperty)}`);
        console.log(`💰 ${completeProperty.price?.amount || 'N/A'} ${completeProperty.price?.currency || 'TND'}`);
        console.log(`📞 ${completeProperty.contact?.phone || 'N/A'}`);
        console.log(`🖼️ ${completeProperty.images?.length || 0} images`);
        console.log(`📝 ${completeProperty.description ? completeProperty.description.length + ' chars' : 'No description'}`);
        console.log(`🔗 ${completeProperty.sources?.length || 0} sources`);
        
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        await mongoose.disconnect();
    }
}

showOnePropertyAllDetails();

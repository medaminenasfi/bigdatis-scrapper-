#!/usr/bin/env node
/**
 * Show Multiple Properties
 * 
 * Displays multiple properties with their key details
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function showMultipleProperties(limit = 5) {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: 'test',
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 30000
        });

        const db = mongoose.connection.db;
        
        console.log('='.repeat(100));
        console.log(`SHOWING ${limit} PROPERTIES`);
        console.log('='.repeat(100));
        
        // Find recent properties
        const properties = await db.collection('properties')
            .find({})
            .sort({ 'scrapingMeta.scrapedAt': -1 })
            .limit(limit)
            .toArray();
        
        console.log(`\n📊 Found ${properties.length} properties\n`);
        
        properties.forEach((prop, index) => {
            console.log('='.repeat(100));
            console.log(`PROPERTY ${index + 1}: ${prop.bigdatisId}`);
            console.log('='.repeat(100));
            
            // Basic Info
            console.log(`\n📋 BASIC INFO:`);
            console.log(`   Title: ${prop.title}`);
            console.log(`   Type: ${prop.propertyType || 'N/A'} | Transaction: ${prop.transactionType || 'N/A'}`);
            console.log(`   Typology: ${prop.typology || 'N/A'}`);
            
            // Location
            const loc = prop.location || {};
            const locationDisplay = loc.neighborhood 
                ? `${loc.neighborhood}, ${loc.city}, ${loc.region}`
                : `${loc.city || 'N/A'}, ${loc.region || 'N/A'}`;
            console.log(`\n📍 LOCATION:`);
            console.log(`   ${locationDisplay}`);
            console.log(`   Location ID: ${loc.locationId || 'N/A'}`);
            
            // Price
            const price = prop.price || {};
            console.log(`\n💰 PRICE:`);
            console.log(`   ${price.amount || 'N/A'} ${price.currency || 'TND'}`);
            if (price.pricePerSquareMeter) {
                console.log(`   ${price.pricePerSquareMeter} TND/m²`);
            }
            
            // Area
            const area = prop.area || {};
            console.log(`\n📏 AREA:`);
            console.log(`   Total: ${area.total || 'N/A'} m²`);
            
            // Contact
            const contact = prop.contact || {};
            console.log(`\n📞 CONTACT:`);
            console.log(`   ${contact.phone || 'N/A'}`);
            console.log(`   ${contact.name || 'N/A'}`);
            
            // Images & Sources
            console.log(`\n🖼️ IMAGES: ${prop.images?.length || 0}`);
            console.log(`🔗 SOURCES: ${prop.sources?.length || 0}`);
            
            // Dates
            const pub = prop.publication || {};
            const published = pub.publishedAt ? new Date(pub.publishedAt).toLocaleDateString() : 'N/A';
            const scraped = prop.scrapingMeta?.scrapedAt ? new Date(prop.scrapingMeta.scrapedAt).toLocaleDateString() : 'N/A';
            console.log(`\n📅 DATES:`);
            console.log(`   Published: ${published}`);
            console.log(`   Scraped: ${scraped}`);
            
            // Description preview
            if (prop.description) {
                const preview = prop.description.length > 100 
                    ? prop.description.substring(0, 100) + '...' 
                    : prop.description;
                console.log(`\n📝 DESCRIPTION:`);
                console.log(`   ${preview}`);
            }
            
            console.log('\n');
        });
        
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        await mongoose.disconnect();
    }
}

// Get limit from command line or default to 5
const limit = parseInt(process.argv[2]) || 5;
showMultipleProperties(limit);

const mongoose = require('mongoose');
require('dotenv').config();

const Property = require('./src/models/Property');
const PropertyFinal = require('./src/models/PropertyFinal');

async function checkPropertyFields() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Get one sample property from Property collection (most recently scraped)
    const property = await Property.findOne({}).sort({ 'scrapingMeta.scrapedAt': -1 });
    if (property) {
      console.log('=== PROPERTY COLLECTION ===');
      console.log('Bigdatis ID:', property.bigdatisId);
      console.log('\nAll fields:');
      console.log(Object.keys(property.toObject()));
      
      console.log('\n=== PUBLICATION FIELDS ===');
      console.log('publication.publishedAt:', property.publication?.publishedAt);
      console.log('publication.updatedAt:', property.publication?.updatedAt);
      console.log('publication.expiresAt:', property.publication?.expiresAt);
      console.log('publication.status:', property.publication?.status);
      console.log('publication.firstSeenAt:', property.publication?.firstSeenAt);
      console.log('publication.createdAt:', property.publication?.createdAt);
      console.log('publication.modifiedAt:', property.publication?.modifiedAt);
      console.log('publication.priceDroppedAt:', property.publication?.priceDroppedAt);
      console.log('publication.timestamp:', property.publication?.timestamp);
      console.log('publication.priceTimestamp:', property.publication?.priceTimestamp);
      
      console.log('\n=== SCRAPING META FIELDS ===');
      console.log('scrapingMeta.scrapedAt:', property.scrapingMeta?.scrapedAt);
      console.log('scrapingMeta.lastUpdated:', property.scrapingMeta?.lastUpdated);
    }

    // Get one sample property from PropertyFinal collection
    const propertyFinal = await PropertyFinal.findOne({});
    if (propertyFinal) {
      console.log('\n\n=== PROPERTY FINAL COLLECTION ===');
      console.log('Bigdatis ID:', propertyFinal.bigdatisId);
      console.log('\nAll fields:');
      console.log(Object.keys(propertyFinal.toObject()));
      
      console.log('\n=== ENHANCED DATA TIMESTAMP FIELDS ===');
      console.log('enhancedData.firstSeenAt:', propertyFinal.enhancedData?.firstSeenAt);
      console.log('enhancedData.createdAt:', propertyFinal.enhancedData?.createdAt);
      console.log('enhancedData.modifiedAt:', propertyFinal.enhancedData?.modifiedAt);
      console.log('enhancedData.priceDroppedAt:', propertyFinal.enhancedData?.priceDroppedAt);
      console.log('enhancedData.timestamp:', propertyFinal.enhancedData?.timestamp);
    }

    console.log('\n\n=== CHECKING FOR SPECIFIC FIELDS ===');
    console.log('firstPublishedAt in Property:', property?.firstPublishedAt ? 'YES' : 'NO');
    console.log('lastUpdatedAt in Property:', property?.lastUpdatedAt ? 'YES' : 'NO');
    console.log('firstPublishedAt in PropertyFinal:', propertyFinal?.firstPublishedAt ? 'YES' : 'NO');
    console.log('lastUpdatedAt in PropertyFinal:', propertyFinal?.lastUpdatedAt ? 'YES' : 'NO');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkPropertyFields();

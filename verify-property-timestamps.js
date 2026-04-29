require('dotenv').config();

const mongoose = require('mongoose');
const Property = require('./src/models/Property');

async function verifyPropertyTimestamps(bigdatisId) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const property = await Property.findOne({ bigdatisId });
    
    if (!property) {
      console.log(`❌ Property ${bigdatisId} not found in database`);
      return;
    }

    console.log(`=== PROPERTY ${bigdatisId} ===\n`);
    
    const timestamps = {
      'firstSeenAt': property.publication?.firstSeenAt,
      'createdAt': property.publication?.createdAt,
      'modifiedAt': property.publication?.modifiedAt,
      'priceDroppedAt': property.publication?.priceDroppedAt,
      'timestamp': property.publication?.timestamp,
      'priceTimestamp': property.publication?.priceTimestamp
    };

    let hasAll = true;
    let hasAny = false;

    console.log('Enhanced Timestamp Fields:');
    console.log('─'.repeat(50));
    
    for (const [field, value] of Object.entries(timestamps)) {
      if (value !== undefined && value !== null) {
        console.log(`✅ ${field}: ${value}`);
        hasAny = true;
      } else {
        console.log(`❌ ${field}: NOT SET`);
        hasAll = false;
      }
    }

    console.log('\n' + '─'.repeat(50));
    if (hasAll) {
      console.log('✅ ALL timestamp fields are populated');
    } else if (hasAny) {
      console.log('⚠️  SOME timestamp fields are missing');
    } else {
      console.log('❌ NO timestamp fields are populated');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Get bigdatisId from command line argument
const bigdatisId = process.argv[2];

if (!bigdatisId) {
  console.log('Usage: node verify-property-timestamps.js <bigdatisId>');
  console.log('Example: node verify-property-timestamps.js 1294943');
  process.exit(1);
}

verifyPropertyTimestamps(bigdatisId);

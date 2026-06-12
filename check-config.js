require('dotenv').config();

console.log('=== CURRENT CONFIGURATION ===\n');
console.log('MAX_LOCATIONS_PER_RUN:', process.env.MAX_LOCATIONS_PER_RUN || 'NOT SET (null = all locations)');
console.log('TARGET_LOCATION_NAMES:', process.env.TARGET_LOCATION_NAMES || 'NOT SET (null = all locations)');
console.log('USE_FILTERED_LOCATIONS:', process.env.USE_FILTERED_LOCATIONS || 'NOT SET (default: false)');
console.log('SEARCH_ONLY:', process.env.SEARCH_ONLY || 'NOT SET (default: false)');
console.log('REQUEST_DELAY:', process.env.REQUEST_DELAY || 'NOT SET (default: 1000ms)');
console.log('MAX_RETRIES:', process.env.MAX_RETRIES || 'NOT SET (default: 3)');
console.log('MAX_PAGES_PER_RUN:', process.env.MAX_PAGES_PER_RUN || 'NOT SET (null = unlimited)');
console.log('ENABLE_DUPLICATES_CHECK:', process.env.ENABLE_DUPLICATES_CHECK || 'NOT SET (default: true)');
console.log('SKIP_NO_PHOTO:', process.env.SKIP_NO_PHOTO || 'NOT SET (default: false)');
console.log('TRANSACTION_TYPES:', process.env.TRANSACTION_TYPES || 'NOT SET (default: sale)');
console.log('PROPERTY_TYPES:', process.env.PROPERTY_TYPES || 'NOT SET (default: flat,house)');
console.log('TYPOLOGIES:', process.env.TYPOLOGIES || 'NOT SET (default: s+1,s+2,s+3,s+4,s+5,s+6,s+7,s+8+)');

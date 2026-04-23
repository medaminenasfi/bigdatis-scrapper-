const mongoose = require('mongoose');

const propertyFinalSchema = new mongoose.Schema({
  // Original Bigdatis ID (from the source property)
  bigdatisId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Enhanced API Response Data (from /api/properties/show/{bigdatisId})
  enhancedData: {
    id: Number,
    idsAlt: [Number],
    sources: [{
      sourceId: Number,
      lastModified: Number,
      price: Number,
      sellerType: String
    }],
    title: String,
    description: String,
    price: Number,
    area: Number,
    properties: {
      transactionType: String,
      sellerType: String,
      propertyType: String,
      typology: String
    },
    flags: [String],
    thumbnailUrl: String,
    images: [{
      url: String,
      sourceId: Number,
      adUrl: String
    }],
    imageUrls: [String],
    locationId: Number,
    sellerTypes: [String],
    contacts: [{
      sellerType: String,
      contactName: String,
      active: Boolean
    }],
    activeContactsCount: Number,
    adsCount: Number,
    activeAdsCount: Number,
    sourcesCount: Number,
    activeSourcesCount: Number,
    firstSeenAt: Number,
    createdAt: Number,
    modifiedAt: Number,
    priceDroppedAt: Number,
    timestamp: Number,
    priceTimestamp: Number,
    comments: [mongoose.Schema.Types.Mixed],
    commentsCount: Number
  },
  
  // Enhanced Location Information
  locationInfo: {
    locationId: String,
    locationName: String, // Mapped from phase2-enhanced-final-results.json
    mappingSource: {
      type: String,
      default: 'phase2-enhanced-final-results.json'
    },
    mappedAt: {
      type: Date,
      default: Date.now
    }
  },
  
  // Processing metadata
  processingMeta: {
    originalPropertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property'
    },
    enhancedAt: {
      type: Date,
      default: Date.now
    },
    apiResponseReceived: {
      type: Boolean,
      default: false
    },
    locationMapped: {
      type: Boolean,
      default: false
    },
    apiCallTimestamp: Date,
    version: {
      type: Number,
      default: 1
    },
    errors: [{
      type: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      details: mongoose.Schema.Types.Mixed
    }]
  },
  
  // Enhanced analysis fields (computed from enhancedData)
  computedFields: {
    pricePerSquareMeter: Number,
    daysSinceFirstSeen: Number,
    daysSinceCreated: Number,
    daysSinceModified: Number,
    hasPriceDrop: Boolean,
    isActivelyAdvertised: Boolean,
    sellerTypePrimary: String,
    hasMultipleContacts: Boolean,
    imageCount: Number,
    hasDescription: Boolean
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
propertyFinalSchema.index({ 'enhancedData.locationId': 1 });
propertyFinalSchema.index({ 'enhancedData.price': 1 });
propertyFinalSchema.index({ 'enhancedData.area': 1 });
propertyFinalSchema.index({ 'enhancedData.properties.propertyType': 1 });
propertyFinalSchema.index({ 'enhancedData.properties.transactionType': 1 });
propertyFinalSchema.index({ 'enhancedData.timestamp': -1 });
propertyFinalSchema.index({ 'locationInfo.locationName': 1 });
propertyFinalSchema.index({ 'processingMeta.enhancedAt': -1 });
propertyFinalSchema.index({ 'computedFields.pricePerSquareMeter': 1 });

// Virtual for property URL
propertyFinalSchema.virtual('propertyUrl').get(function() {
  return `https://bigdatis.tn/details/vente/u${this.bigdatisId}`;
});

// Virtual for enhanced property age
propertyFinalSchema.virtual('enhancedPropertyAge').get(function() {
  if (this.enhancedData && this.enhancedData.createdAt) {
    const now = Math.floor(Date.now() / 1000);
    const created = this.enhancedData.createdAt;
    const diffSeconds = now - created;
    return Math.floor(diffSeconds / (60 * 60 * 24)); // Days
  }
  return null;
});

// Pre-save middleware to compute enhanced fields
propertyFinalSchema.pre('save', function(next) {
  if (this.enhancedData) {
    // Compute price per square meter
    if (this.enhancedData.price && this.enhancedData.area && this.enhancedData.area > 0) {
      this.computedFields.pricePerSquareMeter = Math.round(this.enhancedData.price / this.enhancedData.area);
    }
    
    // Compute days since timestamps
    const now = Math.floor(Date.now() / 1000);
    
    if (this.enhancedData.firstSeenAt) {
      this.computedFields.daysSinceFirstSeen = Math.floor((now - this.enhancedData.firstSeenAt) / (60 * 60 * 24));
    }
    
    if (this.enhancedData.createdAt) {
      this.computedFields.daysSinceCreated = Math.floor((now - this.enhancedData.createdAt) / (60 * 60 * 24));
    }
    
    if (this.enhancedData.modifiedAt) {
      this.computedFields.daysSinceModified = Math.floor((now - this.enhancedData.modifiedAt) / (60 * 60 * 24));
    }
    
    // Check for price drops
    this.computedFields.hasPriceDrop = !!(this.enhancedData.priceDroppedAt);
    
    // Check if actively advertised
    this.computedFields.isActivelyAdvertised = this.enhancedData.activeAdsCount > 0;
    
    // Get primary seller type
    if (this.enhancedData.sellerTypes && this.enhancedData.sellerTypes.length > 0) {
      this.computedFields.sellerTypePrimary = this.enhancedData.sellerTypes[0];
    }
    
    // Check multiple contacts
    this.computedFields.hasMultipleContacts = this.enhancedData.activeContactsCount > 1;
    
    // Count images
    this.computedFields.imageCount = this.enhancedData.imageUrls ? this.enhancedData.imageUrls.length : 0;
    
    // Check description
    this.computedFields.hasDescription = !!(this.enhancedData.description && this.enhancedData.description.trim().length > 0);
  }
  
  next();
});

// Static method to get enhancement statistics
propertyFinalSchema.statics.getEnhancementStatistics = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalEnhanced: { $sum: 1 },
        avgPrice: { $avg: '$enhancedData.price' },
        avgArea: { $avg: '$enhancedData.area' },
        avgPricePerSqm: { $avg: '$computedFields.pricePerSquareMeter' },
        withApiResponse: { $sum: { $cond: ['$processingMeta.apiResponseReceived', 1, 0] } },
        withLocationMapping: { $sum: { $cond: ['$processingMeta.locationMapped', 1, 0] } },
        uniqueLocations: { $addToSet: '$locationInfo.locationName' },
        propertyTypes: { $addToSet: '$enhancedData.properties.propertyType' },
        sellerTypes: { $addToSet: '$computedFields.sellerTypePrimary' }
      }
    },
    {
      $addFields: {
        uniqueLocationCount: { $size: '$uniqueLocations' },
        apiResponseRate: { $divide: ['$withApiResponse', '$totalEnhanced'] },
        locationMappingRate: { $divide: ['$withLocationMapping', '$totalEnhanced'] }
      }
    }
  ]);
};

// Static method to find properties by location
propertyFinalSchema.statics.findByLocation = function(locationName) {
  return this.find({
    'locationInfo.locationName': new RegExp(locationName, 'i')
  }).sort({ 'enhancedData.timestamp': -1 });
};

// Static method to find recent price drops
propertyFinalSchema.statics.findRecentPriceDrops = function(days = 30) {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  
  return this.find({
    'computedFields.hasPriceDrop': true,
    'enhancedData.priceDroppedAt': { $gte: cutoffTimestamp }
  }).sort({ 'enhancedData.priceDroppedAt': -1 });
};

// Instance method to check if enhancement is complete
propertyFinalSchema.methods.isEnhancementComplete = function() {
  return this.processingMeta.apiResponseReceived && this.processingMeta.locationMapped;
};

// Instance method to add error
propertyFinalSchema.methods.addError = function(errorType, details = {}) {
  this.processingMeta.errors.push({
    type: errorType,
    details: details,
    timestamp: new Date()
  });
};

module.exports = mongoose.model('PropertyFinal', propertyFinalSchema);
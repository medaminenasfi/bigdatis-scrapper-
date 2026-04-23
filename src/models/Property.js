const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  // Unique identifier from Bigdatis
  bigdatisId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Property basic information
  title: {
    type: String,
    required: false
  },
  
  description: {
    type: String,
    required: false
  },
  
  // Property type and transaction
  propertyType: {
    type: String,
    enum: ['flat', 'house', 'villa', 'apartment', 'studio', 'office', 'commercial', 'land'],
    required: false
  },
  
  transactionType: {
    type: String,
    enum: ['sale', 'rent'],
    required: false
  },
  
  typology: {
    type: String,
    required: false
  },
  
  // Location information
  location: {
    city: String,
    region: String,
    neighborhood: String,
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    locationId: String
  },
  
  // Price information
  price: {
    amount: {
      type: Number,
      required: false
    },
    currency: {
      type: String,
      default: 'TND'
    },
    pricePerSquareMeter: Number,
    negotiable: {
      type: Boolean,
      default: false
    }
  },
  
  // Property details
  area: {
    total: Number,
    built: Number,
    land: Number,
    unit: {
      type: String,
      default: 'm2'
    }
  },
  
  rooms: {
    bedrooms: Number,
    bathrooms: Number,
    totalRooms: Number,
    livingRooms: Number,
    kitchens: Number
  },
  
  // Property features
  features: {
    furnished: Boolean,
    parking: Boolean,
    garage: Boolean,
    garden: Boolean,
    balcony: Boolean,
    terrace: Boolean,
    pool: Boolean,
    elevator: Boolean,
    airConditioning: Boolean,
    heating: Boolean,
    security: Boolean,
    internetReady: Boolean
  },
  
  // Contact information
  contact: {
    name: String,
    phone: String,
    email: String,
    isAgency: {
      type: Boolean,
      default: false
    },
    agencyName: String
  },
  
  // Images and media
  images: [{
    url: String,
    caption: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  
  // Publication information
  publication: {
    publishedAt: Date,
    updatedAt: Date,
    expiresAt: Date,
    status: {
      type: String,
      enum: ['active', 'sold', 'rented', 'expired', 'removed'],
      default: 'active'
    },
    views: {
      type: Number,
      default: 0
    }
  },
  
  // Raw data from API (for backup/debugging)
  rawData: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },
  
  // Scraping metadata
  scrapingMeta: {
    scrapedAt: {
      type: Date,
      default: Date.now
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    version: {
      type: Number,
      default: 1
    },
    source: {
      type: String,
      default: 'bigdatis'
    },
    offset: String // The pagination offset when this was scraped
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
propertySchema.index({ 'location.city': 1, propertyType: 1 });
propertySchema.index({ 'price.amount': 1, propertyType: 1 });
propertySchema.index({ 'area.total': 1 });
propertySchema.index({ 'publication.publishedAt': -1 });
propertySchema.index({ 'scrapingMeta.scrapedAt': -1 });
propertySchema.index({ transactionType: 1, propertyType: 1, 'location.city': 1 });

// Virtual for property age
propertySchema.virtual('propertyAge').get(function() {
  if (this.publication.publishedAt) {
    const now = new Date();
    const published = new Date(this.publication.publishedAt);
    const diffTime = Math.abs(now - published);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
  return null;
});

// Pre-save middleware to update lastUpdated
propertySchema.pre('save', function(next) {
  this.scrapingMeta.lastUpdated = new Date();
  next();
});

// Static method to find duplicates
propertySchema.statics.findDuplicates = function(propertyData) {
  const query = {
    $or: [
      { bigdatisId: propertyData.bigdatisId },
      {
        'location.address': propertyData.location?.address,
        'price.amount': propertyData.price?.amount,
        propertyType: propertyData.propertyType
      }
    ]
  };
  return this.findOne(query);
};

// Instance method to check if property data has changed
propertySchema.methods.hasSignificantChanges = function(newData) {
  const significantFields = ['price.amount', 'publication.status', 'area.total'];
  
  for (const field of significantFields) {
    const currentValue = this.get(field);
    const newValue = newData[field];
    
    if (currentValue !== newValue) {
      return true;
    }
  }
  
  return false;
};

// Static method to get property statistics
propertySchema.statics.getStatistics = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalProperties: { $sum: 1 },
        avgPrice: { $avg: '$price.amount' },
        minPrice: { $min: '$price.amount' },
        maxPrice: { $max: '$price.amount' },
        avgArea: { $avg: '$area.total' },
        propertyTypes: { $addToSet: '$propertyType' },
        cities: { $addToSet: '$location.city' }
      }
    }
  ]);
};

module.exports = mongoose.model('Property', propertySchema);
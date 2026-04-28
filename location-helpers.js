/**
 * Location Helper Functions
 * 
 * These helpers provide consistent location display formatting
 * while maintaining the simple architecture.
 */

/**
 * Get location text for public UI
 * Never shows raw locationId to users
 */
function getLocationText(property) {
    const location = property.location;
    
    if (!location) {
        return "Localisation non précisée";
    }
    
    // Priority: neighborhood + city > city > region > address > fallback
    if (location.neighborhood && location.city) {
        return `${location.neighborhood}, ${location.city}`;
    }
    
    if (location.city) {
        return location.city;
    }
    
    if (location.region) {
        return location.region;
    }
    
    if (location.address) {
        return location.address;
    }
    
    return "Localisation non précisée";
}

/**
 * Get detailed location for admin/debug UI
 * Shows both location text and technical ID
 */
function getAdminLocation(property) {
    const location = property.location;
    const locationText = getLocationText(property);
    const locationId = location?.locationId || 'N/A';
    
    return {
        display: locationText,
        technical: `ID: ${locationId}`,
        full: `${locationText} (${locationId})`
    };
}

/**
 * Check if location data is complete
 * Returns true if city/region/neighborhood are filled
 */
function hasCompleteLocation(property) {
    const location = property.location;
    
    if (!location) return false;
    
    return !!(location.city && location.region && location.neighborhood);
}

/**
 * Check if location needs fixing
 * Returns true if locationId exists but city/region/neighborhood are empty
 */
function needsLocationFix(property) {
    const location = property.location;
    
    if (!location) return false;
    if (!location.locationId) return false;
    
    return !location.city && !location.region && !location.neighborhood;
}

/**
 * Get location confidence level
 * Helps determine how reliable the location data is
 */
function getLocationConfidence(property) {
    const location = property.location;
    
    if (!location) return 'none';
    
    if (location.neighborhood && location.city && location.region) {
        return 'high'; // Complete data from mapping
    }
    
    if (location.city && location.region) {
        return 'medium'; // Partial data
    }
    
    if (location.address) {
        return 'low'; // Only address from title
    }
    
    return 'none';
}

/**
 * Format location for different contexts
 */
function formatLocation(property, context = 'display') {
    switch (context) {
        case 'display':
            return getLocationText(property);
        case 'admin':
            return getAdminLocation(property).full;
        case 'technical':
            return `ID: ${property.location?.locationId || 'N/A'}`;
        case 'confidence':
            return getLocationConfidence(property);
        default:
            return getLocationText(property);
    }
}

module.exports = {
    getLocationText,
    getAdminLocation,
    hasCompleteLocation,
    needsLocationFix,
    getLocationConfidence,
    formatLocation
};

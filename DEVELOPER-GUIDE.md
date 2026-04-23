# Bigdatis Scraper - Developer Handoff Guide

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Project Structure](#2-project-structure)
3. [Prerequisites & Setup](#3-prerequisites--setup)
4. [Bigdatis API Reference](#4-bigdatis-api-reference)
5. [Scraping Workflow (Phase 1 - Bulk Search)](#5-scraping-workflow-phase-1---bulk-search)
6. [Property Enhancement (Phase 2 - Detail Enrichment)](#6-property-enhancement-phase-2---detail-enrichment)
7. [Location Mapping System](#7-location-mapping-system)
8. [Database Schemas](#8-database-schemas)
9. [Running the Scraper](#9-running-the-scraper)
10. [Configuration Reference](#10-configuration-reference)
11. [Logging](#11-logging)
12. [Maintenance & Troubleshooting](#12-maintenance--troubleshooting)

---

## 1. Project Overview

### What It Does

This is a Node.js application that scrapes real estate listings (flats and houses for sale) from **Bigdatis.tn**, a Tunisian real estate aggregator platform. It collects property data across 400+ locations in four governorates: **Ariana, Ben Arous, La Manouba, and Tunis**.

### Two-Phase Data Pipeline

The scraper operates in two distinct phases:

| Phase | Description | Input | Output |
|-------|-------------|-------|--------|
| **Phase 1** - Bulk Search | Iterates through 400+ location IDs, calls the search API, collects all properties | Bigdatis search API | `properties` collection in MongoDB |
| **Phase 2** - Detail Enrichment | For each property in the DB, fetches detailed data via the show API | `properties` collection | `propertyfinals` collection in MongoDB |

### Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (>= 16) |
| HTTP Client | Axios |
| Database | MongoDB + Mongoose ODM |
| Scheduling | node-cron |
| Logging | Winston |
| Containerization | Docker (Node 20-slim) |

---

## 2. Project Structure

```
Bigdatis-Scrapper/
├── src/
│   ├── config/
│   │   ├── database.js            # MongoDB connect/disconnect functions
│   │   └── logger.js              # Winston logger with custom methods
│   ├── models/
│   │   ├── Property.js            # Phase 1 schema (raw scraped data)
│   │   └── PropertyFinal.js       # Phase 2 schema (enriched data)
│   ├── scraper/
│   │   └── BigdatisScraper.js     # Core scraping engine (Phase 1)
│   ├── scripts/
│   │   ├── enhance-properties.js  # Property enrichment engine (Phase 2)
│   │   └── location-mapper.js     # Location ID → name mapping utility
│   ├── services/
│   │   └── scheduler.js           # Cron-based scheduler service
│   ├── setup/
│   │   └── database.js            # Database initialization script
│   ├── index.js                   # Main entry point (ScrapingManager)
│   ├── scheduler.js               # Scheduler CLI entry point
│   └── test.js                    # Test utilities
├── exports/                       # Generated CSV/JSON export files
├── logs/                          # Winston log files
├── .env                           # Environment configuration (DO NOT COMMIT)
├── Dockerfile                     # Docker image definition
├── package.json                   # Dependencies and scripts
├── enhancement-progress.json      # Phase 2 resume checkpoint
├── scraping-status.json           # Scheduler run history
├── phase2-enhanced-final-results.json    # Location ID → name mapping data
├── discovered-location-ids.json          # All discovered location IDs
└── location-sample-listings.json         # Sample listing data
```

### Key Source Files

| File | Role |
|------|------|
| `src/scraper/BigdatisScraper.js` | **The core engine.** Handles API requests, pagination, data normalization, duplicate detection, and saving to DB. |
| `src/scripts/enhance-properties.js` | **Phase 2 enrichment.** Reads basic properties and calls the detail API to get richer data. |
| `src/index.js` | **Main entry point.** Orchestrates initialization, scraping, export, cleanup, and shutdown. |
| `src/scheduler.js` | **Scheduler CLI.** Starts the cron-based scheduler or runs one-off commands. |
| `src/scripts/location-mapper.js` | **Location utility.** Maps numeric location IDs to human-readable location names. |

---

## 3. Prerequisites & Setup

### Requirements

- **Node.js** >= 16.0.0
- **MongoDB** instance (local or remote)
- **npm** for package management

### Installation

```bash
# 1. Clone the project
cd Bigdatis-Scrapper

# 2. Install dependencies
npm install

# 3. Install Playwright browsers (listed as dependency but not actively used in scraping)
npx playwright install

# 4. Create your .env file (see Section 9 for all variables)
cp .env.example .env   # Or create manually

# 5. Make sure MongoDB is running
# Local: mongod --dbpath /your/data/path
# Or use a remote URI in .env

# 6. Initialize the database (optional - Mongoose auto-creates collections)
npm run setup-db

# 7. Test the database connection
npm run test-db
```

### Docker Setup

```bash
# Build the image
docker build -t bigdatis-scraper .

# Run with environment variables
docker run -d \
  --name bigdatis-scraper \
  --env-file .env \
  bigdatis-scraper
```

The Docker container runs the scheduler by default (`node src/scheduler.js start`).

---

## 4. Bigdatis API Reference

### Authentication

All API requests require a **JWT Bearer token** sent in the `Authorization` header.

```
Authorization: Bearer <your_jwt_token>
```

The token is configured via the `ACCESS_TOKEN` environment variable. The current token is a long-lived JWT — check its `exp` claim to know when it expires.

### Required Headers

The scraper mimics a browser request with these headers (see `BigdatisScraper.js:22-36`):

```
Content-Type: application/json
Authorization: Bearer ${ACCESS_TOKEN}
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...
Accept: application/json, text/plain, */*
Accept-Language: en-US,en;q=0.9,fr;q=0.8
Accept-Encoding: gzip, deflate, br
DNT: 1
Connection: keep-alive
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-origin
```

### Endpoint 1: Property Search (Phase 1)

```
POST https://server.bigdatis.tn/api/properties/search
```

**Request Payload:**

```json
{
  "filter": {
    "propertyFilters": [
      { "property": "transactionType", "values": ["sale"] },
      { "property": "propertyType", "values": ["flat", "house"] },
      { "property": "typology", "values": ["s+3", "s+1", "s+2", "s+4", "s+5", "s+6", "s+7", "s+8+"] }
    ],
    "location": {
      "id": 286,
      "additionalIds": []
    },
    "price": { "min": null, "max": null, "excludeMissing": false },
    "area": { "min": null, "max": null, "excludeMissing": false },
    "contactHasPhone": false,
    "agencies": [],
    "includedFlags": [],
    "excludedFlags": []
  },
  "orderBy": "date",
  "offset": "optional_pagination_offset"
}
```

**Key payload fields to customize:**

| Field | Description | Current Values |
|-------|-------------|----------------|
| `filter.propertyFilters[0].values` | Transaction type | `["sale"]` |
| `filter.propertyFilters[1].values` | Property types | `["flat", "house"]` |
| `filter.propertyFilters[2].values` | Room typologies | `["s+1" through "s+8+"]` |
| `filter.location.id` | Numeric location ID | Set dynamically per location |
| `filter.price.min/max` | Price range filter | `null` (no filter) |
| `filter.area.min/max` | Area range filter | `null` (no filter) |
| `orderBy` | Sort order | `"date"` |
| `offset` | Pagination cursor | Extracted from previous response |

**Response:** The response contains a property array under one of these keys: `properties`, `data`, `results`, `items`, `listings`, or `content`. The scraper checks all of them (see `extractProperties()` at line 208).

**Pagination:** The API uses cursor-based pagination via an `offset` field. The scraper tries to extract the next offset from:
1. Response keys: `nextOffset`, `next_offset`, `cursor`, `next_cursor`, `pagination`
2. Fallback: generates `{timestamp}_{propertyId}` from the last property in the response

### Endpoint 2: Property Detail (Phase 2)

```
GET https://server.bigdatis.tn/api/properties/show/{bigdatisId}
```

**Response contains enriched data:**

```json
{
  "id": 12345,
  "idsAlt": [12345, 67890],
  "sources": [
    { "sourceId": 1, "lastModified": 1700000000, "price": 250000, "sellerType": "owner" }
  ],
  "title": "Appartement S+2 ...",
  "description": "...",
  "price": 250000,
  "area": 85,
  "properties": {
    "transactionType": "sale",
    "sellerType": "owner",
    "propertyType": "flat",
    "typology": "s+2"
  },
  "flags": [],
  "thumbnailUrl": "...",
  "images": [{ "url": "...", "sourceId": 1, "adUrl": "..." }],
  "imageUrls": ["..."],
  "locationId": 286,
  "sellerTypes": ["owner"],
  "contacts": [
    { "sellerType": "owner", "contactName": "...", "active": true }
  ],
  "activeContactsCount": 1,
  "adsCount": 2,
  "activeAdsCount": 1,
  "sourcesCount": 2,
  "activeSourcesCount": 1,
  "firstSeenAt": 1700000000,
  "createdAt": 1700000000,
  "modifiedAt": 1700000000,
  "priceDroppedAt": null,
  "timestamp": 1700000000,
  "priceTimestamp": 1700000000,
  "comments": [],
  "commentsCount": 0
}
```

### Rate Limiting & Anti-Detection

The scraper implements several strategies to avoid being blocked (see `BigdatisScraper.js`):

| Strategy | Implementation | Config |
|----------|---------------|--------|
| **Base delay** | Wait between requests | `REQUEST_DELAY` (default: 1000ms) |
| **Random jitter** | ±30% variation on every delay | Hardcoded in `sleep()` method |
| **Inter-location delay** | 2x base delay between locations | `this.delay * 2` |
| **Exponential backoff** | On failure: `delay * (retryCount + 1)` | Up to `MAX_RETRIES` (default: 3) |
| **Phase 2 delay** | Higher delay for detail API calls | Default: 2000ms |
| **Timeout** | Max wait for API response | `TIMEOUT` (default: 30000ms) |

---

## 5. Scraping Workflow (Phase 1 - Bulk Search)

### Flow Diagram

```
Start
  │
  ├── Connect to MongoDB
  ├── Initialize BigdatisScraper
  │
  ├── For each location ID (400+ locations):
  │     │
  │     ├── Build search payload with location.id = currentLocationId
  │     ├── Set offset = null (first page)
  │     │
  │     ├── PAGINATION LOOP:
  │     │     ├── POST to /api/properties/search with payload + offset
  │     │     ├── Extract properties from response
  │     │     │
  │     │     ├── If no properties:
  │     │     │     ├── Increment consecutiveEmptyPages counter
  │     │     │     ├── If >= 7 empty pages → BREAK (next location)
  │     │     │     └── Try to extract nextOffset, if none → BREAK
  │     │     │
  │     │     ├── For each property in response:
  │     │     │     ├── Check session duplicates (in-memory Set)
  │     │     │     ├── Check database duplicates (Property.findOne)
  │     │     │     └── If new → add to batch
  │     │     │
  │     │     ├── Normalize property data (raw API → schema format)
  │     │     ├── Save batch to MongoDB
  │     │     ├── Extract next offset
  │     │     ├── If no next offset → BREAK
  │     │     ├── If maxPages reached → BREAK
  │     │     └── Sleep (delay with jitter) → continue loop
  │     │
  │     ├── Log location stats
  │     └── Sleep (delay * 2) → next location
  │
  ├── Export to JSON/CSV (if enabled)
  ├── Log final statistics
  └── Disconnect from MongoDB
```

### Target Locations

The scraper targets 400+ hardcoded location IDs in `BigdatisScraper.js:92-106`, organized by governorate:

| Governorate | Approx. Count | Example IDs |
|-------------|---------------|-------------|
| Ariana | ~80 | 286, 287, 290, ... 5386 |
| Ben Arous | ~84 | 804, 805, 811, ... 5325 |
| La Manouba | ~27 | 2321, 2323, 2330, ... 5333 |
| Tunis | ~155 | 4808, 4809, 4812, ... 5385 |

To add new locations, edit the `getTargetLocationIds()` method in `BigdatisScraper.js`.

### Data Normalization

Raw API properties are normalized into a structured format by `normalizePropertyData()` (line 310). Key transformations:

- **Property type mapping**: `apartment`/`appartement` → `flat`, `villa`/`maison` → `house`
- **Price parsing**: Strips non-numeric characters, converts to number
- **Boolean parsing**: Handles `true`/`yes`/`oui`/`1` in multiple languages
- **ID extraction**: Checks `id`, `_id`, `propertyId`, `listing_id` fields
- **Coordinates**: Extracted from multiple possible nested paths
- **Features**: 12 boolean features extracted (furnished, parking, pool, etc.)

### Duplicate Detection

Two levels of duplicate detection (see `scrapeLocationProperties()` at line 644):

1. **Session-level** (fast): In-memory `Set` of property IDs seen in the current run
2. **Database-level**: `Property.findOne({ bigdatisId })` query for each property

If a duplicate is found in the DB and has **significant changes** (price, status, or area), the record is updated with an incremented version number.

---

## 6. Property Enhancement (Phase 2 - Detail Enrichment)

### Purpose

Phase 2 takes each property from the `properties` collection and fetches richer data from the individual property detail endpoint (`/api/properties/show/{id}`), storing the result in the `propertyfinals` collection.

### How to Run

```bash
# Phase 2 is run via the enhance-properties.js script
node src/scripts/enhance-properties.js
```

### Flow

1. Connect to MongoDB
2. Load location mappings from `phase2-enhanced-final-results.json`
3. Load resume checkpoint from `enhancement-progress.json` (if exists)
4. Query all properties from `properties` collection (sorted by `bigdatisId`)
5. For each property:
   - Skip if already exists in `propertyfinals`
   - Call `GET /api/properties/show/{bigdatisId}`
   - Map `locationId` to a human-readable name via `LocationMapper`
   - Save enriched record to `propertyfinals`
   - If API call fails, save a partial record with error metadata
6. Save progress checkpoint every 50 properties
7. Log final statistics

### Resumability

Phase 2 is resumable. Progress is saved to `enhancement-progress.json` with the `lastProcessedId`. On restart, it picks up from where it left off by querying `{ bigdatisId: { $gt: lastProcessedId } }`.

### Location Mapper

The `LocationMapper` class (`src/scripts/location-mapper.js`) reads `phase2-enhanced-final-results.json` to map numeric location IDs to human-readable names (e.g., `286` → `"Ariana Ville, Ariana, Ariana"`).

Methods available:
- `getLocationName(locationId)` → returns name string or null
- `getLocationInfo(locationId)` → returns `{ id, name, propertyCount, extractedAt }`
- `searchLocationsByName(searchTerm)` → partial match search
- `getLocationsByRegion(region)` → filter by governorate
- `batchMapLocations(locationIds)` → bulk mapping

---

## 7. Location Mapping System

### Overview

Bigdatis uses **numeric location IDs** (e.g., `286`) to identify neighborhoods across Tunisia. The scraper maintains a mapping system that translates these IDs into human-readable location names (e.g., `"Ariana Centre, Ariana Ville, Ariana"`).

### Data Files

| File | Description |
|------|-------------|
| `discovered-location-ids.json` | Raw list of **924 location IDs** discovered from Bigdatis. Generated by scraping the site's location data. |
| `phase2-enhanced-final-results.json` | **The main mapping file.** Contains 924 IDs with 693 successful name mappings (75% success rate). |

### Mapping Statistics

```
Total Location IDs:    924
Successfully Mapped:   693 (75%)
Failed Mappings:       231 (25%)
Generated On:          2025-08-09
```

### Mapping Data Structure

Each entry in `phase2-enhanced-final-results.json` → `locationMappings` has:

```json
{
  "286": {
    "id": "286",
    "name": "Ariana Centre, Ariana Ville, Ariana",
    "propertyCount": 20,
    "sampleListingId": 1087493,
    "sampleTitle": "Apparemment s+3 a vendre",
    "extractedAt": "2025-08-09T01:24:07.744Z"
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | The numeric location ID (string) |
| `name` | Human-readable name: **"Neighborhood, Delegation, Governorate"** |
| `propertyCount` | Number of properties found at this location during mapping |
| `sampleListingId` | An example listing ID for reference/verification |
| `sampleTitle` | Title of the sample listing |
| `extractedAt` | When this mapping was extracted |

### Name Format

Location names follow a **3-part comma-separated format**:

```
Neighborhood, Delegation (City), Governorate
```

Examples:
- `"Ariana Centre, Ariana Ville, Ariana"` → neighborhood in Ariana Ville delegation, Ariana governorate
- `"El Mourouj, El Mourouj, Ben Arous"` → El Mourouj delegation, Ben Arous governorate
- `"Montplaisir, Bab Bhar, Tunis"` → Montplaisir neighborhood, Bab Bhar delegation, Tunis governorate

### Sample Mappings Across Governorates

| ID | Name | Governorate |
|----|------|-------------|
| 286 | Ariana Centre, Ariana Ville, Ariana | Ariana |
| 299 | Cité Ennasr 1, Ariana Ville, Ariana | Ariana |
| 310 | El Menzah 7, Ariana Ville, Ariana | Ariana |
| 346 | Borj Louzir, La Soukra, Ariana | Ariana |
| 804 | Ben Arous Ville, Ben Arous, Ben Arous | Ben Arous |
| 879 | El Mourouj, El Mourouj, Ben Arous | Ben Arous |
| 909 | Cité El Bassatine Ancien, Boumhel El Bassatine, Ben Arous | Ben Arous |
| 2321 | Borj El Amri, Borj El Amri, La Manouba | La Manouba |
| 2350 | Denden, La Manouba, La Manouba | La Manouba |
| 4808 | Bab Bhar, Bab Bhar, Tunis | Tunis |
| 4812 | Montplaisir, Bab Bhar, Tunis | Tunis |
| 4830 | Bab Saadoun, Bab Souika, Tunis | Tunis |

### LocationMapper Class API

**File:** `src/scripts/location-mapper.js`

The `LocationMapper` class provides a full API for working with location mappings:

```javascript
const LocationMapper = require('./src/scripts/location-mapper');

const mapper = new LocationMapper();
// Optionally pass custom path: new LocationMapper('/path/to/mappings.json')

// Load mappings (required before any other method)
await mapper.loadMappings();

// Get a location name by ID
mapper.getLocationName(286);
// → "Ariana Centre, Ariana Ville, Ariana"

// Get full location info
mapper.getLocationInfo(286);
// → { id: "286", name: "Ariana Centre, ...", propertyCount: 20, extractedAt: "..." }

// Search locations by partial name
mapper.searchLocationsByName("Ennasr");
// → [{ locationId: "299", name: "Cité Ennasr 1, ...", ... }, ...]

// Get all locations in a governorate
mapper.getLocationsByRegion("Ariana");
// → [{ locationId: "286", ... }, { locationId: "287", ... }, ...]

// Bulk map multiple IDs at once
mapper.batchMapLocations([286, 804, 9999]);
// → { mapped: [{locationId: "286", locationName: "..."}, ...], notFound: ["9999"], total: 3 }

// Check if a location exists
mapper.hasLocation(286);   // → true
mapper.hasLocation(99999); // → false

// Get all known location IDs
mapper.getAllLocationIds();    // → ["286", "287", "290", ...]
mapper.getAllLocationNames();  // → ["Ariana Centre, ...", ...]

// Validate the mapping file structure
await mapper.validateMappingFile();
// → { isValid: true, errors: [], stats: { mappingCount: 924, ... } }

// Export mappings to a different format
await mapper.exportMappings('./locations.csv', 'csv');
await mapper.exportMappings('./locations.json', 'json');

// Reload mappings (useful during development)
await mapper.reloadMappings();

// Get stats
mapper.getStats();
// → { totalMappings: 693, successfulMappings: 693, failedMappings: 0, isLoaded: true, ... }
```

### Adding New Location Mappings

To add a new location mapping manually:

1. Open `phase2-enhanced-final-results.json`
2. Add an entry under `locationMappings`:
   ```json
   "NEW_ID": {
     "id": "NEW_ID",
     "name": "Neighborhood, Delegation, Governorate",
     "propertyCount": 0,
     "sampleListingId": null,
     "sampleTitle": null,
     "extractedAt": "2025-01-01T00:00:00.000Z"
   }
   ```
3. Update the `summary.totalLocationIds` and `summary.successfulMappings` counts

To discover new location IDs programmatically, inspect the Bigdatis website's network requests when navigating to different areas — the `location.id` field in search requests reveals the ID for each area.

### Known Limitation: Failed Mappings

231 out of 924 location IDs (25%) failed to map to a name. Some entries have incorrect names like `"s+8+, Typologie"` (location ID 308, 309) — these are mapping errors where a typology filter was captured instead of an actual location name. These should be manually corrected or re-scraped if accurate names are needed.

---

## 8. Database Schemas

### Collection: `properties` (Phase 1)

**Model file:** `src/models/Property.js`

```
{
  bigdatisId:      String (unique, indexed)
  title:           String
  description:     String
  propertyType:    String (enum: flat, house, villa, apartment, studio, office, commercial, land)
  transactionType: String (enum: sale, rent)
  typology:        String (e.g., "s+2")

  location: {
    city:          String
    region:        String
    neighborhood:  String
    address:       String
    coordinates:   { latitude: Number, longitude: Number }
    locationId:    String
  }

  price: {
    amount:              Number
    currency:            String (default: "TND")
    pricePerSquareMeter: Number
    negotiable:          Boolean
  }

  area: {
    total: Number, built: Number, land: Number, unit: String (default: "m2")
  }

  rooms: {
    bedrooms: Number, bathrooms: Number, totalRooms: Number,
    livingRooms: Number, kitchens: Number
  }

  features: {
    furnished: Bool, parking: Bool, garage: Bool, garden: Bool,
    balcony: Bool, terrace: Bool, pool: Bool, elevator: Bool,
    airConditioning: Bool, heating: Bool, security: Bool, internetReady: Bool
  }

  contact:     { name, phone, email, isAgency, agencyName }
  images:      [{ url, caption, isPrimary }]
  publication: { publishedAt, updatedAt, expiresAt, status, views }
  rawData:     Mixed (full original API response for debugging)

  scrapingMeta: {
    scrapedAt:   Date
    lastUpdated: Date
    version:     Number (incremented on updates)
    source:      String (default: "bigdatis")
    offset:      String (pagination offset when scraped)
  }
}
```

**Indexes:**
- `bigdatisId` (unique)
- `location.city` + `propertyType`
- `price.amount` + `propertyType`
- `area.total`
- `publication.publishedAt` (descending)
- `scrapingMeta.scrapedAt` (descending)
- `transactionType` + `propertyType` + `location.city`

**Static methods:**
- `Property.findDuplicates(propertyData)` — finds by bigdatisId OR (address + price + type)
- `Property.getStatistics()` — aggregation for total count, avg/min/max price, avg area, etc.

**Instance methods:**
- `property.hasSignificantChanges(newData)` — checks if price, status, or area changed

### Collection: `propertyfinals` (Phase 2)

**Model file:** `src/models/PropertyFinal.js`

```
{
  bigdatisId:   String (unique, indexed)

  enhancedData: {
    id, idsAlt, sources[], title, description, price, area,
    properties: { transactionType, sellerType, propertyType, typology },
    flags[], thumbnailUrl, images[], imageUrls[],
    locationId, sellerTypes[], contacts[],
    activeContactsCount, adsCount, activeAdsCount,
    sourcesCount, activeSourcesCount,
    firstSeenAt, createdAt, modifiedAt,
    priceDroppedAt, timestamp, priceTimestamp,
    comments[], commentsCount
  }

  locationInfo: {
    locationId:    String
    locationName:  String (mapped human-readable name)
    mappingSource: String
    mappedAt:      Date
  }

  processingMeta: {
    originalPropertyId:  ObjectId (ref: Property)
    enhancedAt:          Date
    apiResponseReceived: Boolean
    locationMapped:      Boolean
    apiCallTimestamp:     Date
    version:             Number
    errors:              [{ type, timestamp, details }]
  }

  computedFields: {
    pricePerSquareMeter:    Number (auto-computed on save)
    daysSinceFirstSeen:     Number (auto-computed on save)
    daysSinceCreated:       Number (auto-computed on save)
    daysSinceModified:      Number (auto-computed on save)
    hasPriceDrop:           Boolean
    isActivelyAdvertised:   Boolean
    sellerTypePrimary:      String
    hasMultipleContacts:    Boolean
    imageCount:             Number
    hasDescription:         Boolean
  }
}
```

The `computedFields` are automatically calculated in a Mongoose `pre('save')` middleware.

**Static methods:**
- `PropertyFinal.getEnhancementStatistics()` — aggregation with rates and counts
- `PropertyFinal.findByLocation(locationName)` — case-insensitive search
- `PropertyFinal.findRecentPriceDrops(days)` — find properties with recent price drops

**Virtual fields:**
- `propertyUrl` → `https://bigdatis.tn/details/vente/u{bigdatisId}`
- `enhancedPropertyAge` → days since `enhancedData.createdAt`

---

## 9. Running the Scraper

### NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run a single Phase 1 scraping session |
| `npm run dev` | Run with nodemon (auto-restart on file changes) |
| `npm run scheduler` | Start the cron scheduler (runs repeatedly) |
| `npm run scheduler:test` | Run a single manual scraping session via scheduler |
| `npm run scheduler:status` | Display scheduler status and statistics |
| `npm run scheduler:help` | Show available scheduler commands |
| `npm test` | Run test suite |
| `npm run test-db` | Test MongoDB connection |
| `npm run setup-db` | Initialize database schema |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |

### CLI Commands (via index.js)

```bash
# Full scrape (all locations, all pages)
node src/index.js scrape

# Scrape with page limit per location
node src/index.js scrape 5

# Test run (2 pages only, no export)
node src/index.js test

# Show database statistics
node src/index.js stats

# Clean up old expired/removed properties (default: 30 days)
node src/index.js cleanup

# Clean up properties older than 60 days
node src/index.js cleanup 60
```

### Scheduler Commands

```bash
# Start the cron scheduler (runs every 30 minutes by default)
node src/scheduler.js start

# Run a single manual test
node src/scheduler.js test

# Check scheduler status
node src/scheduler.js status

# Show help
node src/scheduler.js help
```

The scheduler:
- Prevents concurrent runs (checks `isRunning` flag)
- Tracks run history in `scraping-status.json`
- Logs status every 10 minutes
- Handles SIGINT/SIGTERM for clean shutdown
- Timezone: `Africa/Tunis`

---

## 10. Configuration Reference

All configuration is via the `.env` file in the project root.

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/bigdatis_properties` | MongoDB connection string |
| `DB_NAME` | `bigdatis_properties` | Database name |
| `BIGDATIS_API_URL` | `https://server.bigdatis.tn/api/properties/search` | Phase 1 search endpoint |
| `ACCESS_TOKEN` | *(required)* | JWT Bearer token for Bigdatis API authentication |
| `REQUEST_DELAY` | `1000` | Milliseconds between API requests |
| `MAX_RETRIES` | `3` | Number of retry attempts on API failure |
| `TIMEOUT` | `30000` | API request timeout in milliseconds |
| `BATCH_SIZE` | `50` | Properties per database batch |
| `MAX_PAGES_PER_RUN` | `100` | Max pagination pages per location (null = unlimited) |
| `ENABLE_DUPLICATES_CHECK` | `true` | Enable/disable duplicate detection |
| `LOG_LEVEL` | `info` | Winston log level (debug, info, warn, error) |
| `LOG_FILE` | `logs/scraper.log` | Primary log file path |
| `NODE_ENV` | `development` | Environment (development/production) |
| `SCRAPE_SCHEDULE` | `*/30 * * * *` | Cron schedule expression |
| `EXPORT_CSV` | `true` | Enable CSV export after scraping |
| `EXPORT_JSON` | `true` | Enable JSON export after scraping |
| `EXPORT_DIRECTORY` | `exports` | Directory for export files |

---

## 11. Logging

### Log Files

| File | Content | Max Size | Max Files |
|------|---------|----------|-----------|
| `logs/scraper.log` | All logs | 5 MB | 5 |
| `logs/error.log` | Errors only | 5 MB | 3 |
| `logs/scraping.log` | Scraping activity (filtered) | 10 MB | 7 |
| `logs/exceptions.log` | Uncaught exceptions | - | - |
| `logs/rejections.log` | Unhandled promise rejections | - | - |

### Custom Log Methods

The logger (`src/config/logger.js`) exposes specialized methods:

```javascript
logger.scrapingInfo(message, metadata)    // Scraping progress
logger.scrapingError(message, error, meta) // Scraping errors with stack traces
logger.apiRequest(url, method, metadata)   // Log outgoing API calls
logger.apiResponse(url, status, responseTime, meta) // Log API responses
logger.databaseAction(action, collection, count, meta) // DB operations
logger.performance(operation, duration, meta) // Performance metrics
logger.memoryUsage()                       // Current memory snapshot
```

### Console Output

- **Development** (`NODE_ENV=development`): logs at `debug` level with colors
- **Production** (`NODE_ENV=production`): logs at `warn` level only

---

## 12. Maintenance & Troubleshooting

### Token Expiry

The JWT token in `ACCESS_TOKEN` has an expiration date. If the scraper starts getting `401 Unauthorized` responses:

1. Go to [bigdatis.tn](https://bigdatis.tn) and log in
2. Open browser DevTools → Network tab
3. Trigger a property search on the website
4. Find the request to `/api/properties/search`
5. Copy the `Authorization: Bearer ...` token from the request headers
6. Update `ACCESS_TOKEN` in your `.env` file

### Adding New Locations

To scrape additional locations:

1. Find the location ID on bigdatis.tn (inspect network requests when selecting a location)
2. Add the ID to the appropriate array in `BigdatisScraper.js:92-106` (`getTargetLocationIds()`)
3. Optionally update `phase2-enhanced-final-results.json` with the location name mapping

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Expired JWT token | Update `ACCESS_TOKEN` in `.env` |
| `429 Too Many Requests` | Rate limited by API | Increase `REQUEST_DELAY` |
| `ECONNREFUSED` on MongoDB | MongoDB not running | Start MongoDB service |
| `ETIMEDOUT` | API timeout | Increase `TIMEOUT` or check network |
| `Duplicate key error` | Property already exists with same bigdatisId | Normal — the scraper handles this gracefully |
| Empty responses for all locations | API may have changed | Check API manually with curl/Postman |

### Monitoring Scraping Health

```bash
# Check recent errors
tail -f logs/error.log

# Watch scraping progress in real-time
tail -f logs/scraping.log

# Check scheduler status
node src/scheduler.js status

# Get database statistics
node src/index.js stats
```

### Manual API Testing

You can test the API directly with curl:

```bash
# Phase 1: Search
curl -X POST https://server.bigdatis.tn/api/properties/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "filter": {
      "propertyFilters": [
        {"property": "transactionType", "values": ["sale"]},
        {"property": "propertyType", "values": ["flat"]},
        {"property": "typology", "values": ["s+2"]}
      ],
      "location": {"id": 286, "additionalIds": []},
      "price": {"min": null, "max": null, "excludeMissing": false},
      "area": {"min": null, "max": null, "excludeMissing": false},
      "contactHasPhone": false,
      "agencies": [],
      "includedFlags": [],
      "excludedFlags": []
    },
    "orderBy": "date"
  }'

# Phase 2: Property Detail
curl -X GET https://server.bigdatis.tn/api/properties/show/12345 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: application/json"
```

### Customizing the Search Filters

To scrape different property types or transaction types, modify `basePayload` in `BigdatisScraper.js:40-76`:

- Change `transactionType` values to `["rent"]` for rentals
- Change `propertyType` values to include `["villa", "land", "office"]`
- Add `price.min`/`price.max` to filter by price range
- Add `area.min`/`area.max` to filter by area

### Data Export Location

Exports are saved to the `exports/` directory with timestamped filenames:
- `bigdatis_properties_2025-01-15T10-30.json`
- `bigdatis_properties_2025-01-15T10-30.csv`

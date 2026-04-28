# Bigdatis Scraper - Production Setup

## Essential Files Only
- `src/` - Scraper source code
- `package.json` - Dependencies
- `.env` - Environment variables
- `check-test-db.js` - Verify database status
- `update-existing-properties.js` - Update properties if needed

## Quick Commands
```bash
# Check database status
node check-test-db.js

# Run scraper
npm start

# Update existing properties (if needed)
node update-existing-properties.js
```

## Database Connection
- Database: `test` (MongoDB Atlas)
- Total Properties: 12,267
- Properties with Images: 88%
- Properties with Contacts: 100%

## Integration Ready
The scraper is production-ready for NestJS integration via MongoDB queries.

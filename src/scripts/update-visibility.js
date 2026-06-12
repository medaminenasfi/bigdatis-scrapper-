require('dotenv').config();

const mongoose = require('mongoose');
const Property = require('../models/Property');
const logger = require('../config/logger');
const { applyVisibilityToPublication } = require('../utils/visibility');

async function updateVisibility() {
    console.log(`\n======================================================`);
    console.log(`🏷️  BIGDATIS VISIBILITY MIGRATION`);
    console.log(`======================================================\n`);

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ Connected to MongoDB.`);

    const cursor = Property.find({ 'scrapingMeta.source': 'bigdatis' })
        .select('publication')
        .lean()
        .cursor();

    const bulkOps = [];
    let scanned = 0;
    let updated = 0;
    let publicCount = 0;
    let archived = 0;
    let pendingValidation = 0;

    async function flushBulkOps() {
        if (bulkOps.length === 0) {
            return;
        }

        const ops = bulkOps.splice(0, bulkOps.length);
        const result = await Property.bulkWrite(ops, { ordered: false });
        updated += result.modifiedCount || 0;
    }

    for await (const property of cursor) {
        scanned += 1;

        const publication = property.publication || {};
        const computedPublication = applyVisibilityToPublication(publication);

        if (computedPublication.visibility === 'public') {
            publicCount += 1;
        } else if (computedPublication.visibility === 'archived') {
            archived += 1;
        } else {
            pendingValidation += 1;
        }

        const shouldUpdate =
            publication.visibility !== computedPublication.visibility ||
            String(publication.archivedAt || '') !== String(computedPublication.archivedAt || '');

        if (shouldUpdate) {
            const updateDoc = {
                $set: {
                    'publication.visibility': computedPublication.visibility
                }
            };

            if (computedPublication.archivedAt) {
                updateDoc.$set['publication.archivedAt'] = computedPublication.archivedAt;
            } else {
                updateDoc.$unset = { 'publication.archivedAt': '' };
            }

            bulkOps.push({
                updateOne: {
                    filter: { _id: property._id },
                    update: updateDoc
                }
            });
        }

        if (bulkOps.length >= 1000) {
            await flushBulkOps();
        }
    }

    await flushBulkOps();

    console.log(`\n================ MIGRATION RESULT ================`);
    console.log(`Scanned BigDatis listings:       ${scanned}`);
    console.log(`Updated records:                ${updated}`);
    console.log(`Public now:                     ${publicCount}`);
    console.log(`Archived now:                   ${archived}`);
    console.log(`Pending validation now:         ${pendingValidation}`);
    console.log(`===================================================\n`);

    await mongoose.disconnect();
    console.log(`🔌 Disconnected from DB.`);
}

updateVisibility().catch(async (error) => {
    logger.error('Visibility migration failed:', error);
    try {
        await mongoose.disconnect();
    } catch (disconnectError) {
        logger.warn('Failed to disconnect cleanly:', disconnectError.message);
    }
    process.exit(1);
});
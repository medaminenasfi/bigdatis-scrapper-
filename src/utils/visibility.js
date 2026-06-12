const DEFAULT_CUTOFF_MONTHS = 6;
const MIN_VALID_DATE = 946684800000;

function getCutoffDate(referenceDate = new Date(), months = DEFAULT_CUTOFF_MONTHS) {
  const cutoffDate = new Date(referenceDate);
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  return cutoffDate;
}

function parseValidDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() < MIN_VALID_DATE) {
    return null;
  }

  return date;
}

function computeVisibility(publication = {}, referenceDate = new Date(), months = DEFAULT_CUTOFF_MONTHS) {
  const publishedAt = parseValidDate(publication.publishedAt);
  const cutoffDate = getCutoffDate(referenceDate, months);

  if (!publishedAt) {
    return {
      visibility: 'pending_validation',
      archivedAt: null,
      publishedAt: null,
      cutoffDate
    };
  }

  if (publishedAt < cutoffDate) {
    return {
      visibility: 'archived',
      archivedAt: publication.archivedAt || new Date(referenceDate),
      publishedAt,
      cutoffDate
    };
  }

  return {
    visibility: 'public',
    archivedAt: null,
    publishedAt,
    cutoffDate
  };
}

function applyVisibilityToPublication(publication = {}, referenceDate = new Date(), months = DEFAULT_CUTOFF_MONTHS) {
  const computedVisibility = computeVisibility(publication, referenceDate, months);

  return {
    ...publication,
    publishedAt: computedVisibility.publishedAt,
    visibility: computedVisibility.visibility,
    archivedAt: computedVisibility.archivedAt
  };
}

function buildPublicListingQuery(baseQuery = {}) {
  return {
    ...baseQuery,
    'publication.visibility': 'public'
  };
}

module.exports = {
  DEFAULT_CUTOFF_MONTHS,
  getCutoffDate,
  parseValidDate,
  computeVisibility,
  applyVisibilityToPublication,
  buildPublicListingQuery
};
'use strict';

// Reserve time for each uncached TV lookup, after the local catalogue pass.
// Anime enrichment has its own short phase and cannot consume this reserve.
function csvTvBudget(count, override) {
  const requested = Number(override);
  if (Number.isFinite(requested) && requested > 0) return Math.max(1000, Math.min(180000, requested));
  return Math.max(30000, Math.min(180000, Math.ceil(Math.max(0, Number(count) || 0)) * 560 + 12000));
}

function csvPreviewDecision(item, previous) {
  if (previous?.state === 'dismissed') {
    if (item.classification === 'non_anime') {
      return {...item, importExcluded: true, reviewState: 'dismissed'};
    }
    return {...item, classification: 'ignored', importExcluded: true,
      reason: 'Écartée manuellement lors d’une analyse BetaSeries précédente.', reviewState: 'dismissed'};
  }
  return {...item, importExcluded: item.classification !== 'anime',
    ...(previous?.state === 'auto_excluded' ? {reviewState: 'auto_excluded'} : {})};
}

module.exports = {csvTvBudget, csvPreviewDecision};

'use strict';

function mountIndependentCatalogue(app, {catalogue, db, readAnimes, writeAnimes}) {
  app.get('/api/independent-catalogue', (req, res) => {
    try { res.json({ok: true, ...catalogue.search(req.query.q, req.query)}); }
    catch (error) { res.status(503).json({ok: false, code: error.code || 'ALM_CATALOGUE_UNAVAILABLE'}); }
  });
  app.post('/api/independent-catalogue/add', async (req, res) => {
    try {
      await db.whenReady();
      const row = catalogue.get(String(req.body?.catalogueId || ''));
      if (!row) return res.status(404).json({code: 'ALM_CATALOGUE_MISSING'});
      const items = readAnimes();
      // An exact catalogue id may be reused. A title alone is never proof that
      // an imported MAL series and a Wikidata entity are the same season.
      const existing = items.find(item => item.catalogueId === row.id);
      if (existing) return res.json({ok: true, existing: true, id: existing.id});
      const id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
      if (!Number.isSafeInteger(id)) throw Error('ALM_LIBRARY_ID_LIMIT');
      const anime = {id, catalogueId: row.id, title: row.title, canonicalTitle: row.title,
        localizedTitles: {...row.titles}, episodesTotal: row.episodes ? String(row.episodes) : '',
        episodesSeen: '0', status: 'Plan to Watch', score: '', notes: '', tags: [], type: '',
        source: 'Wikidata', metadataSource: 'Wikidata', manualMetadata: true, autoInfo: false,
        provenance: {source: row.sourceUrl, license: row.license}};
      writeAnimes([...items, anime]);
      const persisted = readAnimes().find(item => item.id === id && item.catalogueId === row.id);
      if (!persisted) throw Error('ALM_LIBRARY_WRITE_UNCONFIRMED');
      res.json({ok: true, existing: false, id});
    } catch (error) { res.status(503).json({code: error.code || error.message || 'ALM_LIBRARY_WRITE_FAILED'}); }
  });
}

module.exports = {mountIndependentCatalogue};

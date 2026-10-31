'use strict';

// One refresh for every reader. Successful feeds are visible before slow feeds finish.
function createNewsRefresh({ collect, publish, finish, totalSources = 0, onError = () => {} }) {
  let active = null;
  let state = { pending: false, completedSources: 0, totalSources, revision: 0 };
  return {
    snapshot: () => ({ ...state }),
    start(options = {}) {
      if (active) return active;
      state = { pending: true, completedSources: 0, totalSources, revision: state.revision, startedAt: new Date().toISOString() };
      let publishError = null;
      active = Promise.resolve().then(() => collect({ ...options, onSource({ items }) {
        if (items.length && !publishError) {
          try { const result = publish(items); if (result?.ok === false) throw Error('ALM_NEWS_WRITE_FAILED'); state.revision++; }
          catch (error) { publishError = error; }
        }
        state.completedSources++;
      } })).then(batch => { if (publishError) throw publishError; return finish(batch); }).then(result => {
        state = { ...state, ...result, pending: false };
        return result;
      }).catch(error => {
        state = { ...state, pending: false, error: error.message };
        onError(error);
        return { attempted: true, cached: true, error: error.message };
      }).finally(() => { active = null; });
      return active;
    }
  };
}
module.exports = { createNewsRefresh };

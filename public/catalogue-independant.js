'use strict';
(() => {
  const query = document.getElementById('catalogue-query');
  const status = document.getElementById('catalogue-status');
  const results = document.getElementById('catalogue-results');
  const more = document.getElementById('catalogue-more');
  let generation = 0, timer, offset = 0;
  function card(row) {
    const article = document.createElement('article'); article.className = 'rescue-card';
    const heading = document.createElement('h2'); heading.textContent = row.titles.fr || row.title;
    const details = document.createElement('p');
    details.textContent = row.episodes ? row.episodes + ' épisodes déclarés · à vérifier par saison' : 'Nombre d’épisodes à préciser';
    const provenance = document.createElement('a'); provenance.textContent = 'Source : Wikidata · CC0';
    provenance.href = row.sourceUrl; provenance.target = '_blank'; provenance.rel = 'noopener noreferrer';
    const add = document.createElement('button'); add.textContent = 'Ajouter à voir';
    add.addEventListener('click', async () => {
      add.disabled = true;
      try {
        const response = await fetch('/api/independent-catalogue/add', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({catalogueId: row.id})});
        const data = await response.json();
        if (!response.ok || !data.ok) throw Error();
        add.textContent = data.existing ? 'Déjà dans la bibliothèque' : 'Ajouté à la bibliothèque';
      } catch { add.disabled = false; add.textContent = 'Échec de l’ajout · réessayer'; }
    });
    article.append(heading, details, provenance, add); return article;
  }
  async function search(append = false) {
    const id = ++generation;
    if (!append) offset = 0;
    status.textContent = 'Recherche locale…'; more.hidden = true;
    try {
      const params = new URLSearchParams({q: query.value, limit: '30', offset: String(offset)});
      const response = await fetch('/api/independent-catalogue?' + params);
      const data = await response.json();
      if (id !== generation) return;
      if (!response.ok || !data.ok) throw Error();
      if (!append) results.replaceChildren();
      results.append(...data.items.map(card)); offset += data.items.length;
      status.textContent = data.version ? data.total + ' fiches trouvées · échantillon ' + data.version : 'Aucun échantillon installé. Consulter les instructions de cette branche pour préparer le catalogue.';
      more.hidden = offset >= data.total;
    } catch {
      if (id !== generation) return;
      if (!append) results.replaceChildren();
      status.textContent = 'Catalogue indisponible. La bibliothèque personnelle reste accessible.';
    }
  }
  query.addEventListener('input', () => { generation++; clearTimeout(timer); timer = setTimeout(() => search(), 180); });
  more.addEventListener('click', () => search(true));
  search();
})();

(() => {
  "use strict";

  const SUPPORTED = Object.freeze(["fr", "en", "ja", "es", "de", "pt-BR", "zh-CN"]);
  const META = Object.freeze({
    fr: { label: "Français", flag: "🇫🇷" },
    en: { label: "English", flag: "🇬🇧" },
    ja: { label: "日本語", flag: "🇯🇵" },
    es: { label: "Español", flag: "🇪🇸" },
    de: { label: "Deutsch", flag: "🇩🇪" },
    "pt-BR": { label: "Português (Brasil)", flag: "🇧🇷" },
    "zh-CN": { label: "中文（简体）", flag: "🇨🇳" }
  });
  const STORAGE_KEY = "alm-language";
  const originals = new WeakMap();
  const attrOriginals = new WeakMap();
  const lastAppliedTexts = new WeakMap();
  const lastAppliedAttrs = new WeakMap();
  const localeCache = new Map();
  let current = "fr";
  let english = { strings: {}, placeholders: {}, titles: {} };
  let active = { strings: {}, placeholders: {}, titles: {} };
  let translating = false;
  let observer = null;
  let dynamicPrefixes = [];
  let templateRules = [];
  let languageRequest = 0;
  let persistQueue = Promise.resolve();
  const protectedSelector = [
    'script', 'style', 'textarea', '[contenteditable="true"]', '[translate="no"]', '[data-no-i18n]',
    '.donation-karaoke-active', '.donation-karaoke-context',
    '.news-hero-title', '.news-hero-summary', '.news-card-v3-title', '.news-card-v3-summary',
    '.news-reader-text', '.news-preview-title', '.news-preview-summary',
    '.reco-card-title', '.reco-pick-card span', '.anime-title', '.card-title', '.anime-notes'
  ].join(',');
  function isProtected(node) {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(el?.closest?.(protectedSelector));
  }
  function preserveOptionValue(element) {
    if (element?.tagName === "OPTION" && !element.hasAttribute("value")) {
      element.setAttribute("value", element.textContent);
    }
  }


  function normalizeLocale(value) {
    const raw = String(value || "").trim().replace(/_/g, "-");
    const lower = raw.toLowerCase();
    if (lower.startsWith("pt-br") || lower === "pt") return "pt-BR";
    if (lower.startsWith("fr")) return "fr";
    if (lower.startsWith("en")) return "en";
    if (lower.startsWith("ja")) return "ja";
    if (lower.startsWith("es")) return "es";
    if (lower.startsWith("de")) return "de";
    if (lower === "zh" || lower.startsWith("zh-cn") || lower.startsWith("zh-hans")) return "zh-CN";
    return "en";
  }

  async function loadLocale(code) {
    if (localeCache.has(code)) return localeCache.get(code);
    try {
      const response = await fetch(`/locales/${code}.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      localeCache.set(code, data || {});
      return data || {};
    } catch (error) {
      console.warn(`[i18n] Locale ${code} indisponible`, error);
      const empty = { strings: {}, placeholders: {}, titles: {} };
      // A transient failure must not poison this locale for the entire session.
      return empty;
    }
  }

  function rememberText(node) {
    const currentValue = String(node?.nodeValue ?? "");
    if (!originals.has(node)) {
      originals.set(node, currentValue);
    } else {
      const lastApplied = lastAppliedTexts.get(node);
      const previousSource = originals.get(node);
      // Si l'application réutilise le même nœud pour un nouveau libellé, ce
      // nouveau texte devient la nouvelle source française. Une mutation
      // produite par notre propre traduction correspond au dernier texte
      // appliqué et ne doit pas écraser la source mémorisée.
      if (lastApplied !== undefined && currentValue !== lastApplied && currentValue !== previousSource) {
        originals.set(node, currentValue);
      }
    }
    return originals.get(node);
  }

  function rememberAttr(element, attr) {
    let map = attrOriginals.get(element);
    if (!map) { map = new Map(); attrOriginals.set(element, map); }
    let applied = lastAppliedAttrs.get(element);
    if (!applied) { applied = new Map(); lastAppliedAttrs.set(element, applied); }
    const currentValue = element.getAttribute(attr);
    if (!map.has(attr)) map.set(attr, currentValue);
    else {
      const previousSource = map.get(attr);
      const lastApplied = applied.get(attr);
      if (lastApplied !== undefined && currentValue !== lastApplied && currentValue !== previousSource) map.set(attr, currentValue);
    }
    return map.get(attr);
  }

  function lookup(source, section = "strings") {
    const value = String(source ?? "");
    const table = active?.[section] || {};
    const fallback = english?.[section] || {};
    if (current === "fr") return value;
    return table[value] ?? fallback[value] ?? value;
  }

  function translateDynamicText(source) {
    let value = lookup(source, "strings");
    if (value !== source) return value;
    if (current === "fr") return source;

    for (const rule of templateRules) {
      const match = source.match(rule.regex);
      if (match) return rule.target.replace(/\{(\w+)\}/g, (token,key) => match[rule.names.indexOf(key)+1] ?? token);
    }

    // Messages construits à l'exécution sous la forme « Préfixe : détail ».
    // Les préfixes traduits sont pré-calculés au changement de langue afin
    // d'éviter de parcourir tout le catalogue pour chaque nœud texte.
    for (const [sourcePrefix, translatedPrefix] of dynamicPrefixes) {
      if (source.startsWith(sourcePrefix) && source.length > sourcePrefix.length) {
        return translatedPrefix + source.slice(sourcePrefix.length);
      }
    }

    const rules = {
      en: [
        [/^(\d+) sélectionné(?:s)?$/, "$1 selected"],
        [/^Page (\d+) \/ (\d+)$/, "Page $1 / $2"],
        [/^(\d+) terme(?:s)? hors ligne$/, "$1 offline terms"],
        [/^Mise à jour en cours — (\d+) %$/, "Updating — $1%"],
        [/^(\d+) traité(?:s)?$/, "$1 processed"],
        [/^\+ (\d+) autres animés$/, "+ $1 more anime"],
        [/^\+ (\d+) autres genres$/, "+ $1 more genres"],
        [/^🗑 Tout oublier \((\d+)\)$/, "🗑 Forget all ($1)"],
        [/^Ajouter la sélection à voir \((\d+)\)$/, "Add selection to plan to watch ($1)"],
        [/^Résumé RSS affiché\. Texte complet non récupéré : (.+)$/, "RSS summary shown. Full text could not be retrieved: $1"],
        [/^Recherche locale : (.+)…$/, "Local search: $1…"],
        [/^Suggestions calculées depuis la base locale de ([\d\s.,]+) fiches — sans attendre les APIs externes\.$/, "Suggestions calculated from $1 local entries — without waiting for external APIs."],
        [/^Suggestions calculées depuis la base locale — sans attendre les APIs externes\.$/, "Suggestions calculated locally — without waiting for external APIs."],
        [/^(\d+) animé(?:s)? sans note personnelle\. Ajoute des notes de 1 à 10 : le graphique montrera combien d’animés ont reçu chaque note\.$/, "$1 anime without a personal score. Add scores from 1 to 10 to build the chart."],
        [/^Voir les (\d+) animé(?:s)? noté(?:s)? (\d+) sur 10$/, "View $1 anime rated $2/10"],
        [/^(\d+) actualité(?:s)? conservée(?:s)?$/, "$1 saved news items"],
        [/^(\d+) nouvelle(?:s)? saison(?:s)? détectée(?:s)?\.$/, "$1 new season(s) detected."],
        [/^(\d+) ajout(?:s)? effectué(?:s)?\.$/, "$1 item(s) added."],
        [/^(.+) ajouté à « À voir »\.$/, "$1 added to Plan to watch."]
      ],
      ja: [
        [/^(\d+) sélectionné(?:s)?$/, "$1 件選択"],
        [/^Page (\d+) \/ (\d+)$/, "$1 / $2 ページ"],
        [/^(\d+) terme(?:s)? hors ligne$/, "オフライン用語 $1 件"],
        [/^Mise à jour en cours — (\d+) %$/, "更新中 — $1%"],
        [/^(\d+) traité(?:s)?$/, "$1 件処理済み"],
        [/^\+ (\d+) autres animés$/, "+ 他 $1 作品"],
        [/^\+ (\d+) autres genres$/, "+ 他 $1 ジャンル"],
        [/^🗑 Tout oublier \((\d+)\)$/, "🗑 すべて除外 ($1)"],
        [/^Ajouter la sélection à voir \((\d+)\)$/, "選択を視聴予定へ追加 ($1)"],
        [/^Résumé RSS affiché\. Texte complet non récupéré : (.+)$/, "RSS の概要を表示しています。全文を取得できませんでした: $1"],
        [/^Recherche locale : (.+)…$/, "ローカル検索: $1…"],
        [/^Suggestions calculées depuis la base locale de ([\d\s.,]+) fiches — sans attendre les APIs externes\.$/, "ローカル $1 件から候補を計算しました — 外部 API を待ちません。"],
        [/^Suggestions calculées depuis la base locale — sans attendre les APIs externes\.$/, "ローカルデータから候補を計算しました — 外部 API を待ちません。"],
        [/^(\d+) animé(?:s)? sans note personnelle\. Ajoute des notes de 1 à 10 : le graphique montrera combien d’animés ont reçu chaque note\.$/, "個人評価なし: $1 作品。1〜10 の評価を付けるとグラフが作成されます。"],
        [/^Voir les (\d+) animé(?:s)? noté(?:s)? (\d+) sur 10$/, "$2/10 の $1 作品を表示"],
        [/^(\d+) actualité(?:s)? conservée(?:s)?$/, "保存済みニュース $1 件"],
        [/^(\d+) nouvelle(?:s)? saison(?:s)? détectée(?:s)?\.$/, "新しいシーズンを $1 件検出しました。"],
        [/^(\d+) ajout(?:s)? effectué(?:s)?\.$/, "$1 件追加しました。"],
        [/^(.+) ajouté à « À voir »\.$/, "$1 を視聴予定に追加しました。"]
      ],
      es: [
        [/^(\d+) sélectionné(?:s)?$/, "$1 seleccionados"],
        [/^Page (\d+) \/ (\d+)$/, "Página $1 / $2"],
        [/^(\d+) terme(?:s)? hors ligne$/, "$1 términos sin conexión"],
        [/^Mise à jour en cours — (\d+) %$/, "Actualizando — $1%"],
        [/^(\d+) traité(?:s)?$/, "$1 procesados"],
        [/^\+ (\d+) autres animés$/, "+ $1 animes más"],
        [/^\+ (\d+) autres genres$/, "+ $1 géneros más"],
        [/^🗑 Tout oublier \((\d+)\)$/, "🗑 Olvidar todo ($1)"],
        [/^Ajouter la sélection à voir \((\d+)\)$/, "Añadir selección a Por ver ($1)"],
        [/^Résumé RSS affiché\. Texte complet non récupéré : (.+)$/, "Se muestra el resumen RSS. No se pudo recuperar el texto completo: $1"],
        [/^Recherche locale : (.+)…$/, "Búsqueda local: $1…"],
        [/^Suggestions calculées depuis la base locale de ([\d\s.,]+) fiches — sans attendre les APIs externes\.$/, "Sugerencias calculadas a partir de $1 fichas locales, sin esperar a APIs externas."],
        [/^Suggestions calculées depuis la base locale — sans attendre les APIs externes\.$/, "Sugerencias calculadas localmente, sin esperar a APIs externas."],
        [/^(\d+) animé(?:s)? sans note personnelle\. Ajoute des notes de 1 à 10 : le graphique montrera combien d’animés ont reçu chaque note\.$/, "$1 animes sin nota personal. Añade notas del 1 al 10 para crear el gráfico."],
        [/^Voir les (\d+) animé(?:s)? noté(?:s)? (\d+) sur 10$/, "Ver $1 animes con nota $2/10"],
        [/^(\d+) actualité(?:s)? conservée(?:s)?$/, "$1 noticias guardadas"],
        [/^(\d+) nouvelle(?:s)? saison(?:s)? détectée(?:s)?\.$/, "$1 temporada(s) nueva(s) detectada(s)."],
        [/^(\d+) ajout(?:s)? effectué(?:s)?\.$/, "$1 elemento(s) añadido(s)."],
        [/^(.+) ajouté à « À voir »\.$/, "$1 añadido a Por ver."]
      ],
      de: [
        [/^(\d+) sélectionné(?:s)?$/, "$1 ausgewählt"],
        [/^Page (\d+) \/ (\d+)$/, "Seite $1 / $2"],
        [/^(\d+) terme(?:s)? hors ligne$/, "$1 Offline-Begriffe"],
        [/^Mise à jour en cours — (\d+) %$/, "Aktualisierung — $1%"],
        [/^(\d+) traité(?:s)?$/, "$1 verarbeitet"],
        [/^\+ (\d+) autres animés$/, "+ $1 weitere Anime"],
        [/^\+ (\d+) autres genres$/, "+ $1 weitere Genres"],
        [/^🗑 Tout oublier \((\d+)\)$/, "🗑 Alle vergessen ($1)"],
        [/^Ajouter la sélection à voir \((\d+)\)$/, "Auswahl zur Merkliste hinzufügen ($1)"],
        [/^Résumé RSS affiché\. Texte complet non récupéré : (.+)$/, "RSS-Zusammenfassung wird angezeigt. Volltext konnte nicht geladen werden: $1"],
        [/^Recherche locale : (.+)…$/, "Lokale Suche: $1…"],
        [/^Suggestions calculées depuis la base locale de ([\d\s.,]+) fiches — sans attendre les APIs externes\.$/, "Vorschläge aus $1 lokalen Einträgen berechnet — ohne auf externe APIs zu warten."],
        [/^Suggestions calculées depuis la base locale — sans attendre les APIs externes\.$/, "Vorschläge lokal berechnet — ohne auf externe APIs zu warten."],
        [/^(\d+) animé(?:s)? sans note personnelle\. Ajoute des notes de 1 à 10 : le graphique montrera combien d’animés ont reçu chaque note\.$/, "$1 Anime ohne persönliche Wertung. Vergib 1 bis 10 Punkte, um das Diagramm aufzubauen."],
        [/^Voir les (\d+) animé(?:s)? noté(?:s)? (\d+) sur 10$/, "$1 Anime mit $2/10 anzeigen"],
        [/^(\d+) actualité(?:s)? conservée(?:s)?$/, "$1 gespeicherte News"],
        [/^(\d+) nouvelle(?:s)? saison(?:s)? détectée(?:s)?\.$/, "$1 neue Staffel(n) erkannt."],
        [/^(\d+) ajout(?:s)? effectué(?:s)?\.$/, "$1 Element(e) hinzugefügt."],
        [/^(.+) ajouté à « À voir »\.$/, "$1 zur Merkliste hinzugefügt."]
      ],
      "pt-BR": [
        [/^(\d+) sélectionné(?:s)?$/, "$1 selecionados"],
        [/^Page (\d+) \/ (\d+)$/, "Página $1 / $2"],
        [/^(\d+) terme(?:s)? hors ligne$/, "$1 termos offline"],
        [/^Mise à jour en cours — (\d+) %$/, "Atualizando — $1%"],
        [/^(\d+) traité(?:s)?$/, "$1 processados"],
        [/^\+ (\d+) autres animés$/, "+ $1 animes"],
        [/^\+ (\d+) autres genres$/, "+ $1 gêneros"],
        [/^🗑 Tout oublier \((\d+)\)$/, "🗑 Esquecer tudo ($1)"],
        [/^Ajouter la sélection à voir \((\d+)\)$/, "Adicionar seleção à lista para assistir ($1)"],
        [/^Résumé RSS affiché\. Texte complet non récupéré : (.+)$/, "Resumo RSS exibido. Não foi possível obter o texto completo: $1"],
        [/^Recherche locale : (.+)…$/, "Busca local: $1…"],
        [/^Suggestions calculées depuis la base locale de ([\d\s.,]+) fiches — sans attendre les APIs externes\.$/, "Sugestões calculadas a partir de $1 fichas locais — sem esperar APIs externas."],
        [/^Suggestions calculées depuis la base locale — sans attendre les APIs externes\.$/, "Sugestões calculadas localmente — sem esperar APIs externas."],
        [/^(\d+) animé(?:s)? sans note personnelle\. Ajoute des notes de 1 à 10 : le graphique montrera combien d’animés ont reçu chaque note\.$/, "$1 animes sem nota pessoal. Dê notas de 1 a 10 para criar o gráfico."],
        [/^Voir les (\d+) animé(?:s)? noté(?:s)? (\d+) sur 10$/, "Ver $1 animes com nota $2/10"],
        [/^(\d+) actualité(?:s)? conservée(?:s)?$/, "$1 notícias salvas"],
        [/^(\d+) nouvelle(?:s)? saison(?:s)? détectée(?:s)?\.$/, "$1 nova(s) temporada(s) detectada(s)."],
        [/^(\d+) ajout(?:s)? effectué(?:s)?\.$/, "$1 item(ns) adicionado(s)."],
        [/^(.+) ajouté à « À voir »\.$/, "$1 adicionado à lista para assistir."]
      ]
    };
    const beta25Rules = {
      en: [
        [/^(\d+) animé(?:s)? affiché(?:s)? pour « (.+) »\.$/, "$1 anime shown for “$2”."],
        [/^(\d+) genres principaux · (\d+) regroupés$/, "$1 main genres · $2 grouped"],
        [/^(\d+) genre(?:s)? affiché(?:s)?$/, "$1 genre(s) shown"],
        [/^(\d+) genres$/, "$1 genres"],
        [/^(\d+) animé(?:s)?$/, "$1 anime"],
        [/^Animés possédant le genre (.+)\.$/, "Anime with the $1 genre."],
        [/^Afficher (.+) dans la bibliothèque$/, "Show $1 in the library"],
        [/^(\d+)% de la bibliothèque terminée$/, "$1% of the library completed"],
        [/^(.+) — (\d+) animé\(s\)$/, "$1 — $2 anime"],
        [/^(.+) — moyenne personnelle ([\d.,]+)\/10$/, "$1 — personal average $2/10"],
        [/^(.+) te plaît mais reste peu présent$/, "You like $1, but it is still underrepresented"],
        [/^(\d+) animé\(s\) sans note : le profil gagnera en précision$/, "$1 anime without a score: the profile will become more accurate"],
        [/^(\d+) jours$/, "$1 days"],
        [/^ · (\d+) résultat(?:s)? sur la période$/, " · $1 result(s) in this period"],
        [/^Erreur HTTP (\d+)$/, "HTTP error $1"],
        [/^Historique : (.+)$/, "History: $1"],
        [/^Réduire l’historique à (.+) supprimera les actualités locales plus anciennes\.$/, "Reducing history to $1 will delete older local news."],
        [/^Erreur : (.+)$/, "Error: $1"],
        [/^Aucune actualité enregistrée pour cette période\.$/, "No saved news for this period."],
        [/^Aucune actualité enregistrée avec ces filtres\.$/, "No saved news with these filters."],
        [/^Période : (.+) → (.+)$/, "Period: $1 → $2"],
        [/^Afficher 30 actualités de plus \((\d+) sur (\d+)\)$/, "Show 30 more news items ($1 of $2)"],
        [/^Charger la suite de l’historique \((\d+) sur (\d+)\)$/, "Load more history ($1 of $2)"],
        [/^Source : (.+)$/, "Source: $1"],
        [/^(\d+) nouvelle\(s\) saison\(s\) détectée\(s\)\.$/, "$1 new season(s) detected."],
        [/^Préparation de (\d+) saison\(s\) détectée\(s\)\.\.\.$/, "Preparing $1 detected season(s)…"],
        [/^✅ Terminé : (\d+) saison\(s\) complétée\(s\) — (\d+) via metadata locale · (\d+) via réseau\.$/, "✅ Complete: $1 season(s) enriched — $2 from local metadata · $3 from network."],
        [/^Ajouter (\d+) saison\(s\) à « À voir » \?$/, "Add $1 season(s) to Plan to watch?"],
        [/^(\d+) saison\(s\) ajoutée\(s\)\.$/, "$1 season(s) added."],
        [/^Bibliothèque filtrée : note personnelle (\d+)\/10\.$/, "Library filtered: personal score $1/10."],
        [/^✓ Forcer l’import \((\d+)\)$/, "✓ Force import ($1)"],
        [/^🛡️ Écarter les hors-anime sûrs \((\d+)\)$/, "🛡️ Dismiss certain non-anime ($1)"],
        [/^↶ Annuler \((\d+)\)$/, "↶ Undo ($1)"],
        [/^(\d+) entrée\(s\) écartée\(s\) de l’import\.$/, "$1 entry/entries dismissed from the import."],
        [/^(\d+) entrée\(s\) ajoutée\(s\) à la sélection d’import forcé\.$/, "$1 entry/entries added to the forced import selection."],
        [/^Analyse terminée : (\d+) entrée\(s\)\.$/, "Analysis complete: $1 entries."],
        [/^Import BetaSeries — (\d+) %(.*)$/, "BetaSeries import — $1%$2"],
        [/^(\d+) animé\(s\) à traiter$/, "$1 anime to process"],
        [/^(\d+) sans image$/, "$1 without image"],
        [/^Analyse CSV (\d+)\/(\d+)(.*)$/, "CSV analysis $1/$2$3"],
        [/^Dernier test : OK \((\d+) résultat\(s\)\) — (.+)$/, "Last test: OK ($1 results) — $2"],
        [/^(\d+) anime\(s\) sont déjà dans À voir\.$/, "$1 anime are already in Plan to watch."],
        [/^Analyse parallèle en cours — (\d+)\/(\d+)$/, "Parallel analysis in progress — $1/$2"],
        [/^Saison (\d+) créée depuis la progression cumulée BetaSeries : (\d+)\/(\d+)\. La fiche officielle reste à identifier\.$/, "Season $1 created from cumulative BetaSeries progress: $2/$3. The official entry still needs to be identified."],
        [/^Saison (\d+) reconstruite depuis la progression cumulée BetaSeries : (\d+)\/(\d+)\.$/, "Season $1 rebuilt from cumulative BetaSeries progress: $2/$3."],
        [/^Progression BetaSeries répartie automatiquement : saison 1 (\d+)\/(\d+), (\d+) épisode\(s\) transféré\(s\) vers la\/les saison\(s\) suivante\(s\)\.$/, "BetaSeries progress distributed automatically: season 1 $1/$2, $3 episode(s) moved to the following season(s)."],
        [/^Progression BetaSeries récupérée automatiquement : saison (\d+) à (\d+)\/(\d+)\.$/, "BetaSeries progress recovered automatically: season $1 at $2/$3."],
        [/^Progression BetaSeries cumulée répartie automatiquement : (\d+) épisode\(s\) au-delà de la saison précédente sont conservés sur la saison (\d+)\.$/, "Cumulative BetaSeries progress distributed automatically: $1 episode(s) beyond the previous season are kept on season $2."]
      ],
      ja: [
        [/^(\d+) animé(?:s)? affiché(?:s)? pour « (.+) »\.$/, "「$2」を $1 作品表示しました。"],
        [/^(\d+) genres principaux · (\d+) regroupés$/, "主要ジャンル $1 · まとめ $2"],
        [/^(\d+) genre(?:s)? affiché(?:s)?$/, "$1 ジャンル表示"],
        [/^(\d+) genres$/, "$1 ジャンル"],
        [/^(\d+) animé(?:s)?$/, "$1 作品"],
        [/^Animés possédant le genre (.+)\.$/, "$1 ジャンルのアニメ。"],
        [/^Afficher (.+) dans la bibliothèque$/, "ライブラリで $1 を表示"],
        [/^(\d+)% de la bibliothèque terminée$/, "ライブラリ完了率 $1%"],
        [/^(.+) — (\d+) animé\(s\)$/, "$1 — $2 作品"],
        [/^(.+) — moyenne personnelle ([\d.,]+)\/10$/, "$1 — 個人平均 $2/10"],
        [/^(.+) te plaît mais reste peu présent$/, "$1 は好みですが作品数はまだ少なめです"],
        [/^(\d+) animé\(s\) sans note : le profil gagnera en précision$/, "未評価 $1 作品: 評価するとプロフィール精度が上がります"],
        [/^(\d+) jours$/, "$1 日"],
        [/^ · (\d+) résultat(?:s)? sur la période$/, " · この期間に $1 件"],
        [/^Erreur HTTP (\d+)$/, "HTTP エラー $1"],
        [/^Historique : (.+)$/, "履歴: $1"],
        [/^Réduire l’historique à (.+) supprimera les actualités locales plus anciennes\.$/, "履歴を $1 に短縮すると、それより古いローカルニュースは削除されます。"],
        [/^Erreur : (.+)$/, "エラー: $1"],
        [/^Aucune actualité enregistrée pour cette période\.$/, "この期間に保存されたニュースはありません。"],
        [/^Aucune actualité enregistrée avec ces filtres\.$/, "このフィルターに一致する保存済みニュースはありません。"],
        [/^Période : (.+) → (.+)$/, "期間: $1 → $2"],
        [/^Afficher 30 actualités de plus \((\d+) sur (\d+)\)$/, "ニュースをさらに30件表示 ($1 / $2)"],
        [/^Charger la suite de l’historique \((\d+) sur (\d+)\)$/, "履歴の続きを読み込む ($1 / $2)"],
        [/^Source : (.+)$/, "ソース: $1"],
        [/^(\d+) nouvelle\(s\) saison\(s\) détectée\(s\)\.$/, "新しいシーズンを $1 件検出しました。"],
        [/^Préparation de (\d+) saison\(s\) détectée\(s\)\.\.\.$/, "検出したシーズン $1 件を準備中…"],
        [/^✅ Terminé : (\d+) saison\(s\) complétée\(s\) — (\d+) via metadata locale · (\d+) via réseau\.$/, "✅ 完了: $1 シーズンを補完 — ローカル $2 · ネットワーク $3。"],
        [/^Ajouter (\d+) saison\(s\) à « À voir » \?$/, "$1 シーズンを視聴予定に追加しますか？"],
        [/^(\d+) saison\(s\) ajoutée\(s\)\.$/, "$1 シーズンを追加しました。"],
        [/^Bibliothèque filtrée : note personnelle (\d+)\/10\.$/, "ライブラリを個人評価 $1/10 で絞り込みました。"],
        [/^✓ Forcer l’import \((\d+)\)$/, "✓ 強制インポート ($1)"],
        [/^🛡️ Écarter les hors-anime sûrs \((\d+)\)$/, "🛡️ 確実な非アニメを除外 ($1)"],
        [/^↶ Annuler \((\d+)\)$/, "↶ 元に戻す ($1)"],
        [/^(\d+) entrée\(s\) écartée\(s\) de l’import\.$/, "インポートから $1 件を除外しました。"],
        [/^(\d+) entrée\(s\) ajoutée\(s\) à la sélection d’import forcé\.$/, "$1 件を強制インポート選択に追加しました。"],
        [/^Analyse terminée : (\d+) entrée\(s\)\.$/, "分析完了: $1 件。"],
        [/^Import BetaSeries — (\d+) %(.*)$/, "BetaSeries インポート — $1%$2"],
        [/^(\d+) animé\(s\) à traiter$/, "処理対象 $1 作品"],
        [/^(\d+) sans image$/, "画像なし $1 件"],
        [/^Analyse CSV (\d+)\/(\d+)(.*)$/, "CSV 分析 $1/$2$3"],
        [/^Dernier test : OK \((\d+) résultat\(s\)\) — (.+)$/, "前回テスト: OK ($1 件) — $2"],
        [/^(\d+) anime\(s\) sont déjà dans À voir\.$/, "$1 作品はすでに視聴予定です。"],
        [/^Analyse parallèle en cours — (\d+)\/(\d+)$/, "並列分析中 — $1/$2"],
        [/^Saison (\d+) créée depuis la progression cumulée BetaSeries : (\d+)\/(\d+)\. La fiche officielle reste à identifier\.$/, "BetaSeries の累積進捗からシーズン $1 を作成しました: $2/$3。正式な作品情報はまだ特定されていません。"],
        [/^Saison (\d+) reconstruite depuis la progression cumulée BetaSeries : (\d+)\/(\d+)\.$/, "BetaSeries の累積進捗からシーズン $1 を再構築しました: $2/$3。"],
        [/^Progression BetaSeries répartie automatiquement : saison 1 (\d+)\/(\d+), (\d+) épisode\(s\) transféré\(s\) vers la\/les saison\(s\) suivante\(s\)\.$/, "BetaSeries の進捗を自動分割しました: シーズン1 $1/$2、$3 話を後続シーズンへ移しました。"],
        [/^Progression BetaSeries récupérée automatiquement : saison (\d+) à (\d+)\/(\d+)\.$/, "BetaSeries の進捗を自動復元しました: シーズン $1 は $2/$3。"],
        [/^Progression BetaSeries cumulée répartie automatiquement : (\d+) épisode\(s\) au-delà de la saison précédente sont conservés sur la saison (\d+)\.$/, "BetaSeries の累積進捗を自動分割しました: 前シーズンを超えた $1 話をシーズン $2 に保持します。"]
      ],
      es: [
        [/^(\d+) animé(?:s)? affiché(?:s)? pour « (.+) »\.$/, "$1 animes mostrados para «$2»."],
        [/^(\d+) genres principaux · (\d+) regroupés$/, "$1 géneros principales · $2 agrupados"],
        [/^(\d+) genre(?:s)? affiché(?:s)?$/, "$1 género(s) mostrados"],
        [/^(\d+) genres$/, "$1 géneros"],
        [/^(\d+) animé(?:s)?$/, "$1 animes"],
        [/^Animés possédant le genre (.+)\.$/, "Animes del género $1."],
        [/^Afficher (.+) dans la bibliothèque$/, "Mostrar $1 en la biblioteca"],
        [/^(\d+)% de la bibliothèque terminée$/, "$1% de la biblioteca completada"],
        [/^(.+) — (\d+) animé\(s\)$/, "$1 — $2 animes"],
        [/^(.+) — moyenne personnelle ([\d.,]+)\/10$/, "$1 — media personal $2/10"],
        [/^(.+) te plaît mais reste peu présent$/, "Te gusta $1, pero sigue poco presente"],
        [/^(\d+) animé\(s\) sans note : le profil gagnera en précision$/, "$1 animes sin nota: el perfil será más preciso"],
        [/^(\d+) jours$/, "$1 días"],
        [/^ · (\d+) résultat(?:s)? sur la période$/, " · $1 resultado(s) en el período"],
        [/^Erreur HTTP (\d+)$/, "Error HTTP $1"],
        [/^Historique : (.+)$/, "Historial: $1"],
        [/^Réduire l’historique à (.+) supprimera les actualités locales plus anciennes\.$/, "Reducir el historial a $1 eliminará las noticias locales más antiguas."],
        [/^Erreur : (.+)$/, "Error: $1"],
        [/^Aucune actualité enregistrée pour cette période\.$/, "No hay noticias guardadas para este período."],
        [/^Aucune actualité enregistrée avec ces filtres\.$/, "No hay noticias guardadas con estos filtros."],
        [/^Période : (.+) → (.+)$/, "Período: $1 → $2"],
        [/^Afficher 30 actualités de plus \((\d+) sur (\d+)\)$/, "Mostrar 30 noticias más ($1 de $2)"],
        [/^Charger la suite de l’historique \((\d+) sur (\d+)\)$/, "Cargar más historial ($1 de $2)"],
        [/^Source : (.+)$/, "Fuente: $1"],
        [/^(\d+) nouvelle\(s\) saison\(s\) détectée\(s\)\.$/, "$1 temporada(s) nueva(s) detectada(s)."],
        [/^Préparation de (\d+) saison\(s\) détectée\(s\)\.\.\.$/, "Preparando $1 temporada(s) detectada(s)…"],
        [/^✅ Terminé : (\d+) saison\(s\) complétée\(s\) — (\d+) via metadata locale · (\d+) via réseau\.$/, "✅ Terminado: $1 temporada(s) completada(s) — $2 con metadatos locales · $3 por red."],
        [/^Ajouter (\d+) saison\(s\) à « À voir » \?$/, "¿Añadir $1 temporada(s) a Por ver?"],
        [/^(\d+) saison\(s\) ajoutée\(s\)\.$/, "$1 temporada(s) añadida(s)."],
        [/^Bibliothèque filtrée : note personnelle (\d+)\/10\.$/, "Biblioteca filtrada: nota personal $1/10."],
        [/^✓ Forcer l’import \((\d+)\)$/, "✓ Forzar importación ($1)"],
        [/^🛡️ Écarter les hors-anime sûrs \((\d+)\)$/, "🛡️ Descartar no-anime seguros ($1)"],
        [/^↶ Annuler \((\d+)\)$/, "↶ Deshacer ($1)"],
        [/^(\d+) entrée\(s\) écartée\(s\) de l’import\.$/, "$1 entrada(s) descartada(s) de la importación."],
        [/^(\d+) entrée\(s\) ajoutée\(s\) à la sélection d’import forcé\.$/, "$1 entrada(s) añadida(s) a la selección de importación forzada."],
        [/^Analyse terminée : (\d+) entrée\(s\)\.$/, "Análisis terminado: $1 entradas."],
        [/^Import BetaSeries — (\d+) %(.*)$/, "Importación de BetaSeries — $1%$2"],
        [/^(\d+) animé\(s\) à traiter$/, "$1 animes por procesar"],
        [/^(\d+) sans image$/, "$1 sin imagen"],
        [/^Analyse CSV (\d+)\/(\d+)(.*)$/, "Análisis CSV $1/$2$3"],
        [/^Dernier test : OK \((\d+) résultat\(s\)\) — (.+)$/, "Última prueba: OK ($1 resultados) — $2"],
        [/^(\d+) anime\(s\) sont déjà dans À voir\.$/, "$1 animes ya están en Por ver."],
        [/^Analyse parallèle en cours — (\d+)\/(\d+)$/, "Análisis paralelo en curso — $1/$2"],
        [/^Saison (\d+) créée depuis la progression cumulée BetaSeries : (\d+)\/(\d+)\. La fiche officielle reste à identifier\.$/, "Temporada $1 creada desde el progreso acumulado de BetaSeries: $2/$3. Aún falta identificar la ficha oficial."],
        [/^Saison (\d+) reconstruite depuis la progression cumulée BetaSeries : (\d+)\/(\d+)\.$/, "Temporada $1 reconstruida desde el progreso acumulado de BetaSeries: $2/$3."],
        [/^Progression BetaSeries répartie automatiquement : saison 1 (\d+)\/(\d+), (\d+) épisode\(s\) transféré\(s\) vers la\/les saison\(s\) suivante\(s\)\.$/, "Progreso de BetaSeries distribuido automáticamente: temporada 1 $1/$2, $3 episodio(s) transferido(s) a la(s) temporada(s) siguiente(s)."],
        [/^Progression BetaSeries récupérée automatiquement : saison (\d+) à (\d+)\/(\d+)\.$/, "Progreso de BetaSeries recuperado automáticamente: temporada $1 en $2/$3."],
        [/^Progression BetaSeries cumulée répartie automatiquement : (\d+) épisode\(s\) au-delà de la saison précédente sont conservés sur la saison (\d+)\.$/, "Progreso acumulado de BetaSeries distribuido automáticamente: $1 episodio(s) más allá de la temporada anterior se conservan en la temporada $2."]
      ],
      de: [
        [/^(\d+) animé(?:s)? affiché(?:s)? pour « (.+) »\.$/, "$1 Anime für „$2“ angezeigt."],
        [/^(\d+) genres principaux · (\d+) regroupés$/, "$1 Hauptgenres · $2 gruppiert"],
        [/^(\d+) genre(?:s)? affiché(?:s)?$/, "$1 Genre(s) angezeigt"],
        [/^(\d+) genres$/, "$1 Genres"],
        [/^(\d+) animé(?:s)?$/, "$1 Anime"],
        [/^Animés possédant le genre (.+)\.$/, "Anime mit dem Genre $1."],
        [/^Afficher (.+) dans la bibliothèque$/, "$1 in der Bibliothek anzeigen"],
        [/^(\d+)% de la bibliothèque terminée$/, "$1% der Bibliothek abgeschlossen"],
        [/^(.+) — (\d+) animé\(s\)$/, "$1 — $2 Anime"],
        [/^(.+) — moyenne personnelle ([\d.,]+)\/10$/, "$1 — persönlicher Durchschnitt $2/10"],
        [/^(.+) te plaît mais reste peu présent$/, "Du magst $1, es ist aber noch wenig vertreten"],
        [/^(\d+) animé\(s\) sans note : le profil gagnera en précision$/, "$1 Anime ohne Wertung: Das Profil wird mit Bewertungen genauer"],
        [/^(\d+) jours$/, "$1 Tage"],
        [/^ · (\d+) résultat(?:s)? sur la période$/, " · $1 Ergebnis(se) im Zeitraum"],
        [/^Erreur HTTP (\d+)$/, "HTTP-Fehler $1"],
        [/^Historique : (.+)$/, "Verlauf: $1"],
        [/^Réduire l’historique à (.+) supprimera les actualités locales plus anciennes\.$/, "Wenn der Verlauf auf $1 reduziert wird, werden ältere lokale News gelöscht."],
        [/^Erreur : (.+)$/, "Fehler: $1"],
        [/^Aucune actualité enregistrée pour cette période\.$/, "Keine gespeicherten News für diesen Zeitraum."],
        [/^Aucune actualité enregistrée avec ces filtres\.$/, "Keine gespeicherten News mit diesen Filtern."],
        [/^Période : (.+) → (.+)$/, "Zeitraum: $1 → $2"],
        [/^Afficher 30 actualités de plus \((\d+) sur (\d+)\)$/, "30 weitere News anzeigen ($1 von $2)"],
        [/^Charger la suite de l’historique \((\d+) sur (\d+)\)$/, "Weiteren Verlauf laden ($1 von $2)"],
        [/^Source : (.+)$/, "Quelle: $1"],
        [/^(\d+) nouvelle\(s\) saison\(s\) détectée\(s\)\.$/, "$1 neue Staffel(n) erkannt."],
        [/^Préparation de (\d+) saison\(s\) détectée\(s\)\.\.\.$/, "$1 erkannte Staffel(n) werden vorbereitet…"],
        [/^✅ Terminé : (\d+) saison\(s\) complétée\(s\) — (\d+) via metadata locale · (\d+) via réseau\.$/, "✅ Fertig: $1 Staffel(n) ergänzt — $2 aus lokalen Metadaten · $3 über Netzwerk."],
        [/^Ajouter (\d+) saison\(s\) à « À voir » \?$/, "$1 Staffel(n) zur Merkliste hinzufügen?"],
        [/^(\d+) saison\(s\) ajoutée\(s\)\.$/, "$1 Staffel(n) hinzugefügt."],
        [/^Bibliothèque filtrée : note personnelle (\d+)\/10\.$/, "Bibliothek gefiltert: persönliche Wertung $1/10."],
        [/^✓ Forcer l’import \((\d+)\)$/, "✓ Import erzwingen ($1)"],
        [/^🛡️ Écarter les hors-anime sûrs \((\d+)\)$/, "🛡️ Sichere Nicht-Anime verwerfen ($1)"],
        [/^↶ Annuler \((\d+)\)$/, "↶ Rückgängig ($1)"],
        [/^(\d+) entrée\(s\) écartée\(s\) de l’import\.$/, "$1 Eintrag/Einträge vom Import ausgeschlossen."],
        [/^(\d+) entrée\(s\) ajoutée\(s\) à la sélection d’import forcé\.$/, "$1 Eintrag/Einträge zur erzwungenen Importauswahl hinzugefügt."],
        [/^Analyse terminée : (\d+) entrée\(s\)\.$/, "Analyse abgeschlossen: $1 Einträge."],
        [/^Import BetaSeries — (\d+) %(.*)$/, "BetaSeries-Import — $1%$2"],
        [/^(\d+) animé\(s\) à traiter$/, "$1 Anime zu verarbeiten"],
        [/^(\d+) sans image$/, "$1 ohne Bild"],
        [/^Analyse CSV (\d+)\/(\d+)(.*)$/, "CSV-Analyse $1/$2$3"],
        [/^Dernier test : OK \((\d+) résultat\(s\)\) — (.+)$/, "Letzter Test: OK ($1 Ergebnisse) — $2"],
        [/^(\d+) anime\(s\) sont déjà dans À voir\.$/, "$1 Anime sind bereits auf der Merkliste."],
        [/^Analyse parallèle en cours — (\d+)\/(\d+)$/, "Parallele Analyse läuft — $1/$2"],
        [/^Saison (\d+) créée depuis la progression cumulée BetaSeries : (\d+)\/(\d+)\. La fiche officielle reste à identifier\.$/, "Staffel $1 aus dem kumulierten BetaSeries-Fortschritt erstellt: $2/$3. Der offizielle Eintrag muss noch identifiziert werden."],
        [/^Saison (\d+) reconstruite depuis la progression cumulée BetaSeries : (\d+)\/(\d+)\.$/, "Staffel $1 aus dem kumulierten BetaSeries-Fortschritt rekonstruiert: $2/$3."],
        [/^Progression BetaSeries répartie automatiquement : saison 1 (\d+)\/(\d+), (\d+) épisode\(s\) transféré\(s\) vers la\/les saison\(s\) suivante\(s\)\.$/, "BetaSeries-Fortschritt automatisch verteilt: Staffel 1 $1/$2, $3 Episode(n) in die folgende(n) Staffel(n) verschoben."],
        [/^Progression BetaSeries récupérée automatiquement : saison (\d+) à (\d+)\/(\d+)\.$/, "BetaSeries-Fortschritt automatisch wiederhergestellt: Staffel $1 bei $2/$3."],
        [/^Progression BetaSeries cumulée répartie automatiquement : (\d+) épisode\(s\) au-delà de la saison précédente sont conservés sur la saison (\d+)\.$/, "Kumulierter BetaSeries-Fortschritt automatisch verteilt: $1 Episode(n) über die vorige Staffel hinaus bleiben in Staffel $2 erhalten."]
      ],
      "pt-BR": [
        [/^(\d+) animé(?:s)? affiché(?:s)? pour « (.+) »\.$/, "$1 animes exibidos para “$2”."],
        [/^(\d+) genres principaux · (\d+) regroupés$/, "$1 gêneros principais · $2 agrupados"],
        [/^(\d+) genre(?:s)? affiché(?:s)?$/, "$1 gênero(s) exibido(s)"],
        [/^(\d+) genres$/, "$1 gêneros"],
        [/^(\d+) animé(?:s)?$/, "$1 animes"],
        [/^Animés possédant le genre (.+)\.$/, "Animes do gênero $1."],
        [/^Afficher (.+) dans la bibliothèque$/, "Exibir $1 na biblioteca"],
        [/^(\d+)% de la bibliothèque terminée$/, "$1% da biblioteca concluída"],
        [/^(.+) — (\d+) animé\(s\)$/, "$1 — $2 animes"],
        [/^(.+) — moyenne personnelle ([\d.,]+)\/10$/, "$1 — média pessoal $2/10"],
        [/^(.+) te plaît mais reste peu présent$/, "Você gosta de $1, mas ele ainda aparece pouco"],
        [/^(\d+) animé\(s\) sans note : le profil gagnera en précision$/, "$1 animes sem nota: o perfil ficará mais preciso"],
        [/^(\d+) jours$/, "$1 dias"],
        [/^ · (\d+) résultat(?:s)? sur la période$/, " · $1 resultado(s) no período"],
        [/^Erreur HTTP (\d+)$/, "Erro HTTP $1"],
        [/^Historique : (.+)$/, "Histórico: $1"],
        [/^Réduire l’historique à (.+) supprimera les actualités locales plus anciennes\.$/, "Reduzir o histórico para $1 excluirá as notícias locais mais antigas."],
        [/^Erreur : (.+)$/, "Erro: $1"],
        [/^Aucune actualité enregistrée pour cette période\.$/, "Nenhuma notícia salva neste período."],
        [/^Aucune actualité enregistrée avec ces filtres\.$/, "Nenhuma notícia salva com estes filtros."],
        [/^Période : (.+) → (.+)$/, "Período: $1 → $2"],
        [/^Afficher 30 actualités de plus \((\d+) sur (\d+)\)$/, "Exibir mais 30 notícias ($1 de $2)"],
        [/^Charger la suite de l’historique \((\d+) sur (\d+)\)$/, "Carregar mais histórico ($1 de $2)"],
        [/^Source : (.+)$/, "Fonte: $1"],
        [/^(\d+) nouvelle\(s\) saison\(s\) détectée\(s\)\.$/, "$1 nova(s) temporada(s) detectada(s)."],
        [/^Préparation de (\d+) saison\(s\) détectée\(s\)\.\.\.$/, "Preparando $1 temporada(s) detectada(s)…"],
        [/^✅ Terminé : (\d+) saison\(s\) complétée\(s\) — (\d+) via metadata locale · (\d+) via réseau\.$/, "✅ Concluído: $1 temporada(s) completada(s) — $2 por metadados locais · $3 pela rede."],
        [/^Ajouter (\d+) saison\(s\) à « À voir » \?$/, "Adicionar $1 temporada(s) à lista para assistir?"],
        [/^(\d+) saison\(s\) ajoutée\(s\)\.$/, "$1 temporada(s) adicionada(s)."],
        [/^Bibliothèque filtrée : note personnelle (\d+)\/10\.$/, "Biblioteca filtrada: nota pessoal $1/10."],
        [/^✓ Forcer l’import \((\d+)\)$/, "✓ Forçar importação ($1)"],
        [/^🛡️ Écarter les hors-anime sûrs \((\d+)\)$/, "🛡️ Descartar não-animes confirmados ($1)"],
        [/^↶ Annuler \((\d+)\)$/, "↶ Desfazer ($1)"],
        [/^(\d+) entrée\(s\) écartée\(s\) de l’import\.$/, "$1 entrada(s) descartada(s) da importação."],
        [/^(\d+) entrée\(s\) ajoutée\(s\) à la sélection d’import forcé\.$/, "$1 entrada(s) adicionada(s) à seleção de importação forçada."],
        [/^Analyse terminée : (\d+) entrée\(s\)\.$/, "Análise concluída: $1 entradas."],
        [/^Import BetaSeries — (\d+) %(.*)$/, "Importação do BetaSeries — $1%$2"],
        [/^(\d+) animé\(s\) à traiter$/, "$1 animes para processar"],
        [/^(\d+) sans image$/, "$1 sem imagem"],
        [/^Analyse CSV (\d+)\/(\d+)(.*)$/, "Análise CSV $1/$2$3"],
        [/^Dernier test : OK \((\d+) résultat\(s\)\) — (.+)$/, "Último teste: OK ($1 resultados) — $2"],
        [/^(\d+) anime\(s\) sont déjà dans À voir\.$/, "$1 animes já estão na lista para assistir."],
        [/^Analyse parallèle en cours — (\d+)\/(\d+)$/, "Análise paralela em andamento — $1/$2"],
        [/^Saison (\d+) créée depuis la progression cumulée BetaSeries : (\d+)\/(\d+)\. La fiche officielle reste à identifier\.$/, "Temporada $1 criada a partir do progresso acumulado do BetaSeries: $2/$3. A ficha oficial ainda precisa ser identificada."],
        [/^Saison (\d+) reconstruite depuis la progression cumulée BetaSeries : (\d+)\/(\d+)\.$/, "Temporada $1 reconstruída a partir do progresso acumulado do BetaSeries: $2/$3."],
        [/^Progression BetaSeries répartie automatiquement : saison 1 (\d+)\/(\d+), (\d+) épisode\(s\) transféré\(s\) vers la\/les saison\(s\) suivante\(s\)\.$/, "Progresso do BetaSeries distribuído automaticamente: temporada 1 $1/$2, $3 episódio(s) transferido(s) para a(s) temporada(s) seguinte(s)."],
        [/^Progression BetaSeries récupérée automatiquement : saison (\d+) à (\d+)\/(\d+)\.$/, "Progresso do BetaSeries recuperado automaticamente: temporada $1 em $2/$3."],
        [/^Progression BetaSeries cumulée répartie automatiquement : (\d+) épisode\(s\) au-delà de la saison précédente sont conservés sur la saison (\d+)\.$/, "Progresso acumulado do BetaSeries distribuído automaticamente: $1 episódio(s) além da temporada anterior são mantidos na temporada $2."]
      ]
    };
    for (const [regex, replacement] of [...(rules[current] || rules.en), ...(beta25Rules[current] || beta25Rules.en)]) {
      if (regex.test(source)) return source.replace(regex, replacement);
    }
    return source;
  }

  function translateTextNode(node) {
    if (isProtected(node)) return;
    preserveOptionValue(node.parentElement);
    const original = rememberText(node);
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    const core = original.trim();
    if (!core) return;
    const translated = translateDynamicText(core);
    const desired = `${leading}${translated}${trailing}`;
    lastAppliedTexts.set(node, desired);
    if (node.nodeValue !== desired) node.nodeValue = desired;
  }

  function translateAttributes(element) {
    if (isProtected(element)) return;
    preserveOptionValue(element);
    for (const attr of ["placeholder", "title", "aria-label", "alt"]) {
      if (!element.hasAttribute?.(attr)) continue;
      const original = rememberAttr(element, attr);
      if (!original) continue;
      const section = attr === "placeholder" ? "placeholders" : "titles";
      const translated = lookup(original, section);
      const desired = translated !== original ? translated : translateDynamicText(original);
      let applied = lastAppliedAttrs.get(element);
      if (!applied) { applied = new Map(); lastAppliedAttrs.set(element, applied); }
      applied.set(attr, desired);
      if (element.getAttribute(attr) !== desired) element.setAttribute(attr, desired);
    }
  }

  function translateTree(root = document.body) {
    if (!root || translating || isProtected(root)) return;
    translating = true;
    try {
      if (root.nodeType === Node.TEXT_NODE) translateTextNode(root);
      else {
        if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        let node = walker.currentNode;
        while (node) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          else translateAttributes(node);
          node = walker.nextNode();
        }
      }
    } finally {
      translating = false;
    }
  }

  function dispatchChanged() {
    window.dispatchEvent(new CustomEvent("alm:language-changed", { detail: { language: current } }));
  }

  async function persist(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
    try { await window.animeManager?.setLanguage?.(code); } catch {}
  }

  async function setLanguage(code, { persistChoice = true } = {}) {
    const request = ++languageRequest;
    const normalized = SUPPORTED.includes(code) ? code : normalizeLocale(code);
    const [nextEnglish, nextActive] = await Promise.all([loadLocale("en"), loadLocale(normalized)]);
    if (request !== languageRequest) return current;
    english = nextEnglish;
    active = nextActive;
    current = normalized;
    templateRules = Object.entries({...english.templates, ...active.templates}).map(([source,target]) => {
      const names=[];
      const escaped=source.split(/(\{\w+\})/).map(part=>{
        if (/^\{\w+\}$/.test(part)) {names.push(part.slice(1,-1));return "(.+?)";}
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }).join("");
      return {regex:new RegExp("^"+escaped+"$"),names,target};
    });
    dynamicPrefixes = current === "fr" ? [] : Object.entries(active?.strings || {})
      .filter(([key, translated]) => /:\s*$/.test(key) && translated && translated !== key)
      .sort((a, b) => b[0].length - a[0].length);
    document.documentElement.lang = normalized;
    document.documentElement.dataset.almLanguage = normalized;
    if (persistChoice) {
      persistQueue = persistQueue.catch(() => {}).then(() => persist(normalized));
      await persistQueue;
    }
    if (request !== languageRequest) return current;
    translateTree(document.body);
    syncSelectors();
    dispatchChanged();
    return normalized;
  }

  function getStoredLocal() {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
  }

  async function resolveInitialLanguage() {
    let saved = "";
    try { saved = await window.animeManager?.getLanguage?.(); } catch {}
    saved = saved || getStoredLocal();
    if (saved) return { language: normalizeLocale(saved), firstRun: false };
    let systemLocale = "";
    try { systemLocale = await window.animeManager?.getSystemLocale?.(); } catch {}
    systemLocale = systemLocale || navigator.language || "en";
    return { language: normalizeLocale(systemLocale), firstRun: true };
  }

  function optionMarkup(selected) {
    return SUPPORTED.map(code => `<option value="${code}"${code === selected ? " selected" : ""}>${META[code].flag} ${META[code].label}</option>`).join("");
  }

  function syncSelectors() {
    document.querySelectorAll("[data-alm-language-select]").forEach(select => { select.value = current; });
  }

  function injectSettingsSelector() {
    const main = document.querySelector("#settingsDialog .settings-main");
    if (!main || document.getElementById("almLanguageSettings")) return;
    const wrapper = document.createElement("details");
    wrapper.id = "almLanguageSettings";
    wrapper.className = "settings-section settings-disclosure";
    wrapper.open = true;
    wrapper.innerHTML = `
      <summary>
        <span class="settings-summary-icon" aria-hidden="true">🌐</span>
        <span><strong data-alm-i18n-source="Langue et interface">Langue et interface</strong><small data-alm-i18n-source="Changer la langue sans redémarrer">Changer la langue sans redémarrer</small></span>
        <span class="settings-summary-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="settings-disclosure-body">
        <label data-alm-language-label>Langue de l’interface
          <select data-alm-language-select>${optionMarkup(current)}</select>
        </label>
        <label data-alm-news-language-label>Langue des actualités
          <select data-alm-news-language-select><option value="all">🌍 Toutes les langues</option>${optionMarkup("__none__")}</select>
        </label>
        <p class="muted" data-alm-language-help>L’interface et les actualités peuvent utiliser des langues différentes. Les titres d’anime et métadonnées externes restent dans leur langue fournie par la source.</p>
      </div>`;
    main.insertBefore(wrapper, main.firstElementChild);
    wrapper.querySelector("[data-alm-language-select]")?.addEventListener("change", event => setLanguage(event.target.value));
    const newsSelect = wrapper.querySelector("[data-alm-news-language-select]");
    const syncNewsSelect = () => { if (newsSelect) newsSelect.value = window.ALM_NEWS_LANGUAGE?.get?.() || "all"; };
    syncNewsSelect();
    newsSelect?.addEventListener("change", event => window.ALM_NEWS_LANGUAGE?.set?.(event.target.value));
    window.addEventListener("alm:news-language-changed", syncNewsSelect);
    translateTree(wrapper);
  }

  function injectFirstRunDialog() {
    if (document.getElementById("almLanguageFirstRun")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "almLanguageFirstRun";
    dialog.className = "app-confirm-dialog alm-language-dialog";
    dialog.innerHTML = `
      <div class="app-confirm-card alm-language-card">
        <div class="alm-language-icon">🌐</div>
        <h3>Choisir la langue / Choose language</h3>
        <p>Anime Local Manager peut utiliser plusieurs langues. Tu pourras changer ce choix plus tard dans les réglages.</p>
        <label>Langue de l’interface
          <select data-alm-language-select>${optionMarkup(current)}</select>
        </label>
        <menu><button type="button" class="primary" data-alm-language-confirm>Continuer</button></menu>
      </div>`;
    document.body.appendChild(dialog);
    translateTree(dialog);
    const select = dialog.querySelector("select");
    select?.addEventListener("change", event => setLanguage(event.target.value, { persistChoice: false }));
    dialog.querySelector("[data-alm-language-confirm]")?.addEventListener("click", async () => {
      await setLanguage(select?.value || current, { persistChoice: true });
      dialog.close();
    });
    try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
  }

  async function init() {
    english = await loadLocale("en");
    const initial = await resolveInitialLanguage();
    await setLanguage(initial.language, { persistChoice: !initial.firstRun });
    injectSettingsSelector();
    if (initial.firstRun) injectFirstRunDialog();

    const pending = new Set();
    let scheduled = false;
    const flushMutations = () => {
      scheduled = false;
      const nodes = [...pending], roots = new Set(nodes); pending.clear();
      for (const node of nodes) {
        if (!node.isConnected || isProtected(node)) continue;
        // Do not walk the same subtree once for every child mutation.
        let ancestor=node.parentNode,covered=false;
        while(ancestor){if(roots.has(ancestor)){covered=true;break;}ancestor=ancestor.parentNode;}
        if(covered)continue;
        translateTree(node);
      }
    };
    observer = new MutationObserver(mutations => {
      if (translating) return;
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && !isProtected(mutation.target)) pending.add(mutation.target);
        if (mutation.type === "attributes" && !isProtected(mutation.target)) translateAttributes(mutation.target);
        for (const node of mutation.addedNodes || []) if (!isProtected(node)) pending.add(node);
      }
      if (pending.size && !scheduled) { scheduled = true; queueMicrotask(flushMutations); }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label", "alt"]
    });
  }

  window.ALM_I18N = {
    init,
    setLanguage,
    getLanguage: () => current,
    supported: () => SUPPORTED.map(code => ({ code, ...META[code] })),
    t: (source) => translateDynamicText(String(source ?? "")),
    refresh: () => translateTree(document.body)
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

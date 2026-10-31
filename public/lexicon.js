"use strict";

/**
 * Dictionnaire / glossaire Anime Local Manager — contenu local, disponible hors connexion.
 * Les termes sont présentés dans leur sens d'usage courant dans l'animation,
 * le manga et la gestion d'une bibliothèque.
 */
(function () {
  const CATEGORIES = {
    demographic: "Public éditorial",
    genre: "Genres et ambiances",
    trope: "Thèmes et codes narratifs",
    format: "Formats et relations",
    source: "Supports d’origine",
    production: "Création et production",
    localization: "Diffusion et traduction",
    community: "Culture et communauté"
  };

  const LEXICON_LOCALIZED = Object.freeze({
    en: {
      categories:{demographic:"Editorial audience",genre:"Genres and moods",trope:"Themes and narrative tropes",format:"Formats and relationships",source:"Source media",production:"Creation and production",localization:"Distribution and localization",community:"Culture and community"},
      categoryHelp:{demographic:"Publishing audience category used for manga and anime.",genre:"Genre or atmosphere used to classify anime and manga.",trope:"Recurring narrative theme or storytelling convention.",format:"Release format or relationship between works.",source:"Original medium or publication source of a work.",production:"Production role, technique or creative responsibility.",localization:"Distribution, dubbing, subtitling or regional release term.",community:"Fandom, viewing or narrative term used by the community."},
      known:"Known examples",visuals:"visual references",unavailable:"References unavailable in local metadata.",also:"Also called",remember:"Key point",library:"View this genre in my library",allCategories:"All categories",all:"All",shown:(n,t)=>`${n} term${n===1?"":"s"} shown out of ${t}`,empty:"No term found.",emptyHelp:"Try a shorter word or reset the filters.",display:"Show"
    },
    es: {
      categories:{demographic:"Público editorial",genre:"Géneros y ambientes",trope:"Temas y recursos narrativos",format:"Formatos y relaciones",source:"Medios de origen",production:"Creación y producción",localization:"Distribución y localización",community:"Cultura y comunidad"},
      categoryHelp:{demographic:"Categoría de público editorial usada en manga y anime.",genre:"Género o ambiente usado para clasificar anime y manga.",trope:"Tema narrativo o recurso recurrente.",format:"Formato de publicación o relación entre obras.",source:"Medio original o fuente de publicación de una obra.",production:"Rol, técnica o responsabilidad creativa de producción.",localization:"Término de distribución, doblaje, subtitulado o lanzamiento regional.",community:"Término de fandom, visionado o narrativa usado por la comunidad."},
      known:"Ejemplos conocidos",visuals:"referencias visuales",unavailable:"Referencias no disponibles en los metadatos locales.",also:"También llamado",remember:"A recordar",library:"Ver este género en mi biblioteca",allCategories:"Todas las categorías",all:"Todos",shown:(n,t)=>`${n} término${n===1?"":"s"} mostrado${n===1?"":"s"} de ${t}`,empty:"No se encontró ningún término.",emptyHelp:"Prueba una palabra más corta o restablece los filtros.",display:"Mostrar"
    },
    de: {
      categories:{demographic:"Redaktionelle Zielgruppe",genre:"Genres und Stimmungen",trope:"Themen und Erzählmuster",format:"Formate und Beziehungen",source:"Ursprungsmedien",production:"Kreation und Produktion",localization:"Vertrieb und Lokalisierung",community:"Kultur und Community"},
      categoryHelp:{demographic:"Verlegerische Zielgruppenkategorie für Manga und Anime.",genre:"Genre oder Stimmung zur Einordnung von Anime und Manga.",trope:"Wiederkehrendes Erzählthema oder narratives Muster.",format:"Veröffentlichungsformat oder Beziehung zwischen Werken.",source:"Ursprüngliches Medium oder Publikationsquelle eines Werks.",production:"Produktionsrolle, Technik oder kreative Verantwortung.",localization:"Begriff zu Vertrieb, Synchronisation, Untertiteln oder regionaler Veröffentlichung.",community:"Fandom-, Seh- oder Erzählbegriff aus der Community."},
      known:"Bekannte Beispiele",visuals:"visuelle Referenzen",unavailable:"Referenzen in den lokalen Metadaten nicht verfügbar.",also:"Auch genannt",remember:"Merke",library:"Dieses Genre in meiner Bibliothek anzeigen",allCategories:"Alle Kategorien",all:"Alle",shown:(n,t)=>`${n} Begriff${n===1?"":"e"} von ${t} angezeigt`,empty:"Kein Begriff gefunden.",emptyHelp:"Versuche ein kürzeres Wort oder setze die Filter zurück.",display:"Anzeigen"
    },
    ja: {
      categories:{demographic:"編集対象層",genre:"ジャンルと雰囲気",trope:"テーマと物語表現",format:"形式と作品関係",source:"原作媒体",production:"制作とクリエイティブ",localization:"配信とローカライズ",community:"文化とコミュニティ"},
      categoryHelp:{demographic:"マンガやアニメで使われる編集上の対象読者区分です。",genre:"アニメやマンガを分類するジャンルや雰囲気です。",trope:"繰り返し使われる物語テーマや表現パターンです。",format:"公開形式や作品同士の関係を表す用語です。",source:"作品の原作媒体や公開元を表します。",production:"制作上の役職、技法、クリエイティブ上の役割です。",localization:"配信、吹替、字幕、地域展開に関する用語です。",community:"ファンダム、視聴、物語についてコミュニティで使われる用語です。"},
      known:"代表例",visuals:"参考作品",unavailable:"ローカルメタデータに参考作品がありません。",also:"別名",remember:"ポイント",library:"このジャンルをライブラリで表示",allCategories:"すべてのカテゴリ",all:"すべて",shown:(n,t)=>`${t}語中 ${n}語を表示`,empty:"用語が見つかりません。",emptyHelp:"短い語で検索するか、フィルターをリセットしてください。",display:"表示"
    },
    "zh-CN": {
      categories:{demographic:"编辑受众",genre:"类型与氛围",trope:"主题与叙事惯例",format:"形式与作品关系",source:"原作载体",production:"创作与制作",localization:"发行与本地化",community:"文化与社群"},
      categoryHelp:{demographic:"漫画和动画出版中的目标受众分类。",genre:"用于分类动画和漫画的类型或氛围。",trope:"反复出现的叙事主题或创作惯例。",format:"作品的发行形式或作品之间的关系。",source:"作品的原始载体或出版来源。",production:"制作岗位、技术或创作职责。",localization:"发行、配音、字幕和地区上线相关用语。",community:"社群使用的粉丝文化、观看和叙事用语。"},
      known:"知名示例",visuals:"参考作品",unavailable:"本地元数据中暂无参考作品。",also:"别称",remember:"要点",library:"在我的资料库中查看此类型",allCategories:"所有分类",all:"全部",shown:(n,t)=>`已显示 ${t} 个术语中的 ${n} 个`,empty:"未找到术语。",emptyHelp:"请尝试较短的词或重置筛选条件。",display:"显示"
    },
    "pt-BR": {
      categories:{demographic:"Público editorial",genre:"Gêneros e atmosferas",trope:"Temas e recursos narrativos",format:"Formatos e relações",source:"Mídias de origem",production:"Criação e produção",localization:"Distribuição e localização",community:"Cultura e comunidade"},
      categoryHelp:{demographic:"Categoria de público editorial usada em mangás e animes.",genre:"Gênero ou atmosfera usada para classificar animes e mangás.",trope:"Tema narrativo ou recurso recorrente.",format:"Formato de lançamento ou relação entre obras.",source:"Mídia original ou fonte de publicação de uma obra.",production:"Função, técnica ou responsabilidade criativa de produção.",localization:"Termo de distribuição, dublagem, legendagem ou lançamento regional.",community:"Termo de fandom, exibição ou narrativa usado pela comunidade."},
      known:"Exemplos conhecidos",visuals:"referências visuais",unavailable:"Referências indisponíveis nos metadados locais.",also:"Também chamado",remember:"Atenção",library:"Ver este gênero na minha biblioteca",allCategories:"Todas as categorias",all:"Todos",shown:(n,t)=>`${n} termo${n===1?"":"s"} exibido${n===1?"":"s"} de ${t}`,empty:"Nenhum termo encontrado.",emptyHelp:"Tente uma palavra menor ou redefina os filtros.",display:"Exibir"
    }
  });

  function lexiconLocale() {
    const code = window.ALM_I18N?.getLanguage?.() || document.documentElement.lang || "fr";
    return code === "pt" ? "pt-BR" : code;
  }
  const designText = (key,args) => window.ALM_DESIGN?.t(key,args) || key;
  function displayTerm(item) { return window.ALM_GLOSSARY_NAMES?.[lexiconLocale()]?.[item.term] || item.term; }
  function lexiconLocalized(item) {
    const code = lexiconLocale();
    const translated = window.ALM_GLOSSARY_COPY?.[code]?.[item.term];
    return {
      category: window.ALM_DESIGN ? designText("category."+item.category) : CATEGORIES[item.category] || item.category,
      definition: translated || item.definition,
      details: code === "fr" ? item.details : "",
      confusion: code === "fr" ? item.confusion : "",
      originalFrench: code !== "fr" && Boolean(item.details || item.confusion),
      known:designText("knownExamples"), visuals:designText("visualReferences"), unavailable:designText("examplesUnavailable"),
      also:designText("alsoCalled"), remember:designText("remember"), library:designText("seeGenre")
    };
  }



  const CATEGORY_VISUALS = {
    demographic: { title: "À qui l’œuvre s’adresse", note: "Shōnen, shōjo, seinen, josei…" },
    genre: { title: "L’ambiance et le récit", note: "Action, fantasy, romance, horreur…" },
    trope: { title: "Les codes narratifs", note: "Isekai, found family, tournoi…" },
    format: { title: "La forme de l’œuvre", note: "OVA, film, spin-off, saison…" },
    source: { title: "Le support d’origine", note: "Manga, light novel, webtoon, jeu…" },
    production: { title: "Les métiers du studio", note: "Réalisateur, sakuga, seiyuu…" },
    localization: { title: "La diffusion en France", note: "Simulcast, VOSTFR, doublage…" },
    community: { title: "La culture des fans", note: "Canon, fandom, cosplay, ship…" }
  };

  // Exemples visuels soigneusement sélectionnés. Seuls les identifiants MAL
  // sont embarqués : titres et miniatures proviennent de la metadata locale, avec miniatures chargées à la demande,
  // puis les images sont mises en cache sur la machine à la demande.
  const LEXICON_EXAMPLES = Object.freeze({
    "Shōnen": [20, 38000],
    "Shōjo": [38680, 232],
    "Seinen": [33, 37521],
    "Josei": [10800, 1698],
    "Kodomo": [527, 2471],
    "Action": [16498, 40748],
    "Aventure": [21, 34599],
    "Fantasy": [52991, 5114],
    "Dark fantasy": [33, 34599],
    "Urban fantasy": [40748, 6746],
    "Science-fiction": [9253, 13601],
    "Cyberpunk": [43, 42310],
    "Space opera": [820, 1650],
    "Mecha": [30, 1575],
    "Romance": [37999, 38680],
    "Comédie romantique": [37999, 4224],
    "Comédie": [918, 10165],
    "Parodie": [30276, 918],
    "Drame": [33352, 4181],
    "Mystère": [19, 46102],
    "Thriller": [1535, 37779],
    "Horreur": [11111, 934],
    "Psychologique": [339, 437],
    "Historique": [37521, 36028],
    "Militaire": [41457, 820],
    "Sport": [20583, 49596],
    "Musique": [47917, 5680],
    "Tranche de vie": [34798, 22789],
    "Iyashikei": [477, 34798],
    "Gourmet": [28171, 52701],
    "Workplace": [35968, 25835],
    "Isekai": [31240, 39535],
    "Reverse isekai": [15809, 34561],
    "Tensei": [37430, 39535],
    "Time travel": [9253, 31043],
    "Time loop": [31240, 47194],
    "Villainess": [38555, 54837],
    "Harem": [38101, 15583],
    "Reverse harem": [853, 38555],
    "Boys’ Love": [39533, 44055],
    "Girls’ Love": [37786, 39790],
    "CGDCT": [5680, 47917],
    "Mahō shōjo": [9756, 232],
    "Battle shōnen": [20, 38000],
    "Death game": [10620, 14345],
    "Survival": [16498, 37779],
    "Post-apocalyptique": [16498, 53393],
    "Dystopie": [13601, 37779],
    "School": [37999, 31964],
    "Idols": [52034, 15051],
    "Detective": [235, 40911],
    "Found family": [50265, 53411],
    "Film": [199, 32281],
    "OVA / OAV": [820, 227],
    "ONA": [35120, 42310],
    "Suite": [1735, 40591],
    "Préquelle": [48561, 10087],
    "Spin-off": [6213, 14829],
    "Remake": [38680, 5114],
    "Anime original": [1575, 9756],
    "Manga": [16498, 38000],
    "Light novel": [31240, 11757],
    "Web novel": [37430, 39535],
    "Visual novel": [9253, 22297],
    "Manhwa": [52299, 40221],
    "Webtoon": [40221, 52299],
    "Yonkoma": [5680, 47917],
    "Sakuga": [30276, 32182]
  });

  const lexiconExampleCache = new Map();
  const lexiconExampleRequests = new Map();

  // Petites illustrations vectorielles locales : elles gardent la page douce,
  // cohérente et utilisable hors connexion sans embarquer d’images tierces.
  const CATEGORY_ILLUSTRATIONS = {
    demographic: `<circle cx="18" cy="17" r="4"/><circle cx="31" cy="17" r="4"/><path d="M10 35c.8-6 4-10 8-10s7.2 4 8 10M23 35c.8-6 4-10 8-10s7.2 4 8 10"/>`,
    genre: `<path d="m24 8 2.7 7.3L34 18l-7.3 2.7L24 28l-2.7-7.3L14 18l7.3-2.7L24 8Z"/><path d="m36 27 1.4 3.6L41 32l-3.6 1.4L36 37l-1.4-3.6L31 32l3.6-1.4L36 27ZM12 28l1.1 2.9L16 32l-2.9 1.1L12 36l-1.1-2.9L8 32l2.9-1.1L12 28Z"/>`,
    trope: `<path d="M11 12h11c0 4 2 6 5 6s5-2 5-6h5v11c-4 0-6 2-6 5s2 5 6 5v5H26c0-4-2-6-5-6s-5 2-5 6h-5V27c4 0 6-2 6-5s-2-5-6-5v-5Z"/>`,
    format: `<rect x="8" y="11" width="32" height="26" rx="4"/><path d="M13 11v26M35 11v26M8 18h5M8 29h5M35 18h5M35 29h5"/><path d="m21 19 9 5-9 5V19Z"/>`,
    source: `<path d="M8 13c7-2 12 0 16 4v23c-4-4-9-6-16-4V13ZM40 13c-7-2-12 0-16 4v23c4-4 9-6 16-4V13Z"/><path d="M24 17v23"/>`,
    production: `<path d="M9 18h30v21H9zM9 18l5-9h30l-5 9H9Z"/><path d="m18 9-5 9M28 9l-5 9M38 9l-5 9M15 26h18M15 32h12"/>`,
    localization: `<circle cx="24" cy="22" r="14"/><path d="M10 22h28M24 8c5 5 7 9 7 14s-2 9-7 14c-5-5-7-9-7-14s2-9 7-14Z"/><path d="M11 38h26v6H11zM16 41h7M27 41h5"/>`,
    community: `<path d="M8 12h24v17H18l-7 6v-6H8V12Z"/><path d="M25 20h15v14h-4v6l-6-6h-5"/><path d="M15 19h10M15 24h7"/>`
  };

  function categoryIllustration(category, variant = "tile") {
    const body = CATEGORY_ILLUSTRATIONS[category] || CATEGORY_ILLUSTRATIONS.genre;
    return `<svg class="lexicon-illustration-svg ${variant}" viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }

  const entry = (term, category, definition, details = "", aliases = [], confusion = "", libraryGenre = "") => {
    // Le contenu accepte deux écritures lisibles :
    //   définition, détails, [alias], à retenir, genre bibliothèque
    //   définition, [alias], à retenir, genre bibliothèque
    // Normaliser ici évite qu'un alias court soit interprété comme un paragraphe
    // et garantit que toutes les cartes ont des types homogènes.
    if (Array.isArray(details)) {
      return {
        term,
        category,
        definition,
        details: "",
        aliases: details,
        confusion: typeof aliases === "string" ? aliases : "",
        libraryGenre: String(libraryGenre || (typeof confusion === "string" ? confusion : "") || "")
      };
    }
    return {
      term,
      category,
      definition,
      details: String(details || ""),
      aliases: Array.isArray(aliases) ? aliases : [],
      confusion: String(confusion || ""),
      libraryGenre: String(libraryGenre || "")
    };
  };

  const ENTRIES = [
    // Publics éditoriaux — ce ne sont pas des genres.
    entry("Démographie éditoriale", "demographic", "Catégorie de lectorat visée à l’origine par un magazine ou un éditeur.", "Elle décrit un public commercial, pas le contenu exact d’une œuvre. Deux séries shōnen peuvent donc être très différentes.", ["cible éditoriale"], "À ne pas confondre avec un genre comme la fantasy ou la romance."),
    entry("Shōnen", "demographic", "Œuvre publiée à l’origine pour un lectorat adolescent masculin.", "Le terme peut couvrir action, sport, romance, comédie ou tranche de vie. Les codes d’amitié et de dépassement de soi sont fréquents, mais non obligatoires.", ["shonen", "shounen", "少年"], "Ce n’est pas synonyme de « série de combat ».", "Shounen"),
    entry("Shōjo", "demographic", "Œuvre publiée à l’origine pour un lectorat adolescent féminin.", "Le shōjo peut être romantique, fantastique, historique, horrifique ou d’aventure.", ["shojo", "shoujo", "少女"], "Ce n’est pas automatiquement une romance.", "Shoujo"),
    entry("Seinen", "demographic", "Œuvre publiée à l’origine pour un lectorat masculin adulte.", "Le ton peut être réaliste, contemplatif, violent, politique ou humoristique. Le classement vient surtout du magazine de publication.", ["seinen", "青年"], "« Adulte » ne signifie pas forcément explicite.", "Seinen"),
    entry("Josei", "demographic", "Œuvre publiée à l’origine pour un lectorat féminin adulte.", "Elle traite souvent les relations, le travail ou la vie quotidienne avec une approche plus mature, sans que cela soit une règle absolue.", ["josei", "女性"], "Le josei n’est pas uniquement de la romance.", "Josei"),
    entry("Kodomo", "demographic", "Œuvre destinée principalement aux enfants.", "Le vocabulaire, la narration et les enjeux sont généralement accessibles à un jeune public.", ["kodomomuke", "子供向け"], "À distinguer d’une œuvre familiale appréciable à tout âge.", "Kids"),

    // Genres et ambiances.
    entry("Action", "genre", "Genre centré sur les combats, poursuites, affrontements ou situations physiques intenses.", "Il peut se combiner avec presque tous les autres genres.", [], "L’action décrit le rythme et les événements, pas le public ciblé.", "Action"),
    entry("Aventure", "genre", "Récit de voyage, d’exploration ou de quête à travers des lieux et des épreuves.", "L’aventure met souvent l’accent sur la progression, la découverte et le changement d’environnement.", [], "Une aventure peut contenir peu de combats.", "Adventure"),
    entry("Fantasy", "genre", "Récit reposant sur un monde, une magie ou des créatures surnaturelles imaginaires.", "La fantasy peut se dérouler dans un autre monde, un passé fictif ou un univers proche du nôtre.", ["fantastique médiéval"], "Fantasy et isekai ne sont pas synonymes.", "Fantasy"),
    entry("Dark fantasy", "genre", "Fantasy à l’atmosphère sombre, violente, tragique ou moralement ambiguë.", "Elle insiste souvent sur le danger, la corruption ou les conséquences de la magie.", ["fantasy sombre"], "La présence de monstres ne suffit pas à rendre une œuvre dark fantasy.", "Fantasy"),
    entry("Urban fantasy", "genre", "Fantasy où le surnaturel existe dans une ville ou un monde moderne.", "Magie, créatures et sociétés secrètes cohabitent avec la vie contemporaine.", ["fantasy urbaine"], "À distinguer du simple surnaturel sans construction de monde magique.", "Fantasy"),
    entry("Science-fiction", "genre", "Récit fondé sur des technologies, sciences ou sociétés spéculatives.", "Voyage spatial, intelligence artificielle, clones, cybernétique et futurs alternatifs en sont des thèmes fréquents.", ["SF", "sci-fi"], "Une technologie imaginaire n’implique pas toujours une démarche scientifique.", "Sci-Fi"),
    entry("Cyberpunk", "genre", "Science-fiction décrivant souvent une haute technologie dans une société inégalitaire ou oppressive.", "Réseaux, implants, mégacorporations et identité numérique sont des motifs courants.", [], "Le néon est une esthétique fréquente, pas une définition suffisante.", "Sci-Fi"),
    entry("Space opera", "genre", "Grande aventure de science-fiction à l’échelle de planètes, systèmes ou empires galactiques.", "Elle privilégie les conflits, héros et civilisations plutôt qu’un réalisme scientifique strict.", ["opéra spatial"], "À distinguer de la hard science-fiction.", "Sci-Fi"),
    entry("Mecha", "genre", "Œuvre où des robots ou armures mécaniques pilotées jouent un rôle central.", "Le mecha peut être militaire, super-héroïque, politique ou psychologique.", ["mécha", "robot géant"], "Un robot autonome n’est pas nécessairement un mecha.", "Mecha"),
    entry("Romance", "genre", "Récit où la naissance ou l’évolution d’une relation amoureuse est centrale.", "Elle peut être comique, dramatique, réaliste ou fantastique.", [], "Une intrigue avec un couple secondaire n’est pas forcément une romance.", "Romance"),
    entry("Comédie romantique", "genre", "Romance utilisant principalement l’humour, les malentendus et les interactions du couple.", ["romcom"], "La relation amoureuse reste un axe majeur, contrairement à une comédie avec simple sous-intrigue romantique.", "", "Romance"),
    entry("Comédie", "genre", "Genre dont l’objectif principal est de provoquer le rire ou l’amusement.", "Elle peut être absurde, satirique, parodique, romantique ou basée sur les personnages.", [], "Une œuvre avec quelques blagues n’est pas forcément une comédie.", "Comedy"),
    entry("Parodie", "genre", "Œuvre qui imite et détourne les codes d’un genre ou d’une œuvre pour produire un effet comique ou critique.", "Elle suppose souvent une connaissance des références visées.", [], "À distinguer d’un simple hommage.", "Parody"),
    entry("Drame", "genre", "Récit centré sur des conflits émotionnels, sociaux ou personnels sérieux.", "Le drame n’implique pas nécessairement une fin triste.", [], "Une scène triste ne suffit pas à classer toute l’œuvre en drame.", "Drama"),
    entry("Mystère", "genre", "Intrigue organisée autour d’une énigme, d’un secret ou d’une vérité à découvrir.", "Le spectateur reçoit progressivement des indices.", [], "Le mystère peut exister sans enquête policière.", "Mystery"),
    entry("Thriller", "genre", "Récit construit pour maintenir la tension, l’incertitude et le danger.", "Il peut être psychologique, criminel, politique ou surnaturel.", [], "Le thriller vise surtout le suspense continu.", "Suspense"),
    entry("Horreur", "genre", "Genre cherchant à provoquer peur, malaise, effroi ou répulsion.", "L’horreur peut être graphique, psychologique, folklorique ou cosmique.", [], "Une œuvre sombre n’est pas automatiquement horrifique.", "Horror"),
    entry("Surnaturel", "genre", "Œuvre contenant des phénomènes qui dépassent les lois naturelles : esprits, malédictions, pouvoirs ou monstres.", "Le cadre peut rester contemporain et réaliste.", ["supernatural"], "À distinguer de la fantasy, qui construit souvent un monde magique plus large.", "Supernatural"),
    entry("Psychologique", "genre", "Récit accordant une place centrale aux pensées, traumatismes, perceptions ou conflits mentaux.", "La narration peut être subjective ou ambiguë.", [], "Ce terme décrit l’approche, pas forcément un thriller.", "Psychological"),
    entry("Historique", "genre", "Œuvre située dans une période historique reconnaissable ou inspirée de faits réels.", "Elle peut prendre des libertés et se mélanger à la fantasy.", [], "Historique ne signifie pas documentaire.", "Historical"),
    entry("Militaire", "genre", "Récit où armées, stratégie, hiérarchie ou guerre structurent l’intrigue.", "Il peut être réaliste, futuriste ou fantastique.", [], "Une scène de bataille isolée ne suffit pas.", "Military"),
    entry("Sport", "genre", "Œuvre centrée sur la pratique, l’entraînement et la compétition sportive.", "La progression collective et individuelle y tient souvent une grande place.", ["sports"], "À distinguer d’une œuvre scolaire où un sport apparaît seulement en arrière-plan.", "Sports"),
    entry("Musique", "genre", "Œuvre où la création, la pratique ou la scène musicale est centrale.", "Elle peut suivre un groupe, un orchestre, des idoles ou un artiste solo.", [], "La présence de chansons ne suffit pas à en faire un anime musical.", "Music"),
    entry("Tranche de vie", "genre", "Récit observant le quotidien et les relations sans objectif épique obligatoire.", "Le rythme est souvent posé et les petits événements prennent de l’importance.", ["slice of life"], "Ce n’est pas synonyme d’absence d’intrigue.", "Slice of Life"),
    entry("Iyashikei", "genre", "Sous-genre apaisant conçu pour procurer détente et réconfort.", "Cadres naturels, gestes quotidiens et conflits faibles sont fréquents.", ["healing anime", "anime guérisseur"], "Toute tranche de vie n’est pas un iyashikei.", "Slice of Life"),
    entry("Gourmet", "genre", "Œuvre centrée sur la cuisine, les repas ou la découverte gastronomique.", "La nourriture peut servir de moteur narratif ou de lien social.", ["food"], "Une série montrant souvent des repas n’est pas forcément gourmet.", "Gourmet"),
    entry("Workplace", "genre", "Récit centré sur un métier et les relations au travail.", "Il peut être réaliste, comique ou spécialisé dans un secteur précis.", ["travail", "professionnel"], "À distinguer d’une œuvre où le travail sert seulement de décor.", "Workplace"),

    // Thèmes et codes narratifs.
    entry("Isekai", "trope", "Récit où un personnage est transporté, invoqué ou réincarné dans un autre monde.", "Le monde d’arrivée peut être fantastique, virtuel ou radicalement différent.", ["異世界", "autre monde"], "Isekai décrit le passage entre mondes, pas un genre démographique.", "Isekai"),
    entry("Reverse isekai", "trope", "Isekai inversé : un personnage d’un autre monde arrive dans le nôtre.", ["isekai inversé"], "Le point de départ et le sens du déplacement sont déterminants.", "", "Isekai"),
    entry("Tensei", "trope", "Réincarnation d’un personnage dans une nouvelle vie, parfois dans le même monde.", "Le souvenir de la vie précédente est souvent conservé.", ["転生", "reincarnation"], "Toute réincarnation n’est pas un isekai si le monde ne change pas.", "Reincarnation"),
    entry("Time travel", "trope", "Déplacement volontaire ou accidentel vers une autre époque.", "Il peut modifier le passé, créer des branches temporelles ou former une boucle causale.", ["voyage temporel"], "À distinguer d’une simple vision du futur.", "Time Travel"),
    entry("Time loop", "trope", "Situation où une même période se répète et où un ou plusieurs personnages en gardent conscience.", ["boucle temporelle"], "Le voyage dans le temps n’implique pas forcément une répétition.", "Time Travel"),
    entry("Villainess", "trope", "Récit centré sur une héroïne placée dans le rôle de la méchante, souvent d’un jeu romantique fictif.", "Elle cherche fréquemment à éviter une mauvaise fin annoncée.", ["akuyaku reijō", "méchante"], "Le terme désigne un cadre narratif, pas la moralité réelle de l’héroïne.", "Villainess"),
    entry("Otome isekai", "trope", "Isekai ou réincarnation dans un univers inspiré d’un jeu otome, d’un roman romantique ou d’une société aristocratique.", ["romantasy de réincarnation"], "Tous les récits villainess ne sont pas des adaptations de jeux.", "", "Isekai"),
    entry("Harem", "trope", "Récit où plusieurs personnages sont présentés comme partenaires amoureux possibles d’un protagoniste.", "La relation peut rester comique ou indécise.", [], "Une distribution majoritairement féminine ou masculine ne suffit pas.", "Harem"),
    entry("Reverse harem", "trope", "Variation du harem où une protagoniste est entourée de plusieurs partenaires potentiels, souvent masculins.", ["harem inversé"], "Le genre des personnages peut varier selon l’œuvre.", "Reverse Harem"),
    entry("Triangle amoureux", "trope", "Conflit romantique impliquant trois personnes et des sentiments concurrents.", ["love triangle"], "Ce n’est pas nécessairement un harem.", "Love Polygon"),
    entry("Ecchi", "trope", "Comédie ou mise en scène suggestive reposant sur le fan service sans constituer une œuvre pornographique.", "Le degré varie fortement selon les séries.", ["エッチ"], "Ecchi et hentai ne désignent pas la même catégorie.", "Ecchi"),
    entry("Fan service", "trope", "Éléments ajoutés pour faire plaisir au public : sensualité, caméos, références, transformations ou scènes attendues.", "Le terme ne concerne pas uniquement la sexualisation.", ["fanservice"], "Il peut être narratif, visuel ou nostalgique."),
    entry("Boys’ Love", "trope", "Catégorie centrée sur une relation romantique entre personnages masculins.", "BL est le terme éditorial moderne le plus courant.", ["BL", "yaoi"], "« Yaoi » est parfois utilisé plus spécifiquement ou historiquement.", "Boys Love"),
    entry("Girls’ Love", "trope", "Catégorie centrée sur une relation romantique entre personnages féminins.", ["GL", "yuri"], "La présence de proximité féminine ne suffit pas toujours à parler de GL.", "Girls Love"),
    entry("CGDCT", "trope", "Abréviation de « Cute Girls Doing Cute Things » : quotidien d’un groupe de filles dans des activités légères et chaleureuses.", ["Cute Girls Doing Cute Things"], "Le terme décrit une formule, pas une qualité ou un public.", "CGDCT"),
    entry("Mahō shōjo", "trope", "Récit de jeune fille utilisant des pouvoirs magiques, souvent avec transformation et identité héroïque.", ["magical girl", "mahou shoujo", "魔法少女"], "Toutes les héroïnes magiciennes ne suivent pas les codes du magical girl.", "Mahou Shoujo"),
    entry("Battle shōnen", "trope", "Formule d’action associée à de nombreux shōnen : progression, rivalités, techniques et affrontements successifs.", ["nekketsu"], "C’est un sous-ensemble populaire du shōnen, pas sa définition.", "Shounen"),
    entry("Death game", "trope", "Compétition ou épreuve dont l’échec peut entraîner la mort ou de lourdes conséquences.", ["jeu mortel", "survival game"], "À distinguer d’un tournoi sportif sans danger vital.", "Survival"),
    entry("Survival", "trope", "Récit centré sur la survie face à un environnement, une catastrophe, des créatures ou d’autres humains.", ["survie"], "Le survival peut exister sans jeu organisé.", "Survival"),
    entry("Post-apocalyptique", "trope", "Récit situé après l’effondrement majeur d’une civilisation ou d’un monde.", ["post-apo"], "Apocalyptique décrit la catastrophe en cours ; post-apocalyptique, ses conséquences.", "Sci-Fi"),
    entry("Dystopie", "trope", "Société fictive oppressive ou profondément dysfonctionnelle servant souvent de critique politique ou sociale.", [], "Une société pauvre n’est pas automatiquement dystopique.", "Sci-Fi"),
    entry("School", "trope", "Œuvre dont l’école et la vie scolaire constituent un cadre important.", ["école", "scolaire"], "Il s’agit d’un cadre, pas nécessairement d’un genre principal.", "School"),
    entry("Delinquents", "trope", "Récit autour de jeunes délinquants, bandes scolaires ou codes de rue japonais.", ["furyō", "yankii"], "Le terme japonais renvoie à des codes culturels précis.", "Delinquents"),
    entry("Idols", "trope", "Œuvre centrée sur des artistes de divertissement entraînés pour chanter, danser et apparaître dans les médias.", ["idoles"], "Une chanteuse professionnelle n’est pas nécessairement une idol.", "Idols"),
    entry("Detective", "trope", "Récit d’enquête mené par un détective professionnel ou amateur.", ["détective", "enquête"], "Le mystère est l’énigme ; le detective décrit le rôle d’enquêteur.", "Detective"),
    entry("Organized Crime", "trope", "Récit impliquant mafia, yakuza, triades ou organisations criminelles structurées.", ["crime organisé", "yakuza"], "À distinguer d’un crime isolé.", "Organized Crime"),
    entry("Revenge", "trope", "Intrigue motivée principalement par la vengeance d’un personnage.", ["vengeance"], "Une revanche ponctuelle n’en fait pas forcément le thème central.", "Revenge"),
    entry("Coming of age", "trope", "Récit d’apprentissage où un personnage mûrit et construit son identité.", ["passage à l’âge adulte", "récit initiatique"], "Le protagoniste n’a pas besoin d’atteindre légalement l’âge adulte.", "Coming of Age"),
    entry("Found family", "trope", "Groupe de personnages sans lien familial initial qui devient une famille choisie.", ["famille choisie"], "Ce code peut coexister avec une famille biologique.", "Family"),
    entry("Slow burn", "trope", "Relation ou intrigue qui se développe très progressivement avant son accomplissement.", ["progression lente"], "Lenteur ne signifie pas absence d’évolution."),
    entry("Enemies to lovers", "trope", "Évolution d’une relation antagoniste vers une relation amoureuse.", ["ennemis à amoureux"], "Une simple rivalité amicale n’est pas toujours ce trope.", "Romance"),
    entry("Childcare", "trope", "Récit centré sur le soin, l’éducation ou la vie avec de jeunes enfants.", ["garde d’enfant", "parenting"], "Le protagoniste n’est pas forcément le parent biologique.", "Childcare"),
    entry("Medical", "trope", "Œuvre où la médecine, les soins ou l’hôpital sont au cœur des situations.", ["médical"], "À distinguer d’un personnage médecin secondaire.", "Medical"),

    // Formats et relations.
    entry("Série TV", "format", "Anime diffusé sous forme d’épisodes télévisés ou selon un calendrier équivalent en streaming.", ["TV anime"], "Le format TV ne garantit ni 12 ni 24 épisodes."),
    entry("Film", "format", "Œuvre conçue comme un long métrage unique pour le cinéma ou une diffusion équivalente.", ["movie"], "Un film récapitulatif n’est pas une nouvelle histoire complète.", "Movie"),
    entry("OVA / OAV", "format", "Épisode ou série directement publié sur support vidéo, sans diffusion TV initiale obligatoire.", "OVA signifie Original Video Animation ; OAV est une variante d’ordre des mots.", ["Original Video Animation", "Original Animation Video"], "Le format ne renseigne pas sur le caractère canonique.", "OVA"),
    entry("ONA", "format", "Anime publié initialement sur Internet ou une plateforme en ligne.", ["Original Net Animation"], "Aujourd’hui, une ONA peut avoir une production aussi importante qu’une série TV.", "ONA"),
    entry("Special", "format", "Épisode spécial hors numérotation principale ou contenu bonus.", "Il peut s’agir d’un épilogue, d’une comédie, d’un événement ou d’un bonus vidéo.", ["spécial"], "Special ne signifie pas forcément non canonique.", "Special"),
    entry("Short", "format", "Anime dont les épisodes ont une durée nettement plus courte qu’un épisode standard.", ["format court"], "Le nombre d’épisodes peut malgré tout être élevé."),
    entry("Cour", "format", "Bloc de diffusion japonais d’environ trois mois, généralement associé à une saison de programmation.", "Un cour représente souvent 10 à 13 épisodes, mais ce n’est pas une règle absolue.", ["クール"], "Cour et saison narrative ne sont pas toujours identiques."),
    entry("Split cour", "format", "Série dont les cours sont séparés par une pause de diffusion planifiée.", ["cours séparés"], "Une partie 2 peut être le second cour sans constituer une nouvelle saison créative."),
    entry("Saison", "format", "Ensemble d’épisodes présenté comme une étape distincte d’une série.", "Les plateformes peuvent découper les saisons différemment des producteurs japonais.", ["season"], "Saison commerciale, cour et partie ne coïncident pas toujours."),
    entry("Partie", "format", "Découpage d’une saison ou d’une production en plusieurs blocs nommés Part 1, Part 2, etc.", ["part"], "Une partie n’est pas forcément une suite indépendante."),
    entry("Suite", "format", "Œuvre poursuivant directement ou indirectement l’histoire d’une œuvre antérieure.", ["sequel"], "Le numéro de saison ne suffit pas toujours à comprendre l’ordre narratif."),
    entry("Préquelle", "format", "Œuvre racontant des événements antérieurs à une œuvre déjà publiée.", ["prequel"], "Elle peut être sortie après l’œuvre principale."),
    entry("Spin-off", "format", "Œuvre dérivée centrée sur un autre personnage, lieu ou aspect du même univers.", ["série dérivée"], "Un spin-off n’est pas nécessairement une suite."),
    entry("Side story", "format", "Histoire parallèle complétant l’œuvre principale sans en être la continuation centrale.", ["histoire secondaire"], "Elle peut se dérouler pendant les mêmes événements."),
    entry("Récapitulatif", "format", "Montage ou épisode résumant des événements déjà montrés.", ["recap", "compilation"], "Il peut inclure quelques scènes inédites sans devenir une suite."),
    entry("Remake", "format", "Nouvelle adaptation ou nouvelle production reprenant une œuvre déjà animée.", "Elle peut repartir de zéro, modifier le rythme ou suivre davantage la source.", [], "À distinguer du remaster, qui améliore une production existante."),
    entry("Reboot", "format", "Relance d’une franchise avec une nouvelle continuité ou une nouvelle approche.", [], "Un reboot ne suit pas obligatoirement la chronologie précédente."),
    entry("Remaster", "format", "Version techniquement restaurée ou améliorée d’une œuvre existante.", "Image, son ou définition peuvent être retravaillés sans refaire l’animation.", [], "Ce n’est pas un remake."),
    entry("Adaptation", "format", "Transposition d’une œuvre d’un support vers un autre, par exemple manga vers anime.", "Une adaptation sélectionne et réorganise souvent le contenu de la source.", [], "Fidèle ne signifie pas identique plan par plan."),
    entry("Anime original", "format", "Anime conçu sans être l’adaptation directe d’une œuvre préexistante.", ["original anime"], "Il peut ensuite recevoir un manga ou un roman dérivé."),

    // Supports d'origine.
    entry("Manga", "source", "Bande dessinée japonaise, généralement lue de droite à gauche dans son édition originale.", ["漫画"], "Le terme désigne le support, pas un style graphique unique."),
    entry("Light novel", "source", "Roman populaire japonais illustré, souvent publié en volumes et destiné à une lecture accessible.", ["LN", "ライトノベル"], "Ce n’est pas un manga avec beaucoup de texte."),
    entry("Web novel", "source", "Roman publié d’abord sur Internet, parfois avant une édition commerciale retravaillée.", ["WN", "roman web"], "La version light novel peut différer fortement de la web novel."),
    entry("Visual novel", "source", "Jeu narratif interactif combinant texte, images, musique et choix.", ["VN", "roman visuel"], "Certaines œuvres ont des routes multiples difficiles à condenser en anime."),
    entry("Jeu otome", "source", "Jeu narratif ciblant historiquement un public féminin et proposant plusieurs routes romantiques.", ["otome game", "乙女ゲーム"], "Otome décrit le public et la structure, pas tous les jeux avec une héroïne."),
    entry("Manhwa", "source", "Bande dessinée coréenne.", "Les manhwa numériques modernes utilisent souvent un défilement vertical en couleur.", ["만화"], "À distinguer du manga japonais et du manhua chinois."),
    entry("Manhua", "source", "Bande dessinée chinoise.", ["漫画 chinois"], "À distinguer du manhwa coréen."),
    entry("Webtoon", "source", "Bande dessinée numérique pensée pour un défilement vertical, souvent publiée épisode par épisode.", "Le terme vient d’abord du modèle coréen mais est désormais utilisé plus largement.", [], "Webtoon décrit surtout un format de publication."),
    entry("Yonkoma", "source", "Manga en bandes de quatre cases, souvent construit autour d’une chute comique.", ["4-koma", "四コマ"], "Une adaptation peut développer fortement ces courtes scènes."),
    entry("Dōjinshi", "source", "Publication indépendante ou autoéditée, originale ou dérivée d’une œuvre existante.", ["doujinshi", "同人誌"], "Le terme ne désigne pas uniquement du contenu adulte."),

    // Production.
    entry("Mangaka", "production", "Auteur ou autrice de manga, pouvant assurer scénario, dessin ou les deux.", ["漫画家"], "Sur certaines œuvres, scénariste et dessinateur sont séparés."),
    entry("Auteur original", "production", "Créateur de l’œuvre source ou du concept adapté.", ["original creator"], "Ce n’est pas nécessairement le réalisateur de l’anime."),
    entry("Illustrateur", "production", "Artiste responsable notamment des illustrations d’un roman ou light novel.", [], "Il peut être différent du character designer de l’anime."),
    entry("Réalisateur", "production", "Responsable principal de la direction artistique et narrative de l’anime.", ["director", "kantoku"], "Son rôle diffère de celui du producteur."),
    entry("Studio d’animation", "production", "Société ou équipe chargée de produire tout ou partie de l’animation.", ["studio"], "Le studio seul ne résume pas tous les artistes ni les conditions de production."),
    entry("Comité de production", "production", "Groupement d’entreprises finançant et exploitant un projet d’animation.", ["production committee"], "Le studio n’est pas toujours le principal financeur."),
    entry("Staff", "production", "Ensemble de l’équipe créative et technique d’une production.", ["équipe"], "À distinguer du cast, qui désigne les interprètes."),
    entry("Cast", "production", "Ensemble des comédiens et interprètes d’une œuvre.", ["distribution vocale"], "Le cast ne comprend pas tout le staff technique."),
    entry("Seiyū", "production", "Comédien ou comédienne de doublage japonais.", ["seiyuu", "声優"], "Le terme n’est pas réservé aux voix d’anime."),
    entry("Character designer", "production", "Artiste adaptant ou créant l’apparence des personnages pour l’animation.", ["character design"], "Il ne dessine pas forcément chaque plan de la série."),
    entry("Series composition", "production", "Responsable de l’organisation globale du récit et de la répartition des épisodes.", ["composition de série"], "Ce rôle coordonne souvent plusieurs scénaristes."),
    entry("Storyboard", "production", "Découpage dessiné préparant plans, cadrages, mouvements et rythme d’une séquence.", ["ekonte", "絵コンテ"], "Ce n’est pas l’animation finale."),
    entry("Sakuga", "production", "Passage d’animation particulièrement remarquable par sa fluidité, son dessin ou sa mise en scène.", ["作画"], "Au Japon, sakuga signifie simplement dessin/animation ; l’usage international valorise souvent les scènes fortes."),
    entry("Genga", "production", "Dessins clés qui définissent les poses importantes et le mouvement principal.", ["key animation", "原画"], "Les intervalles sont réalisés ensuite."),
    entry("Dōga", "production", "Dessins intermédiaires et mise au propre reliant les images clés.", ["in-between animation", "動画"], "À ne pas confondre avec dōga au sens général de vidéo."),
    entry("Animation director", "production", "Superviseur corrigeant la cohérence des dessins et de l’animation sur un épisode ou une séquence.", ["directeur de l’animation", "sakkan"], "Il ne s’agit pas toujours du réalisateur de l’épisode."),
    entry("Episode director", "production", "Responsable de la mise en scène concrète d’un épisode sous la direction générale de la série.", ["réalisateur d’épisode"], "Plusieurs réalisateurs d’épisode peuvent travailler sur une série."),
    entry("Key visual", "production", "Illustration promotionnelle principale utilisée pour annoncer ou représenter une œuvre.", ["visuel clé"], "Ce n’est pas nécessairement une image tirée de l’anime."),
    entry("PV", "production", "Vidéo promotionnelle présentant images, ambiance, musique ou date de diffusion.", ["promotional video"], "Un PV peut contenir des plans provisoires."),
    entry("Teaser", "production", "Courte vidéo ou image destinée à susciter l’intérêt avant une bande-annonce plus complète.", [], "Le teaser révèle généralement moins d’informations qu’un trailer."),
    entry("Opening", "production", "Générique d’ouverture d’un anime.", ["OP"], "Le morceau complet peut différer de la version télévisée."),
    entry("Ending", "production", "Générique de fin d’un anime.", ["ED"], "Un anime peut avoir plusieurs endings selon les épisodes."),
    entry("OST", "production", "Bande originale musicale composée ou sélectionnée pour l’œuvre.", ["Original Soundtrack", "BO"], "OP et ED peuvent être publiés séparément de l’OST."),
    entry("Insert song", "production", "Chanson intégrée au déroulement d’un épisode plutôt qu’aux génériques.", ["chanson d’insertion"], "Elle peut accompagner une scène importante."),

    // Diffusion et traduction.
    entry("Simulcast", "localization", "Diffusion internationale d’un épisode peu après sa diffusion japonaise.", "Le délai peut aller de quelques minutes à quelques jours selon les accords.", [], "Simulcast ne signifie pas toujours disponibilité mondiale."),
    entry("Simulpub", "localization", "Publication traduite d’un chapitre presque simultanément avec sa sortie d’origine.", ["publication simultanée"], "Le terme s’applique surtout au manga et au roman."),
    entry("VOSTFR", "localization", "Version originale sous-titrée en français.", [], "La piste audio reste dans la langue originale."),
    entry("VF", "localization", "Version doublée en français.", ["doublage français"], "VF ne précise pas si d’autres pistes audio sont disponibles."),
    entry("Sub", "localization", "Version sous-titrée, généralement avec l’audio original.", ["subbed", "sous-titré"], "La qualité dépend de la traduction et du minutage."),
    entry("Dub", "localization", "Version doublée dans une autre langue.", ["dubbed", "doublage"], "Un dub est une nouvelle interprétation, pas une traduction mot à mot."),
    entry("Fansub", "localization", "Sous-titrage réalisé par des fans sans être la version officielle de l’ayant droit.", [], "Sa diffusion peut enfreindre les droits selon le contexte."),
    entry("Scantrad", "localization", "Numérisation et traduction non officielles d’un manga par des fans.", ["scanlation"], "À distinguer d’une édition numérique licenciée."),
    entry("Licence", "localization", "Autorisation accordée à une entreprise pour éditer ou diffuser une œuvre sur un territoire et une durée donnés.", ["licence d’exploitation"], "Une licence française ne garantit pas toutes les versions ou tous les pays francophones."),
    entry("Licensor", "localization", "Entreprise détenant ou accordant les droits de distribution d’une œuvre sur un marché.", ["concédant de licence"], "Le licensor peut être différent du studio."),
    entry("Streaming", "localization", "Lecture d’un contenu en ligne sans téléchargement complet préalable.", [], "La disponibilité dépend des pays, abonnements et dates d’expiration."),
    entry("Home video", "localization", "Édition destinée à la vente ou location domestique, par exemple Blu-ray ou DVD.", ["vidéo physique"], "Elle peut contenir des corrections par rapport à la version TV."),
    entry("Uncut", "localization", "Version non raccourcie ou moins censurée qu’une diffusion antérieure.", ["non censuré"], "Elle n’est pas forcément identique au master japonais original."),
    entry("Censure", "localization", "Modification, masquage ou retrait d’un contenu pour respecter une réglementation, un horaire ou une plateforme.", [], "Les versions TV et vidéo peuvent différer."),
    entry("Region lock", "localization", "Restriction d’accès basée sur le pays ou la zone géographique.", ["géoblocage"], "Elle vient des droits de diffusion et non de l’application ALM."),

    // Culture, narration et communauté.
    entry("Arc narratif", "community", "Ensemble d’épisodes ou chapitres formant une intrigue cohérente au sein d’une œuvre plus longue.", ["arc"], "Un arc n’est pas forcément une saison complète."),
    entry("Canon", "community", "Éléments considérés comme faisant partie de la continuité officielle principale.", [], "Le canon peut varier entre manga, anime, film et auteur."),
    entry("Filler", "community", "Contenu ajouté qui ne provient pas directement de la source principale, souvent pour laisser celle-ci avancer.", ["épisode de remplissage"], "Anime-original ne signifie pas automatiquement inutile ou non canonique."),
    entry("Anime-original", "community", "Scène, arc ou fin créée spécifiquement pour l’adaptation animée.", ["original anime content"], "Ce contenu peut être supervisé par l’auteur et devenir canon dans sa propre continuité."),
    entry("Moe", "community", "Attachement affectif à un personnage ou à des traits perçus comme adorables et touchants.", ["萌え"], "Moe est une réaction ou une esthétique, pas seulement un type de personnage."),
    entry("Chibi", "community", "Représentation très simplifiée avec petite taille et grosse tête, souvent utilisée pour l’humour ou la mignonnerie.", ["super deformed", "SD"], "Le mot chibi signifie littéralement petit, mais son usage visuel est codifié."),
    entry("Tsundere", "community", "Personnage alternant attitude dure ou distante et affection plus vulnérable.", ["ツンデレ"], "Le comportement peut évoluer ; ce n’est pas une excuse à toute forme de violence."),
    entry("Yandere", "community", "Personnage dont l’affection devient obsessionnelle, possessive ou dangereuse.", ["ヤンデレ"], "Le terme décrit un archétype fictionnel."),
    entry("Kuudere", "community", "Personnage calme, froid ou peu expressif qui révèle progressivement son affection.", ["クーデレ"], "À distinguer d’un personnage simplement indifférent."),
    entry("Dandere", "community", "Personnage très silencieux ou timide qui s’ouvre dans un environnement de confiance.", ["ダンデレ"], "La réserve vient souvent de la timidité plutôt que du détachement."),
    entry("Waifu", "community", "Terme de communauté pour désigner un personnage féminin fictif particulièrement apprécié.", [], "Il s’agit d’un usage humoristique ou affectif, pas d’une catégorie officielle."),
    entry("Husbando", "community", "Équivalent communautaire de waifu pour un personnage masculin fictif particulièrement apprécié.", [], "Ce n’est pas une catégorie éditoriale."),
    entry("Otaku", "community", "Au Japon, personne très investie dans un domaine ; à l’international, fan passionné d’anime et de manga.", ["おたく"], "Le sens et la connotation varient selon le pays et le contexte."),
    entry("Fujoshi / Fudanshi", "community", "Termes désignant respectivement une femme ou un homme amateur de Boys’ Love.", ["腐女子", "腐男子"], "Ce sont des auto-désignations communautaires dont l’usage dépend des personnes."),
    entry("AMV", "community", "Montage vidéo amateur associant des images d’anime à une musique.", ["Anime Music Video"], "Ce n’est pas une bande-annonce officielle."),
    entry("Cosplay", "community", "Pratique consistant à incarner un personnage par le costume, le maquillage et parfois le jeu de rôle.", ["costume play"], "Elle concerne de nombreux médias, pas seulement l’anime."),
    entry("Ship", "community", "Soutien ou préférence d’un fan pour une relation entre deux personnages.", ["shipping", "couple préféré"], "Un ship n’est pas nécessairement canon."),
    entry("Spoiler", "community", "Information révélant un élément important de l’intrigue avant que le public ne le découvre.", ["divulgâcheur"], "La sensibilité aux spoilers varie ; il vaut mieux les signaler."),
    entry("Headcanon", "community", "Interprétation personnelle qu’un fan considère plausible sans confirmation officielle.", ["canon personnel"], "Ce n’est pas une information canonique."),
    entry("Retcon", "community", "Modification rétroactive de la continuité ou d’un fait établi.", ["retroactive continuity"], "Une nouvelle explication n’est pas toujours un retcon si elle ne contredit rien."),
    entry("Hiatus", "community", "Pause temporaire dans la publication ou la production d’une œuvre.", ["pause"], "Un hiatus n’est pas nécessairement une annulation."),
    entry("Cour 1 / Cour 2", "community", "Notation utilisée pour distinguer les blocs trimestriels d’une même diffusion.", ["first cour", "second cour"], "À ne pas supposer automatiquement équivalent à Saison 1 / Saison 2."),
    entry("Watch order", "community", "Ordre conseillé pour regarder les séries, films, OVA et spin-off d’une franchise.", ["ordre de visionnage"], "L’ordre de sortie et l’ordre chronologique peuvent différer."),
    entry("Backlog", "community", "Ensemble des œuvres mises de côté et encore à regarder ou lire.", ["pile à voir"], "Dans ALM, cela correspond souvent au statut « À voir / Plan to Watch »."),
    entry("Drop", "community", "Arrêt volontaire du visionnage d’une œuvre avant sa fin.", ["Dropped", "abandonné"], "Ce statut peut être changé plus tard dans la bibliothèque."),
    entry("Rewatch", "community", "Nouveau visionnage d’une œuvre déjà terminée.", ["revisionnage"], "Certaines plateformes comptent séparément le nombre de rewatchs.")
  ];

  const state = { query: "", category: "all", letter: "all", suggestionIndex: -1, favouritesOnly: false, page: 0, pageSize: 24, resultKey: "" };
  function readTerms(key) { try { const v=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(v)?v.filter(t=>typeof t==="string"&&ENTRIES.some(e=>e.term===t)):[]; } catch { return []; } }
  const favourites = new Set(readTerms("alm.glossary.favourites.v1"));
  let recentlyRead = readTerms("alm.glossary.recent.v1").slice(0,8);
  let featuredIndex = Math.max(0,ENTRIES.findIndex(i=>i.term==='Iyashikei'));
  function saveTerms(key,value) { try { localStorage.setItem(key,JSON.stringify(value)); } catch {} }
  function rememberTerm(term) {
    recentlyRead=[term,...recentlyRead.filter(t=>t!==term)].slice(0,8);
    saveTerms("alm.glossary.recent.v1",recentlyRead);renderDiscovery();
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[’']/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  }

  function searchable(entryData) {
    return normalize([
      entryData.term,
      displayTerm(entryData),
      ...(entryData.aliases || []),
      CATEGORIES[entryData.category] || "",
      entryData.definition,
      window.ALM_GLOSSARY_COPY?.[lexiconLocale()]?.[entryData.term] || "",
      entryData.details,
      entryData.confusion,
      entryData.libraryGenre
    ].join(" "));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function firstLetter(term) {
    const normalized = normalize(term);
    return /^[a-z]/.test(normalized) ? normalized[0].toUpperCase() : "#";
  }

  function filteredEntries() {
    const words = normalize(state.query).split(" ").filter(Boolean);
    return ENTRIES.filter(item => {
      if (state.favouritesOnly && !favourites.has(item.term)) return false;
      if (state.category !== "all" && item.category !== state.category) return false;
      if (state.letter !== "all" && firstLetter(item.term) !== state.letter) return false;
      if (words.length && !words.every(word => searchable(item).includes(word))) return false;
      return true;
    }).sort((a, b) => a.term.localeCompare(b.term, "fr", { sensitivity: "base" }));
  }

  function exampleShellMarkup(item) {
    const ids = Array.isArray(LEXICON_EXAMPLES[item.term]) ? LEXICON_EXAMPLES[item.term].slice(0, 2) : [];
    if (!ids.length) return "";
    const copy = lexiconLocalized(item);
    return `<div class="lexicon-examples" data-lexicon-example-ids="${ids.join(",")}">
      <div class="lexicon-examples-heading"><span>${escapeHtml(copy.known)}</span><small>${escapeHtml(copy.visuals)}</small></div>
      <div class="lexicon-example-list">${ids.map(() => `<div class="lexicon-example-skeleton"><span></span><i></i></div>`).join("")}</div>
    </div>`;
  }

  function renderLexiconExampleContainer(container) {
    const ids = String(container?.dataset?.lexiconExampleIds || "")
      .split(",").map(value => Number(value)).filter(value => Number.isFinite(value) && value > 0);
    if (!ids.length) return;
    const items = ids.map(id => lexiconExampleCache.get(id)).filter(Boolean);
    if (!items.length) {
      container.classList.add("is-unavailable");
      const l = {known:designText("knownExamples"),unavailable:designText("examplesUnavailable"),visuals:designText("visualReferences")};
      container.innerHTML = `<div class="lexicon-examples-heading"><span>${escapeHtml(l?.known || "Exemples connus")}</span></div><p>${escapeHtml(l?.unavailable || "Références indisponibles dans la metadata locale.")}</p>`;
      return;
    }
    container.classList.remove("is-unavailable");
    const l = {known:designText("knownExamples"),unavailable:designText("examplesUnavailable"),visuals:designText("visualReferences")};
    container.innerHTML = `<div class="lexicon-examples-heading"><span>${escapeHtml(l?.known || "Exemples connus")}</span><small>${escapeHtml(l?.visuals || "références visuelles")}</small></div>
      <div class="lexicon-example-list">${items.map(example => `
        <a class="lexicon-example" href="${escapeHtml(example.malUrl || "#")}" ${example.malUrl ? `target="_blank" rel="noopener"` : ""} title="${escapeHtml(example.title)}">
          <span class="lexicon-example-poster">${example.imagePath ? `<img src="${escapeHtml(example.imagePath)}" alt="Affiche de ${escapeHtml(example.title)}" loading="lazy" referrerpolicy="no-referrer" data-image-fallback="true">` : ""}<i aria-hidden="true">🎌</i></span>
          <span class="lexicon-example-copy"><strong>${escapeHtml(example.title)}</strong><small>${escapeHtml([example.type, example.year].filter(Boolean).join(" · "))}</small></span>
        </a>`).join("")}</div>`;
  }

  async function fetchLexiconExampleBatch(ids) {
    const wanted = Array.from(new Set((ids || []).map(Number).filter(id => Number.isFinite(id) && id > 0))).sort((a, b) => a - b);
    if (!wanted.length) return;
    const requestKey = wanted.join(",");
    if (!lexiconExampleRequests.has(requestKey)) {
      const request = fetch(`/api/v2/lexicon/examples?ids=${encodeURIComponent(requestKey)}`)
        .then(async response => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error || "Exemples indisponibles");
          // Mémoriser aussi les identifiants absents évite de relancer la même
          // requête à chaque filtre lorsque la metadata locale ne les possède pas.
          for (const id of wanted) if (!lexiconExampleCache.has(id)) lexiconExampleCache.set(id, null);
          for (const item of (Array.isArray(payload?.items) ? payload.items : [])) {
            const id = Number(item?.malId || 0);
            if (id > 0) lexiconExampleCache.set(id, item);
          }
        })
        .catch(() => {})
        .finally(() => { lexiconExampleRequests.delete(requestKey); });
      lexiconExampleRequests.set(requestKey, request);
    }
    await lexiconExampleRequests.get(requestKey);
  }

  async function hydrateLexiconExamples(root) {
    const containers = [...(root?.querySelectorAll?.("[data-lexicon-example-ids]") || [])].filter(c => !c.closest(".studio-term-detail") || c.closest(".studio-term-detail").open);
    if (!containers.length) return;
    const allIds = Array.from(new Set(containers.flatMap(container => String(container.dataset.lexiconExampleIds || "")
      .split(",").map(Number).filter(id => Number.isFinite(id) && id > 0))));
    const missing = allIds.filter(id => !lexiconExampleCache.has(id));
    if (missing.length) await fetchLexiconExampleBatch(missing);
    containers.forEach(renderLexiconExampleContainer);
  }

  function termStyle(item){const index=Math.max(0,ENTRIES.indexOf(item)),slot=index%56;return `background-image:url('/assets/design/terms-atlas-${Math.floor(index/56)+1}.png');background-size:800% 700%;background-position:${slot%8*100/7}% ${Math.floor(slot/8)*100/6}%`;}
  function universeArt(item){const index=Math.max(0,ENTRIES.indexOf(item)),slot=index%56;return `<svg class="universe-picture" viewBox="${slot%8*100} ${Math.floor(slot/8)*100} 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><image href="/assets/design/terms-atlas-${Math.floor(index/56)+1}.png" width="800" height="700"/></svg>`;}
  function cardMarkup(item) {
    const copy=lexiconLocalized(item),star=window.ALM_DESIGN?.icon("star") || "&#9734;";
    const aliases=item.aliases?.length ? `<div class="lexicon-aliases">${escapeHtml(copy.also)} : ${item.aliases.map(a=>`<span translate="no">${escapeHtml(a)}</span>`).join("")}</div>`:"";
    const sourceNotes=copy.originalFrench ? `<details class="studio-original-notes"><summary>${escapeHtml(designText("originalFrench"))}</summary><div lang="fr" translate="no"><p>${escapeHtml(item.definition)}</p><p>${escapeHtml(item.details)}</p><p>${escapeHtml(item.confusion)}</p></div></details>` : `${copy.details?`<p class="lexicon-details">${escapeHtml(copy.details)}</p>`:""}${copy.confusion?`<div class="lexicon-confusion"><strong>${escapeHtml(copy.remember)}</strong><span>${escapeHtml(copy.confusion)}</span></div>`:""}`;
    return `<article class="lexicon-card" data-term="${escapeHtml(item.term)}" data-category="${escapeHtml(item.category)}" data-no-i18n>
      <button type="button" class="studio-term-favourite" data-favourite-term="${escapeHtml(item.term)}" aria-pressed="${favourites.has(item.term)}" aria-label="${escapeHtml(designText(favourites.has(item.term)?"unsaveTerm":"saveTerm"))}">${star}</button>
      <div class="nocturne-term-art" style="${termStyle(item)}" aria-hidden="true"></div><header><div><span class="lexicon-category-chip">${escapeHtml(copy.category)}</span><h3 translate="no">${escapeHtml(displayTerm(item))}</h3></div></header>
      <p class="lexicon-definition">${escapeHtml(copy.definition)}</p>
      <details class="studio-term-detail" data-read-term="${escapeHtml(item.term)}"><summary>${escapeHtml(designText("moreDetail"))}</summary>${aliases}${sourceNotes}${exampleShellMarkup(item)}${item.libraryGenre?`<button type="button" class="lexicon-library-button" data-lexicon-genre="${escapeHtml(item.libraryGenre)}">${escapeHtml(copy.library)}</button>`:""}</details>
    </article>`;
  }

  function renderDiscovery() {
    const overview=document.getElementById("studioLexiconOverview"),aside=document.getElementById("studioLexiconAside"),D=window.ALM_DESIGN;
    if(!overview||!aside||!D)return;
    overview.innerHTML=`<span>${D.icon("book")}<b>${escapeHtml(designText("termCount",{n:ENTRIES.length}))}</b></span><span>${D.icon("compass")}<b>${escapeHtml(designText("categoryCount",{n:Object.keys(CATEGORIES).length}))}</b></span><button type="button" data-show-favourites="0" aria-pressed="${!state.favouritesOnly}">${D.icon("library")}<span>${escapeHtml(designText("allTerms"))}<small>${escapeHtml(designText("recentTerms"))} · ${recentlyRead.length}</small></span></button><button type="button" data-show-favourites="1" aria-pressed="${state.favouritesOnly}">${D.icon("heart")}<span>${escapeHtml(designText("favourites"))}<small>${favourites.size}</small></span></button>`;
    const selected=ENTRIES[featuredIndex%ENTRIES.length],l=lexiconLocalized(selected);
    const universes=[['Fantasy',0,'universeFantasy'],['Romance',1,'universeRomance'],['Action',2,'universeAction'],['School',3,'universeSchool'],['Mecha',4,'universeMecha'],['Mystery',5,'universeMystery']];
    aside.innerHTML=`<section class="studio-panel studio-featured-term"><h3>${D.icon("star")} ${escapeHtml(designText("featuredTerm"))}</h3><div class="nocturne-featured-copy"><div class="nocturne-featured-art" style="${selected.term==='Iyashikei'?"background-image:url('/assets/design/aster-cat.webp');background-size:cover;background-position:center":termStyle(selected)}" aria-hidden="true"></div><div><strong translate="no">${escapeHtml(displayTerm(selected))}</strong><p>${escapeHtml(l.definition)}</p></div></div><button type="button" data-feature-open>${escapeHtml(designText("readMore"))}</button><button type="button" data-feature-next>${escapeHtml(designText("anotherTerm"))} &#8594;</button></section>
    <section class="studio-panel"><h3>${D.icon("compass")} ${escapeHtml(designText("exploreUniverses"))}</h3><div class="nocturne-universe-grid">${universes.map(([query,art,label])=>`<button type="button" class="nocturne-art" data-universe="${query}">${universeArt(ENTRIES.find(item=>String(item.libraryGenre||item.term).toLowerCase()===query.toLowerCase())||ENTRIES[art])}<span>${escapeHtml(designText(label))}</span></button>`).join('')}</div></section>
    <section class="studio-panel"><h3>${D.icon("info")} ${escapeHtml(designText("usefulGuide"))}</h3><ul class="nocturne-useful"><li>${escapeHtml(designText("guideSearch"))}</li><li>${escapeHtml(designText("guideExplore"))}</li><li>${escapeHtml(designText("guideSave"))}</li></ul><small>${escapeHtml(designText("offlineGuide"))}</small></section>
    <section class="studio-panel"><h3>${escapeHtml(designText("recentTerms"))}</h3><div class="studio-recent-terms">${recentlyRead.length?recentlyRead.map(term=>`<button type="button" data-recent-term="${escapeHtml(term)}" translate="no">${escapeHtml(displayTerm(ENTRIES.find(e=>e.term===term)||{term}))}</button>`).join(""):`<p>${escapeHtml(designText("noRecent"))}</p>`}</div></section>`;
    aside.querySelectorAll('[data-universe]').forEach(button=>button.addEventListener('click',()=>{
      resetFilters();state.query=button.dataset.universe;
      const search=document.getElementById('lexiconSearch');if(search)search.value=state.query;
      renderResults();document.querySelector('.studio-lexicon-layout')?.scrollIntoView({block:'start'});
    }));
    overview.querySelectorAll('[data-show-favourites]').forEach(b=>b.addEventListener('click',()=>{state.favouritesOnly=b.dataset.showFavourites==='1';renderResults();}));
    aside.querySelector('[data-feature-next]')?.addEventListener('click',()=>{featuredIndex=(featuredIndex+17)%ENTRIES.length;renderDiscovery();});
    aside.querySelector('[data-feature-open]')?.addEventListener('click',()=>openTerm(selected.term));
    aside.querySelectorAll('[data-recent-term]').forEach(b=>b.addEventListener('click',()=>openTerm(b.dataset.recentTerm)));
  }
  function openTerm(term) {
    const item=ENTRIES.find(e=>e.term===term);if(!item)return;
    state.favouritesOnly=false;state.category="all";state.letter="all";
    const select=document.getElementById("lexiconCategory");if(select)select.value="all";
    chooseLexiconSuggestion(item);rememberTerm(term);
    const card=Array.from(document.querySelectorAll('.lexicon-card')).find(c=>c.dataset.term===term);
    if(card){const details=card.querySelector('.studio-term-detail');if(details)details.open=true;card.querySelector('summary')?.focus({preventScroll:true});}
  }

  function renderAlphabet() {
    const root = document.getElementById("lexiconAlphabet");
    if (!root) return;
    const letters = [...new Set(ENTRIES.map(item => firstLetter(item.term)))].sort();
    const allLabel = LEXICON_LOCALIZED[lexiconLocale()]?.all || "Tous";
    root.innerHTML = `<button type="button" class="${state.letter === "all" ? "active" : ""}" data-letter="all">${escapeHtml(allLabel)}</button>` +
      letters.map(letter => `<button type="button" class="${state.letter === letter ? "active" : ""}" data-letter="${letter}">${letter}</button>`).join("");
    if (root.dataset.bound !== "1") {
      root.dataset.bound = "1";
      root.addEventListener("click", event => {
        const button = event.target.closest("[data-letter]");
        if (!button) return;
        state.letter = button.dataset.letter || "all";
        root.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
        renderResults();
      });
    }
  }

  function syncCategoryGallery() {
    document.querySelectorAll("#lexiconCategoryGallery [data-lexicon-category]").forEach(button => {
      const active = (button.dataset.lexiconCategory || "all") === state.category;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function renderCategoryGallery() {
    const root = document.getElementById("lexiconCategoryGallery");
    if (!root) return;
    const countFor = category => ENTRIES.filter(item => item.category === category).length;
    const loc = LEXICON_LOCALIZED[lexiconLocale()];
    root.innerHTML = Object.entries(CATEGORIES).map(([category, label]) => {
      const shownLabel = window.ALM_DESIGN ? designText("category."+category) : loc?.categories?.[category] || label;
      const visual = CATEGORY_VISUALS[category] || { title: label, note: "" };
      return `<button type="button" class="lexicon-category-tile" data-category="${category}" data-lexicon-category="${category}" aria-pressed="false" title="${escapeHtml(loc?.display || "Afficher")} ${escapeHtml(shownLabel)}">
        <span class="lexicon-category-illustration" aria-hidden="true">${categoryIllustration(category, "tile")}</span>
        <span class="lexicon-category-copy"><strong>${escapeHtml(shownLabel)}</strong><small>${escapeHtml(loc?.categoryHelp?.[category] || visual.title)}</small><em>${lexiconLocale()==="fr"?escapeHtml(visual.note):""}</em></span>
        <span class="lexicon-category-total">${countFor(category)}</span>
      </button>`;
    }).join("");
    if (root.dataset.bound !== "1") {
      root.dataset.bound = "1";
      root.addEventListener("click", event => {
        const button = event.target.closest("[data-lexicon-category]");
        if (!button) return;
        const next = button.dataset.lexiconCategory || "all";
        state.category = state.category === next ? "all" : next;
        const select = document.getElementById("lexiconCategory");
        if (select) select.value = state.category;
        syncCategoryGallery();
        renderResults();
        document.querySelector(".lexicon-controls")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    syncCategoryGallery();
  }

  function renderCategories() {
    const select = document.getElementById("lexiconCategory");
    if (!select) return;
    const loc = LEXICON_LOCALIZED[lexiconLocale()];
    select.innerHTML = `<option value="all">${escapeHtml(loc?.allCategories || "Toutes les catégories")}</option>` + Object.entries(CATEGORIES)
      .map(([value, label]) => `<option value="${value}">${escapeHtml(window.ALM_DESIGN ? designText("category."+value) : loc?.categories?.[value] || label)}</option>`).join("");
    select.value = state.category;
  }

  function lexiconSuggestionCandidates() {
    const query = normalize(state.query);
    if (query.length < 1) return [];
    const words = query.split(" ").filter(Boolean);
    return ENTRIES.map(item => {
      if (state.category !== "all" && item.category !== state.category) return null;
      const term = normalize(item.term);
      const aliases = (item.aliases || []).map(normalize);
      const corpus = searchable(item);
      if (!words.every(word => corpus.includes(word))) return null;
      let score = 0;
      if (term === query) score += 100;
      else if (term.startsWith(query)) score += 70;
      else if (term.includes(query)) score += 45;
      if (aliases.some(alias => alias === query)) score += 85;
      else if (aliases.some(alias => alias.startsWith(query))) score += 60;
      else if (aliases.some(alias => alias.includes(query))) score += 35;
      return { item, score };
    }).filter(Boolean)
      .sort((a, b) => b.score - a.score || a.item.term.localeCompare(b.item.term, "fr", { sensitivity: "base" }))
      .slice(0, 8);
  }

  function hideLexiconSuggestions() {
    const box = document.getElementById("lexiconSuggestions");
    if (box) {
      box.innerHTML = "";
      box.classList.add("hidden");
    }
    state.suggestionIndex = -1;
    document.getElementById("lexiconSearch")?.setAttribute("aria-expanded", "false");
  }

  function chooseLexiconSuggestion(item) {
    if (!item) return;
    state.query = item.term;
    state.letter = "all";
    state.suggestionIndex = -1;
    const search = document.getElementById("lexiconSearch");
    if (search) search.value = item.term;
    document.querySelectorAll("#lexiconAlphabet button").forEach(button => button.classList.toggle("active", button.dataset.letter === "all"));
    hideLexiconSuggestions();
    renderResults();
    setTimeout(() => {
      const card = Array.from(document.querySelectorAll(".lexicon-card")).find(node => node.dataset.term === item.term);
      card?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }, 0);
  }

  function renderLexiconSuggestions() {
    const box = document.getElementById("lexiconSuggestions");
    const search = document.getElementById("lexiconSearch");
    if (!box || !search) return;
    const suggestions = lexiconSuggestionCandidates();
    if (!suggestions.length) return hideLexiconSuggestions();
    box.innerHTML = suggestions.map(({ item }, index) => {
      const aliases = (item.aliases || []).slice(0, 3).join(", ");
      return `<button type="button" role="option" data-lexicon-suggestion-index="${index}">
        <span class="lexicon-suggestion-copy"><strong>${escapeHtml(displayTerm(item))}</strong>${aliases ? `<small>${escapeHtml(designText("alsoCalled"))} : ${escapeHtml(aliases)}</small>` : ""}</span>
        <span class="lexicon-suggestion-category">${escapeHtml(lexiconLocalized(item).category)}</span>
      </button>`;
    }).join("");
    box.classList.remove("hidden");
    search.setAttribute("aria-expanded", "true");
    box.querySelectorAll("button[data-lexicon-suggestion-index]").forEach((button, index) => {
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => chooseLexiconSuggestion(suggestions[index]?.item));
    });
  }

  function syncPagerVisibility() {
    const top=document.getElementById('studioLexiconPagerTop'),bottom=document.getElementById('studioLexiconPagerBottom');
    if(!top||!bottom)return;
    const pages=Number(top.dataset.pages)||1,layout=document.querySelector('.studio-lexicon-layout');
    top.hidden=pages<=1;
    bottom.hidden=pages<=1||!layout||layout.getBoundingClientRect().height<=Math.max(480,(window.innerHeight||720)*.9);
  }

  function renderResults() {
    const grid = document.getElementById("lexiconGrid");
    const count = document.getElementById("lexiconCount");
    if (!grid) return;
    const matched=filteredEntries();
    const key=JSON.stringify([state.query,state.category,state.letter,state.favouritesOnly]);
    if(state.resultKey!==key){state.page=0;state.resultKey=key;}
    const pages=Math.max(1,Math.ceil(matched.length/state.pageSize));
    state.page=Math.max(0,Math.min(state.page,pages-1));
    const items=matched.slice(state.page*state.pageSize,(state.page+1)*state.pageSize);
    const loc = LEXICON_LOCALIZED[lexiconLocale()];
    if(count) count.textContent = designText("termsShown",{shown:items.length,total:ENTRIES.length});
    grid.innerHTML = items.length
      ? items.map(cardMarkup).join("")
      : `<div class="lexicon-empty"><strong>${escapeHtml(loc?.empty || "Aucun terme trouvé.")}</strong><span>${escapeHtml(loc?.emptyHelp || "Essaie un mot plus court ou réinitialise les filtres.")}</span></div>`;
    grid.querySelectorAll("[data-lexicon-genre]").forEach(button => {
      button.addEventListener("click", () => {
        if (typeof window.openLibraryWithGenreV2 === "function") window.openLibraryWithGenreV2(button.dataset.lexiconGenre);
      });
    });
    grid.querySelectorAll('[data-favourite-term]').forEach(button=>button.addEventListener('click',()=>{
      const term=button.dataset.favouriteTerm;
      if(favourites.has(term))favourites.delete(term);else favourites.add(term);
      saveTerms('alm.glossary.favourites.v1',[...favourites]);
      if(state.favouritesOnly)renderResults();else{
        button.setAttribute('aria-pressed',String(favourites.has(term)));
        button.setAttribute('aria-label',designText(favourites.has(term)?'unsaveTerm':'saveTerm'));renderDiscovery();
      }
    }));
    grid.querySelectorAll('[data-read-term]').forEach(details=>details.addEventListener('toggle',()=>{
      if(details.open){rememberTerm(details.dataset.readTerm);hydrateLexiconExamples(details);}
    }));
    renderDiscovery();
    for(const id of ["studioLexiconPagerTop","studioLexiconPagerBottom"]){
      let pager=document.getElementById(id);
      if(!pager){pager=document.createElement("nav");pager.id=id;pager.className="studio-lexicon-pagination";pager.setAttribute("data-no-i18n","");pager.setAttribute("aria-label",designText("dictionary"));const layout=document.querySelector(".studio-lexicon-layout");if(id.endsWith("Top"))layout?.before(pager);else layout?.after(pager);}
      pager.dataset.pages=String(pages);
      pager.innerHTML=`<button type="button" data-lexicon-first ${state.page===0?"disabled":""} aria-label="${escapeHtml(designText('libraryFirstPage'))}">&lt;&lt;</button><button type="button" data-lexicon-prev ${state.page===0?"disabled":""} aria-label="${escapeHtml(designText('libraryPreviousPage'))}">&lt;</button><span>${state.page+1} / ${pages} · ${escapeHtml(designText("termsShown",{shown:items.length,total:matched.length}))}</span><button type="button" data-lexicon-next ${state.page>=pages-1?"disabled":""} aria-label="${escapeHtml(designText('libraryNextPage'))}">&gt;</button><button type="button" data-lexicon-last ${state.page>=pages-1?"disabled":""} aria-label="${escapeHtml(designText('libraryLastPage'))}">&gt;&gt;</button>`;
      pager.querySelector('[data-lexicon-first]')?.addEventListener('click',event=>{if(event.currentTarget.disabled)return;state.page=0;renderResults();window.ALM_SCROLL_PROGRESS?.toStart(document.getElementById('lexiconPage'),document.querySelector('#lexiconGrid .studio-term-detail>summary'));});
      pager.querySelector('[data-lexicon-last]')?.addEventListener('click',event=>{if(event.currentTarget.disabled)return;state.page=pages-1;renderResults();window.ALM_SCROLL_PROGRESS?.toStart(document.getElementById('lexiconPage'),document.querySelector('#lexiconGrid .studio-term-detail>summary'));});
      pager.querySelector('[data-lexicon-prev]')?.addEventListener('click',event=>{if(event.currentTarget.disabled)return;state.page--;renderResults();window.ALM_SCROLL_PROGRESS?.toStart(document.getElementById('lexiconPage'),document.querySelector('#lexiconGrid .studio-term-detail>summary'));});
      pager.querySelector('[data-lexicon-next]')?.addEventListener('click',event=>{if(event.currentTarget.disabled)return;state.page++;renderResults();window.ALM_SCROLL_PROGRESS?.toStart(document.getElementById('lexiconPage'),document.querySelector('#lexiconGrid .studio-term-detail>summary'));});
    }
    syncPagerVisibility();
  }

  function resetFilters() {
    state.query = "";
    state.favouritesOnly = false;
    state.category = "all";
    state.letter = "all";
    const search = document.getElementById("lexiconSearch");
    const category = document.getElementById("lexiconCategory");
    if (search) search.value = "";
    if (category) category.value = "all";
    document.querySelectorAll("#lexiconAlphabet button").forEach(button => button.classList.toggle("active", button.dataset.letter === "all"));
    syncCategoryGallery();
    hideLexiconSuggestions();
    renderResults();
  }

  window.initLexiconPage = function initLexiconPage() {
    const layout=document.querySelector('.studio-lexicon-layout');
    if(layout&&layout.dataset.pagingObserved!=='1'){
      layout.dataset.pagingObserved='1';
      if(window.ResizeObserver)new ResizeObserver(syncPagerVisibility).observe(layout);
      window.addEventListener('resize',syncPagerVisibility);
    }
    const total = document.getElementById("lexiconTotal");
    if (total) total.textContent = String(ENTRIES.length);
    renderCategories();
    renderCategoryGallery();
    renderAlphabet();
    const search = document.getElementById("lexiconSearch");
    const category = document.getElementById("lexiconCategory");
    const reset = document.getElementById("lexiconReset");
    if (search && search.dataset.ready !== "1") {
      search.dataset.ready = "1";
      search.setAttribute("aria-expanded", "false");
      search.addEventListener("input", () => {
        state.query = search.value;
        state.suggestionIndex = -1;
        if (state.query.trim()) {
          state.letter = "all";
          document.querySelectorAll("#lexiconAlphabet button").forEach(button => button.classList.toggle("active", button.dataset.letter === "all"));
        }
        renderResults();
        renderLexiconSuggestions();
      });
      search.addEventListener("focus", renderLexiconSuggestions);
      search.addEventListener("blur", () => setTimeout(hideLexiconSuggestions, 120));
      search.addEventListener("keydown", event => {
        const box = document.getElementById("lexiconSuggestions");
        const buttons = Array.from(box?.querySelectorAll("button[data-lexicon-suggestion-index]") || []);
        if (event.key === "Escape") {
          hideLexiconSuggestions();
          return;
        }
        if (!buttons.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          state.suggestionIndex = (state.suggestionIndex + delta + buttons.length) % buttons.length;
          buttons.forEach((button, index) => button.classList.toggle("active", index === state.suggestionIndex));
          buttons[state.suggestionIndex]?.scrollIntoView?.({ block: "nearest" });
        } else if (event.key === "Enter" && state.suggestionIndex >= 0) {
          event.preventDefault();
          buttons[state.suggestionIndex]?.click();
        }
      });
    }
    if (category && category.dataset.bound !== "1") {
      category.dataset.bound = "1";
      category.addEventListener("change", () => { state.category = category.value || "all"; syncCategoryGallery(); renderResults(); });
    }
    if (reset && reset.dataset.ready !== "1") {
      reset.dataset.ready = "1";
      reset.addEventListener("click", resetFilters);
    }
    renderResults();
  };

  if (typeof window.addEventListener === "function") {
    window.addEventListener("alm:language-changed", () => {
      renderCategories(); renderCategoryGallery(); renderAlphabet(); renderResults();
    });
  }

  window.ALM_LEXICON_VIEW = {openTerm, getFavourites:()=>[...favourites], getRecent:()=>recentlyRead.slice(), getVisible:()=>filteredEntries().map(e=>e.term)};
  window.__ALM_LEXICON_ENTRIES = ENTRIES;
  window.__ALM_LEXICON_EXAMPLES = LEXICON_EXAMPLES;
})();

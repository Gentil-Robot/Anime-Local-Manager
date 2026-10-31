ALM — mesures reproductibles, 21 octobre 2026

Prérequis : Node 24 (mesuré avec 24.19.0), npm ci sur les deux copies ; aucune mise à jour de dépendance. Conserver les sources Beta79 et une copie Beta80 séparées. Ces scripts ne sont pas livrés dans le paquet Electron. Utiliser exclusivement des profils synthétiques créés ci-dessous, jamais le dossier de données personnel.

Depuis un dossier extérieur aux deux sources, adapter BEFORE, AFTER et OUT à des chemins absolus. OUT doit être un nouveau dossier. Les commandes suivantes montrent la syntaxe ; les exécuter une à une, sans autre benchmark ni suite de tests en parallèle.

node --expose-gc AFTER/scripts/performance/measure-server.cjs BEFORE 1000 OUT/server-before-1000.json OUT/profile-before-1000
node --expose-gc AFTER/scripts/performance/measure-server.cjs AFTER 1000 OUT/server-after-1000.json OUT/profile-after-1000
node --expose-gc AFTER/scripts/performance/measure-server.cjs BEFORE 5000 OUT/server-before-5000.json OUT/profile-before-5000
node --expose-gc AFTER/scripts/performance/measure-server.cjs AFTER 5000 OUT/server-after-5000.json OUT/profile-after-5000

Puis, pour chaque version, lancer Electron installé dans BEFORE :
BEFORE/node_modules/electron/dist/electron --ozone-platform=headless --no-sandbox AFTER/scripts/performance/measure-renderer.cjs BEFORE OUT/profile-before-1000 OUT/ui-before-1000.json
BEFORE/node_modules/electron/dist/electron --ozone-platform=headless --no-sandbox AFTER/scripts/performance/measure-renderer.cjs AFTER OUT/profile-after-1000 OUT/ui-after-1000.json

--no-sandbox est une contrainte du conteneur root, réservée à ce banc isolé ; ne pas l'ajouter au lancement du produit. La fenêtre de mesure est affichée sur la surface Ozone headless 1400 x 900, sans accélération matérielle. Les accès non locaux sont bloqués. Sous Windows ou sur un poste avec écran, adapter le lancement Electron et supprimer les options du conteneur. Les IPC de réglages sont simulés ; ce n'est pas une mesure du lancement complet de main.js.

Autres scénarios :
node AFTER/scripts/performance/measure-owned.cjs OUT/profile-before-5000 OUT/catalog-owned.json
node AFTER/scripts/performance/measure-persistence.cjs BEFORE OUT/profile-before-5000 OUT/persistence-before.json
node AFTER/scripts/performance/measure-persistence.cjs AFTER OUT/profile-after-5000 OUT/persistence-after.json
node AFTER/scripts/performance/measure-i18n.cjs BEFORE AFTER OUT/i18n.json

Le test owned modifie temporairement un index dans le profil fictif, puis le supprime ; son ancienne requête peut durer plusieurs minutes. Ne pas le lancer sur les données réelles. Le test persistence réécrit les notes fictives puis restaure les valeurs de départ. Les empreintes et le marqueur perf-seeded protègent la comparaison ; le marqueur ne rend pas acceptable l'utilisation de données personnelles.

Données : 1000 ou 5000 fiches fictives, saisons regroupées par trois, 4 statuts, notes, synopsis de 400 caractères environ, genres et studios ; catalogue embarqué inchangé de 30430 fiches. Ce ne sont pas des volumes utilisateurs observés.

Statistiques : 3 échauffements puis 25 échantillons serveur (12 statistiques), 7 interface/écritures, médiane ; p95 seulement si n >= 20 et toujours exploratoire sur un petit échantillon. La préparation initiale du catalogue et de l'index est mesurée à part, avant les boucles. Les profils déjà créés et le cache OS sont chauds. Pour un lancement réellement à froid sur matériel cible, redémarrer l'OS et capturer des séries indépendantes ; ne pas vider le cache d'un poste utilisateur depuis ces scripts.

Comparer aussi les empreintes des réponses, les identifiants et l'ordre des cartes, l'ouverture de la dernière fiche, les cycles de mémoire après GC, le CPU et le coût d'écriture. La durée synchrone de render() et la durée jusqu'à deux frames sont distinctes ; deux requestAnimationFrame ne prouvent pas le temps de présentation des pixels. Aucun pourcentage global de vitesse ne peut être déduit de ces scénarios.

Contrôles complémentaires : measure-lookups.cjs BEFORE AFTER OUT OUT/lookups.json compare les recherches dans un même processus, en alternant leur ordre ; OUT doit contenir before5000 et after5000 (adapter ou renommer les profils créés ci-dessus). measure-snapshot.cjs AFTER OUT/profile-after-5000 OUT/snapshot.json alterne lecture avec référence de concurrence et lecture HTTP sans référence. validate-renderer.cjs utilise la même syntaxe Electron que measure-renderer.cjs et vérifie les trois vues, les sept langues jusqu’à 1000 fiches (français/anglais au-delà), le focus, l’ouverture de la dernière fiche et la conservation de sa note privée.

La Bêta80 affiche par défaut 60 cartes par page. Le banc measure-renderer bascule explicitement sur Tout afficher pour comparer les mêmes cartes et le même travail DOM avec la Bêta79. Il ne présente donc pas une page de 60 cartes comme un rendu complet de 5000. measure-paging.cjs (même syntaxe Electron, profil fictif de 5000) mesure séparément la première page, la page suivante, l’accès à la dernière fiche et un parcours de toutes les pages répété trois fois. Il vérifie les 5000 identifiants dans leur ordre, la recherche globale et l’absence de mutation. Le travail des pages suivantes est différé à leur visite, pas supprimé. validate-renderer vérifie la dernière page dans les trois modes de vue et les sept langues.

Secours sql.js : node --expose-gc AFTER/scripts/performance/measure-fallback.cjs AFTER OUT/profile-after-5000 OUT/fallback.json. Utiliser aussi BEFORE pour la comparaison. Cinq répétitions des exports et copies mémoire, un seul démarrage vierge ; le chrono de construction Database(bytes) ne comprend pas les premières lectures SQLite, lesquelles restent vérifiées séparément. Une mise à jour durable ne change qu’une fiche dans une bibliothèque de 5000 et ne doit pas être comparée à la réécriture de toutes les notes du banc persistence.

GAP & UPGRADE — 24 octobre 2026 (ALM Beta 82)

Test de sauvegarde d'affiches locales fictives (hors serveur HTTP, sans donnees
personnelles, avec 3 iterations de chauffe puis 17 iterations mesurees) :

    node scripts/performance/bench-gap82-upload.cjs

Rejouer exactement la meme commande dans une copie de la Beta 82 de reference
pour comparer. Ne pas en deduire une amelioration generale du demarrage
Electron ou du temps global de l'import. La mesure immediate estime le temps
de monopolisation synchrone de la boucle d'evenements, la mesure complete
inclut l'ecriture. Le cache du noyau rend les delais d'ecriture tres variables.
L'execution reste possible avec Node >=22.12, sans npm install.

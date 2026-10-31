# Beta 82 - Passe ciblée de profilage et sécurité (24 octobre 2026)

## Base immuable

`Anime-Local-Manager-Beta82-GAP-UPGRADE-2026-10-24-COMPLET.zip` : SHA-256 `37d6737f8761ca5045bcb61d904947b0778635784511db91cd03e360765b26e4`.
Manifest SHA-256 initial `492710840e084e4d31bee9161cc12c4c659b8e02f9b9cd84ae0b5f503c3a4da2` : 637 fichiers.
Les sources de travail sont copiées sans écraser l'archive d'origine.

Les fichiers `publication-2026-10-24T10-23-36-500Z.json/.log` cités dans les consignes ne sont pas accessibles localement. Les rapports `verification.json/.log` disponibles correspondent à un échec du 23 octobre : **ne pas les utiliser comme preuve de la publication du 24 octobre**. Le bilan Windows de 133 suites réussies et 990,608 secondes est communiqué par l'utilisateur et doit être confirmé sur ses fichiers originaux.

## Changement 1 : Electron safeStorage

Electron 45.0.0 déprécie les trois méthodes synchrones (suppression annoncée en 46). `main.js` utilise désormais `lib/system-secrets.js` et les méthodes asynchrones ; `decryptStringAsync()` renvoie un objet contenant `result`.

- Chiffrements anciens : `decryptStringAsync()` relit leurs octets d'origine ; il n'y a ni effacement ni réécriture en cas d'erreur.
- Si `shouldReEncrypt` vaut `true`, une seconde lecture vérifie le même secret avant nouveau chiffrement et écriture atomique ; tout échec ou désaccord laisse les octets initiaux inchangés.
- Si une clé chiffrée est présente mais inaccessible, l'application refuse son remplacement et signale l'échec.
- Si le fichier de clé de connexion manque mais que la configuration est chiffrée, aucune nouvelle clé aléatoire n'est créée.
- `lib/encrypted-backup.js` ne transforme plus une erreur de lecture en chaîne vide. La dernière clé chargée n'est pas effacée à la suite d'une erreur de rechargement.
- Pas de stockage de clés en clair introduit. Le repli `basic_text` est refusé pour ces fichiers.

Tests : `node scripts/test-beta82-safe-storage.cjs` avec fausses clés/profils ; `scripts/test-beta69-engine-electron.cjs` exécute en plus un aller-retour OS réel avec un chiffrement hérité dans un profil temporaire, lors du passage `seed` du test Beta69, **sans lancement Electron supplémentaire**. Sous Windows, il exige un fournisseur système opérationnel. Les autres systèmes signalent `not-available` si aucun fournisseur sûr n'est disponible.

Docs officiels :
- https://www.electronjs.org/blog/electron-45-0
- https://www.electronjs.org/docs/latest/breaking-changes
- https://www.electronjs.org/docs/latest/api/safe-storage

## Changement 2 : copies de dépendances redondantes

Les tests `test-beta69-package.cjs` et `test-beta58-smoke.js` copiaient récursivement tous les chemins `npm ls --parseable --all --omit=dev`, même lorsque des répertoires fils étaient déjà inclus dans le paquet parent. `scripts/production-copy-roots.js` sélectionne les ancêtres minimaux, rejette les chemins extérieurs au `node_modules` du projet, puis copie les mêmes octets. Les constructions ASAR et les essais réels sont conservés.

Benchmark reproductible : `node scripts/test-beta82-production-copy.cjs`. Fixture synthétique de 10 parents, 50 enfants et 750 fichiers ; sept répétitions ; SHA-256 de tous les fichiers copiés contrôlés. Il s'agit d'une mesure des copies locales en Node/Linux, **pas** d'un gain du temps global de publication Windows.

## Changement 3 : attribution des durées

- `scripts/package-phase-timer.js` et les scripts Beta69/Beta71 publient leurs phases dans `verification.log` (sans noms de profils ni secrets).
- `scripts/release-windows.js` enregistre `preparationTimings` : contrôle source, workspace, npm version, empreinte, copie/contrôle du stage et prévol NSIS ; il indique `wallDurationMs` (depuis le début du contrôle des sources), `stepsTotalMs` et `unattributedMs` dans le journal de publication.
- Ne pas confondre temps de smoke complet et temps jusqu'à interface utilisable.

## Limites

Le poste d'analyse est Linux/Node 22.16.0 ; les dépendances npm ne peuvent pas être installées depuis le registre dans ce conteneur. Les tests de packaging complets et la migration avec DPAPI réelle restent à confirmer sur Windows avec `Publier Installateur Windows.bat`. `npm audit` actualisé et installateur NSIS à revalider, aucune modification à Vercel/Supabase/Resend/Cloudflare.

Aucune accélération arbitraire par suppression de tests, de vidéo, du snapshot de 30 430 fiches, de politique de sécurité ou de chiffrement.

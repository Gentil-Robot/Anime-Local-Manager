# ALM V2.0.0 Beta 82 — correctifs de la Beta 81 validée

Date : 23 octobre 2026. La Beta 81 Reprise80 Nocturne validée est la base de référence. Archive source Beta81 originale SHA-256 : `ee2358d981ccd5d00100f8d4df00193547a2745f54863e9c0d070b40d4eec49c`. La Beta 80 d'origine n'a pas été réouverte ni modifiée.

## Correctifs effectivement inclus

1. **Electron 45.0.0** : version exacte dans `package.json` et `package-lock.json`, empreinte npm `sha512` vérifiée à partir de plusieurs copies publiques du fichier de verrouillage de ce paquet. Electron 45 utilise Node.js 24.22.0 *à l'intérieur d'Electron* ; les scripts de publication continuent à utiliser Node.js 22, version conseillée 22.23.3 au 23/10, puis 22.23.4 au 24/10 (GAP & UPGRADE).
2. **Node.js externe** : `.node-version` et `.nvmrc` harmonisés sur `22.23.3` lors de cette recette du 23/10, relevés à `22.23.4` lors de la passe GAP & UPGRADE du 24/10.
3. **Port de repli** : la fonction Edge `alm-public` accepte les origines locales `127.0.0.1` et `localhost` avec ports `3123..3143`, exactement les 21 tentatives du serveur local en cas d'occupation de ports. Le site `https://animelocalmanager.com` reste autorisé. Les autres origines sont refusées ; `Vary: Origin` est conservé, et CAPTCHA et limites serveur continuent de s'appliquer. Une autorisation CORS ne constitue pas une authentification.
4. **Qualité de diffusion** : nouveau test isolé `scripts/test-beta82-prepublication.cjs`, 128e étape dans `scripts/verification-plan.json`. Il couvre les versions, la compatibilité statique du preload Electron 45, les politiques de sécurité Electron, le port de repli, la fermeture des origines non reconnues et le rejet de contact sans CAPTCHA.
5. **Préparation Windows** : `Verifier Beta82 Windows.bat` exécute `npm ci`, `npm list electron`, `npx --no-install electron --version`, `npm audit`, le nouveau test et l'ensemble du plan de vérification. `Publier Installateur Windows.bat` reste l'outil NSIS officiel pour construire et contrôler l'installateur Windows.
6. **Traçabilité** : version de la publication, manifestes SHA-256, identifiant de livraison et référence de l'archive validée mis à jour. Les sources Beta81 ne sont pas modifiées dans leur archive d'origine.

## Vérifications réellement exécutées dans l'environnement de préparation

| Contrôle | Résultat |
|---|---|
| Versions pkg/lock Electron 45, Node pins et preload | OK |
| Test isolé origine HTTP/port & réponse sans CAPTCHA | OK |
| `node --check` des 391 JS/CJS | OK |
| `node scripts/check-source-files.js` | OK après régénération des manifestes |
| `node scripts/test-source-files.js` | OK |
| `node scripts/audit-locales.js --strict` | OK : sept langues, 1 095 clés chacune |
| `npm ci` / audit npm du livrable dans l'environnement | Non exécutables : connexion à `registry.npmjs.org` indisponible (`EAI_AGAIN`). L'utilisateur a cependant montré un `npm audit` à zéro sur **sa copie locale**, qui n'est pas cette archive Beta82. |
| Plan intégral des 128 suites | Non rejoué ici : dépendances absentes. A lancer sur Windows avec `Verifier Beta82 Windows.bat`. |
| Installation NSIS & VM Windows | Non testé dans cet environnement Linux. |
| Déploiement du site / Edge Supabase / SQL | **Non effectué**. Les ressources distantes demeurent dans leur état précédemment observé (Beta 76), sous réserve d'évolution externe. |

## Vérifications/bloquants avant *publication générale*

- **Compatibilité distante** : contrôler migrations, droits RLS, CAPTCHA, confirmation newsletter, désinscription, contacts et diagnostic. Publier seulement un couple site Vercel / `alm-public` construit et testé depuis **les mêmes sources Beta82**, après vérification de l'environnement, sans perdre la possibilité de rollback.
- **AniList** : conditions officielles interdisant une API concurrente de liste/tracker ; accord écrit ou architecture alternative conforme indispensable. Une modification technique de ce dossier ne remplace pas une autorisation contractuelle. https://docs.anilist.co/guide/terms-of-use
- **Vercel Hobby** : qualification de l'usage non commercial et des éventuels dons ; choix d'une offre ou plateforme autorisée si nécessaire. https://vercel.com/docs/plans/hobby
- **RGPD/mineurs** : identité légale, responsabilités, conservation, DPA et sous-traitants, droits des personnes, âge et politique de contenus à décider et à documenter sans inventer des informations personnelles.
- **Sauvegardes** : export chiffré et *restauration isolée* des données communautaires/Auth ; migrations SQL seules ne sont pas une sauvegarde fonctionnelle. Pas de restauration ou d'export sensible effectué lors de cette préparation.
- **Windows** : tests sur VM propre, signature éventuelle, droits non administrateurs, tâches de maintenance, mise à jour sans perte, sauvegarde locale, désinstallation puis réinstallation.
- **Audit de sécurité** : constater réellement les résultats de `npm audit` et des suites après `npm ci` sur l'archive finale. Les versions des applications déployées doivent correspondre au même jeu de sources.

## Recette Windows recommandée

1. Extraire l'archive Beta82 dans un dossier neuf, ne pas installer npm dans `C:\Windows\System32`.
2. Se placer dans le nouveau dossier du projet et lancer `Verifier Beta82 Windows.bat`.
3. Contrôler les résultats des 128 suites et de `npm audit` ; arrêter en cas d'erreur.
4. Lancer `Publier Installateur Windows.bat`, puis vérifier `dist/release-check.json`, l'empreinte et la signature éventuelle du `.exe`.
5. Essayer sur VM Windows, y compris scénario de port 3123 occupé, formulaires réels avec une adresse de test consentante et export/restauration sur données fictives.
6. Déployer le site et la fonction Edge uniquement **après** ces validations et les décisions légales ci-dessus.

**Verdict de préparation :** les changements techniques ci-dessus sont inclus et testés de façon isolée. Cette archive **n'est pas une attestation de publication générale prête** ; les preuves d'installation et les décisions externes restent à obtenir.


## Correctif de publication Windows intégré (23 octobre 2026)

Le bouton existant choisit maintenant automatiquement un espace court, réutilise les étapes vérifiées et remet les livrables dans le `dist/` d’origine. Aucun script supplémentaire à créer. Le plan courant contient 129 suites (les 128 précédentes et un nouveau groupe de 33 contrôles ciblés). Les nombres 128 plus haut décrivent la livraison précédente.

L’erreur NSIS du journal correspond à un chemin de 276 caractères. La nouvelle sélection et le contrôle des entrées plafonnent les chemins critiques à 230 caractères. Les essais Electron attendent leur processus enfant ; les suppressions transitoirement verrouillées sont retentées de manière asynchrone et bornée. Aucun contournement de test, antivirus ou contrôle d’intégrité.

Les tests du correctif utilisent des fichiers réels et une simulation contrôlée des compilations pour valider les chemins, reprises, erreurs, empreintes et livraisons. Ils ne remplacent pas une compilation NSIS native sur Windows. La machine de correction fonctionne sous Linux, et les dépendances verrouillées ne sont pas toutes accessibles depuis son registre npm. La recette native reste donc à confirmer par le lancement habituel de la publication.

---

# ALM 2.0.0-beta.82 — correction de sécurité des dépendances (24 octobre 2026)

## Référence et portée

Archive de départ : `Anime-Local-Manager-Beta82-Performance-Optimisee-COMPLET.zip`.
SHA-256 de l'archive de départ : `930d9a7360f3ca618c5a0a64b4a4f6d16295386a16326078ada9ecc91a724099`.

Le journal Windows `publication-2026-10-24T09-01-00-555Z.log` a arrêté le build à `npm audit`, avant les tests et NSIS.
Correctifs limités au verrouillage npm : Electron, Express, fonctionnalités ALM, données, clip karaoké, sécurité applicative et outils de build existants sont inchangés.

| Paquet | Ancien | Nouveau | Périmètre |
|---|---:|---:|---|
| body-parser | 1.20.8 | 1.20.9 | Production, dépendance de Express |
| multer | 2.4.0 | 2.5.0 | Production, dépendance directe |
| fast-uri | 3.1.8 | 3.1.9 | Outillage |
| undici (racine) | 7.29.1 | 7.30.1 | Outillage |
| undici (node-gyp) | 6.28.1 | 6.29.1 | Outillage |

Les SHA-512 SRI restent renseignés dans `package-lock.json`.
Les métadonnées de dépendances de `body-parser@1.20.9` et `multer@2.5.0` ont été comparées aux `package.json` des tags officiels.
Aucune nouvelle dépendance indirecte nécessaire ; le séquencement `npm ci` et les audits npm sont préservés.

Sources et advisories :
- https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828
- https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m
- https://github.com/advisories/GHSA-w74x-v6f9-j3xg
- https://github.com/advisories/GHSA-xjj6-f33q-929c

## Vérification et publication

`node scripts/test-beta82-build-security.cjs` vérifie la cohérence du package npm et ses empreintes.
L'audit réel dépend de la base d'avis npm au moment de la publication et ne doit jamais être supprimé.
La validation native Windows demeure nécessaire (npm ci, npm audit, suite complète, création NSIS, exécution et fermeture de l'app).

L'utilisateur conserve le point d'entrée habituel `Publier Installateur Windows.bat`.
Aucune modification de production Vercel, Supabase, Resend ou Cloudflare, aucun email envoyé, aucune migration SQL.

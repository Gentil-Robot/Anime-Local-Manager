# Publication du code source - ALM V2.0.0 Beta stable

Statut : **kit de preparation**, et non preuve de publication ou de signature.

## Reference verifiee

- Version technique : `2.0.0` ; nom public : `Anime Local Manager V2.0.0 Beta stable` ; canal beta.
- Archive source de depart : `Anime-Local-Manager-2.0.0-Beta-Stable-Harmonisation-Affichages-2026-10-25-COMPLET.zip`.
- Compilation Windows du 26 octobre 2026 : Node `22.23.4`, npm `10.9.9`, Electron `45.0.0`, 151 tests passes, NSIS x64 produit, SHA-256 de l'installateur valide localement.
- Recette utilisateur sur VM Windows : fonctionnelle ; maintenance planifiee apres activation volontaire depuis les reglages.
- Candidate du 31 octobre 2026 : Electron **45.2.1** integre Node **24.22.1**. Cela traite le retard de version identifie ; **le nouveau build Windows et les controles de non-regression restent a refaire**. Le journal de test du 26/10 reste l'historique d'Electron 45.0.0.
- Le nouvel installateur est **non signe**. Il ne faut pas transformer une simple publication de sources en release binaire stable.

## Perimetre

Publier le **code source** sur la branche de preparation `publication/v2.0.0-beta-stable` du depot public `Gentil-Robot/Anime-Local-Manager`, puis ouvrir une **draft pull request** vers `main`. L'historique V1 doit etre conserve ; aucun force-push ou ecrasement de `main`.

### Git LFS obligatoire

`public/assets/alm-clip-complet-1080p.mp4` depasse la limite GitHub de 100 Mo par blob. `.gitattributes` le suit via Git LFS, sans modification ni recompression. Le checkout de GitHub Actions doit utiliser `lfs: true`. Ne remplacez jamais ce media par un simple pointeur LFS dans le ZIP source : le ZIP contient le fichier original et c'est `git add` qui cree le pointeur Git LFS dans le depot.

GitHub Free comprend une allocation de stockage et de bande passante Git LFS. Pour eviter des couts, verifier les budgets Git LFS dans les parametres du compte et definir un budget a 0 $ si necessaire.

### Confidentialite

Les clefs `publishableKey`, les URL de projet et les `captchaSiteKey` du client sont **publiques par definition** ; cela ne les transforme pas en clefs de service. Le serveur doit continuer de faire appliquer l'autorisation, les quotas et les regles RLS. Les clefs privees / `service_role`, cookies, tokens de session, certificats et secrets de signature n'appartiennent pas aux sources publiques.

Les notices des bibliotheques tierces sont conservees. La licence MIT couvre le code ALM et non automatiquement les contenus de fournisseurs ni les medias dont les droits sont distincts. Une verification de provenance des medias avant publication de la release est conseillee.

## Procedure sur le PC du mainteneur

1. Installer **Git for Windows**, **Git LFS** et (optionnel) **GitHub CLI** (`gh`).
2. Decompresser le kit de sources dans un dossier neuf.
3. Depuis PowerShell, dans le dossier source : `node scripts/check-source-files.js` et `node scripts/audit-publication.cjs`.
4. Executer `./Preparer-GitHub-V2.ps1` pour creer un clone local, **reprendre la branche distante de preparation deja existante** et creer un commit **sans push**.
5. Examiner les differences et l'envoi propose. Si tout est bon : executer `./Preparer-GitHub-V2.ps1 -PublierBranche -RepertoireTravail <chemin-du-clone>` pour envoyer le commit et, si `gh` est disponible, creer une PR brouillon.
6. **Avant le push**, separer dans Vercel la connexion Git du depot ALM : tant qu'elle existe, un push sur la branche de preparation declenche un deploiement Vercel Preview en erreur. Ensuite, le workflow Windows se lance sur le push de la branche de preparation et fournit le nouvel installateur **en artefact prive de workflow**. Verifier son rapport, son SHA-256 et ses parcours sur VM Windows ; ne creer une release prepublication avec EXE qu'apres cette recette et la revue des droits/conditions applicables. Conserver ce decouplage Vercel avant toute fusion dans `main`, pour ne pas re-deployer le site. Voir la recette actuelle `docs/ELECTRON-45.3.1-RECETTE-2026-11-12.md` (la recette 45.2.1 reste un historique).

La preparation des sources et leur envoi sur GitHub **ne deployent pas** le site, Supabase, Vercel, Cloudflare ni Resend.

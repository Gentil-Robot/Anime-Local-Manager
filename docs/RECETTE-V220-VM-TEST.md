# ALM 2.2.0 — recette de test sur machine virtuelle Windows

**Préversion privée de test**, issue de `release/v2.1.3`, non publiée comme release officielle.

## Télécharger

Ouvrir la [PR #9](https://github.com/Gentil-Robot/Anime-Local-Manager/pull/9), puis son contrôle GitHub Actions « ALM - controle des sources (PR) ». Après **réussite** de `verify` et `vm-preview-installer`, télécharger l'artefact `ALM-2.2.0-VM-TEST-<sha>` dans la page du workflow. Décompresser l'archive GitHub, vérifier le SHA-256 du fichier `.exe` avec `VM-TEST-REPORT.json`, puis lancer `Anime-Local-Manager-2.2.0-VM-TEST-x64.exe` sur la VM.

Si le contrôle est rouge ou si l'artefact n'existe pas, **ne pas considérer le paquet comme prêt**. La compilation peut échouer ; seule une sortie CI marquée `verified-vm-preview` autorise la recette.

## Protection de la version actuelle

- Identité Windows séparée : `fr.gentilrobot.animelocalmanager.vmtest`.
- Nom visible : `Anime Local Manager VM Test`.
- Dossier utilisateur propre à cette application ; les bibliothèques et caches de la 2.1.3 ne sont pas écrasés.
- Mise à jour automatique et planificateur de tâches désactivés dans le paquet VM.
- Pas de déploiement Supabase, Vercel, Cloudflare ou Resend. **Éviter de se connecter avec un compte communautaire de production pendant les essais**.
- Installation non signée possible : SmartScreen peut afficher un avertissement. Vérifier le fichier et sa provenance ; ne pas contourner les protections sans les comprendre.

## Scénarios à tester

1. **Démarrage** : vérifier la mention « V2.2.0 VM TEST », démarrage Electron, catalogue local, ouverture de la bibliothèque sans réseau.
2. **Mes fichiers** : bouton « Choisir un dossier », sélectionner un dossier de fichiers `.mkv` ou `.mp4`. Tester un chemin local puis un dossier partagé NAS/UNC. Vérifier le nombre de fichiers, un nom reconnu, un inconnu et les limites d'analyse.
3. **Associations locales** : sélectionner une proposition fiable puis « Associer ». Vérifier que l'indication « Fichier local associé » apparaît pour un animé **En cours**. Relancer l'application et réouvrir le dossier : l'association doit être toujours présente. Tester « Dissocier ».
4. **Saisons** : aller dans la page **Saisons** existante. Le bloc « Suites absentes de ma bibliothèque » doit afficher les suites du catalogue local qui correspondent à une relation vérifiée et ne sont pas déjà présentes. Cliquer « Ajouter à À voir », confirmer et vérifier la nouvelle fiche.
5. **Hors connexion** : retirer l'accès Internet sur la VM, relancer ALM, vérifier qu'« En cours », « Mes fichiers » et la recherche locale des suites fonctionnent dans les limites des ressources déjà présentes.
6. **Mise à jour** : le script de suivi natif Windows V2.2.0 est inclus dans le code, mais l'**auto-updater est volontairement désactivé dans le paquet VM** pour éviter de toucher à la version stable. Les tests CI NSIS vérifient l'installation et le remplacement en mode sans interface. L'affichage interactif réel de la barre de progression pendant une mise à jour devra être validé avec une recette spécifique, sous contrôle, avant distribution publique.
7. **Désinstallation** : supprimer l'application **VM Test** uniquement. Vérifier que la V2.1.3 et ses données restent intactes.

## Limites connues du prototype

- Le scan utilise la boîte de dialogue native et **ne suit pas les liens symboliques** ; il lit noms et métadonnées de fichiers, jamais le contenu des vidéos.
- Association par titre conservatrice ; les titres ambigus ne sont pas associés automatiquement.
- Les chemins d'association sont enregistrés **sur le PC uniquement**, pas dans Supabase ni dans les sauvegardes.
- Les suggestions de suites proviennent d'un sous-ensemble borné de la bibliothèque et des relations déjà vérifiées. Elles peuvent être incomplètes.
- Les jaquettes tierces hors ligne **ne sont pas étendues** sans validation de leurs droits.
- La fenêtre de progression visible reste à valider dans une VM Windows interactive en situation de mise à jour.

Signaler avec la version du système, la description de l'action, le message exact et, si possible, une capture écran **sans chemins NAS ou données personnelles**.

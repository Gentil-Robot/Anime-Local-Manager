# Anime Local Manager V2.1.1 — Bêta stable

## Notifications de mise à jour

- Une version publiée plus récente apparaît dans la cloche d’ALM, dans un groupe « Mises à jour d’ALM », avec son numéro et un badge Stable/Bêta.
- Une notification du système est proposée pendant qu’ALM est ouvert, si le système l’autorise. Son clic ouvre les réglages de mise à jour ; le téléchargement et l’installation restent au choix de l’utilisateur.
- L’alerte est conservée après redémarrage. Chaque version ne déclenche qu’une tentative de notification système, même après lecture des notifications ou effacement des notifications du calendrier.
- Le mode silencieux conserve l’entrée dans la cloche et suspend la notification système. Les versions déjà installées et les bêtas exclues par le canal stable sont masquées.
- Les brouillons, les erreurs de vérification et les liens étrangers aux releases officielles ne produisent pas d’alerte.

## Réglages et affichage

- « Versions stables et bêtas » est le choix par défaut. Un choix explicite « Versions stables » reste respecté.
- Le bouton de vérification affiche immédiatement « Vérification en cours… ». Une erreur réseau reste visible au lieu d’être remplacée par un message indiquant qu’aucune mise à jour n’existe.
- Les numéros de version affichés par l’application et ses diagnostics indiquent 2.1.1. Les anciennes notes de version et l’identifiant du format de sauvegarde restent des références historiques.
- Les nouvelles notifications et leurs actions sont disponibles dans les sept langues d’ALM.

## Installation et vérification

Installateur Windows NSIS x64 : `Anime-Local-Manager-2.1.1-Setup-x64.exe`. La mise à jour conserve la collection et les réglages. Le format des sauvegardes et l’identifiant de l’application restent compatibles.

La publication exige les 164 suites de vérification, les trois parcours natifs Electron (moteur, MFA et mises à jour), puis la recette de l’installateur Windows. Le parcours natif de mise à jour teste le clic à travers le véritable preload isolé et l’interface Electron ; l’affichage effectif d’une notification dépend des réglages de Windows.

Electron 45.3.1, Node.js embarqué 24.22.2 et Chromium 156.0.8078.96. Les dépendances sont identiques à la V2.1.0. Le rapport Windows `release-check.json` et `SHA256SUMS.txt` accompagnent le binaire publié. L’installateur est non signé sauf indication contraire dans ce rapport.

Pour une ancienne installation réglée sur « Versions stables », choisir « Versions stables et bêtas », enregistrer, puis vérifier les nouvelles versions, ou installer directement le fichier officiel.

## English

ALM 2.1.1 adds persistent update notifications with Stable/Beta badges and one desktop notification attempt per version. Clicking opens update settings. Stable and beta releases are offered by default; an explicit stable-only preference is respected. Update checks now show progress and retain network errors. All visible current-version labels and diagnostics use 2.1.1. Windows publication requires 164 suites, three native Electron recipes and the installed NSIS smoke test.

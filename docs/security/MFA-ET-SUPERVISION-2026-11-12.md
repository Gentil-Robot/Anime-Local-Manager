# ALM — MFA optionnel et supervision du moteur

État du 12 novembre 2026. Candidat source construit à partir de l’archive du lot 1, avec conservation du correctif de confidentialité du 11 novembre. Cette livraison prépare la prochaine version ; elle ne remplace pas l’installateur actuellement publié.

## Ce que voit l’utilisateur

- À la connexion, l’option « Configurer le MFA après ma connexion » ouvre la configuration après authentification. L’activation est également disponible dans **Mon compte → Sécurité du compte**.
- Après création de compte, l’activation se fait après confirmation de l’adresse email. Le MFA est facultatif ; dès qu’il est activé, le compte communautaire exige le code de l’authentificateur.
- Un QR code produit localement et une clé de saisie manuelle permettent d’associer une application TOTP. Aucun service externe de génération de QR code n’est appelé. L’activation n’est terminée qu’après validation d’un code à six chiffres.
- Un second authentificateur peut être ajouté sur un autre appareil. À la connexion, le sélecteur permet de choisir l’appareil principal ou celui de secours. Il s’agit de deux facteurs enregistrés séparément, avec deux secrets distincts.
- Retirer un appareil, désactiver le MFA, supprimer le compte ou déconnecter des sessions demande une nouvelle saisie du mot de passe et, si activé, un code MFA. La suppression du compte garde aussi sa confirmation textuelle.
- Les écrans et messages sont disponibles dans les sept langues d’ALM. La bibliothèque locale reste utilisable hors connexion.

## Perte d’un authentificateur

Utiliser l’autre authentificateur pour se connecter, ajouter un nouvel appareil, puis retirer celui qui a été perdu. La configuration affiche si un appareil de secours existe.

Si tous les authentificateurs sont perdus, cette version ne propose pas de récupération automatique. Elle garde le compte protégé et renvoie vers l’assistance. Un email seul ne permet pas de désactiver le MFA. Aucune procédure administrative de réinitialisation n’est exécutée par ce logiciel. Il n’y a pas de codes de récupération imprimables dans ce lot.

## Résistance au vol de session

Les contrôles sont appliqués dans la base et les fonctions serveur, indépendamment de l’interface. Chaque accès protégé vérifie une session encore présente, appartenant au bon utilisateur, non expirée, et un compte confirmé. Les six tables communautaires conservent leurs règles de propriété, d’amitié, d’âge et de confidentialité ; une règle restrictive supplémentaire exige la session active et le MFA lorsque le compte l’a activé.

Le niveau AAL2 ne suffit pas à lui seul : le facteur utilisé doit avoir été approuvé par ALM et rester vérifié chez le fournisseur. Un facteur ajouté directement à partir d’un jeton volé ne devient pas automatiquement un facteur de confiance. La préférence de protection reste côté serveur ; une suppression directe des facteurs ne fait pas retomber silencieusement le compte en accès simple.

Les actions sensibles utilisent une autorisation courte, propre au compte, à la session, à l’action et à sa cible, utilisable une seule fois. Son approbation exige une nouvelle session créée après la demande et une preuve de mot de passe récente dans les données d’authentification du fournisseur. Un simple rafraîchissement de jeton n’est pas une réauthentification. L’ancienne session de cet appareil est remplacée ; les autres sessions sont révoquées lors des changements de facteurs.

La déconnexion révoque la session courante côté serveur. Un échec réseau de révocation n’est pas présenté comme une révocation confirmée ; les identifiants locaux sont tout de même effacés. Aucun mot de passe, secret TOTP ou jeton n’est stocké dans les nouvelles tables ni ajouté aux diagnostics.

Une session AAL2 volée conserve ses droits courants tant qu’elle reste active : le MFA n’annule pas ce risque. La vérification systématique permet de refuser cette session après révocation, et la preuve fraîche protège les opérations sensibles ALM. Les points d’entrée natifs du fournisseur Auth restent aussi dépendants de sa configuration et de ses garanties.

## Supervision du moteur

Le processus principal Electron reçoit les arrêts du moteur même sans requête en cours et contrôle sa réponse toutes les quinze secondes. Trois réponses manquantes déclenchent l’alerte ; une reprise après veille bénéficie d’un délai de grâce.

Une boîte de dialogue native propose d’attendre en cas de blocage, de redémarrer, de lire le diagnostic ou de fermer. Elle reste utilisable lorsque le serveur HTTP local est arrêté. Le redémarrage attend la fin du moteur précédent et des écritures de clés déjà engagées avant d’ouvrir un nouveau moteur. Il renouvelle le jeton local, gère un changement de port et reconnecte les sauvegardes, notifications et tâches de maintenance. Deux essais maximum sont autorisés sur une minute. Quitter normalement ne provoque pas de relance.

Les imports ou autres opérations interrompues ne sont pas rejoués automatiquement. La supervision ne transforme pas une écriture métier interrompue en opération réussie.

## Déploiement coordonné

La nouvelle migration est `supabase/migrations/20261113084819_alm_optional_mfa_session_security.sql`. La migration de confidentialité `20261111193057` est déjà présente sur le service hébergé et a été réintégrée aux sources ; elle ne doit pas être réappliquée manuellement.

Mise à jour du 13 novembre 2026 : la migration MFA et les nouveaux écrans du site sont **déployés en production**, après autorisation et sauvegarde du site et du schéma existant. Le contenu SQL est identique au candidat du 12 novembre ; seul son identifiant de migration a été aligné sur l’historique hébergé. Voir `DEPLOIEMENT-MFA-2026-11-13.md` pour les contrôles effectués et les limites de recette. La nouvelle migration durcit les fonctions de suppression et de révocation : les anciens clients ne fournissent pas la nouvelle autorisation et ces opérations échoueront après son déploiement. Il faut donc coordonner la nouvelle application, le module d’authentification du site et la migration. Ne pas publier en production l’ancien dossier vitrine contenu dans cette archive par-dessus les évolutions graphiques récentes du site ; intégrer ses seuls fichiers communautaires dans la version actuelle du site.

Avant activation publique : choisir le numéro de la prochaine version pour que la mise à jour soit détectée, construire et tester l’installateur Windows en VM, vérifier sur un environnement Auth de recette l’inscription, le QR code, les deux appareils, la récupération de mot de passe, la révocation et les changements de facteurs. Vérifier que l’enrôlement et la vérification TOTP sont activés dans le fournisseur. Après migration, exécuter ses contrôles de sécurité et une recette avec un compte dédié. Ne pas revenir à une ancienne politique sans MFA une fois des comptes enrôlés : garder une correction qui échoue en refusant l’accès plutôt qu’un retour arrière qui retire leur protection.

L’identifiant de l’application, le dossier utilisateur et le format historique des sauvegardes sont conservés. Les dépendances ne sont pas montées de version dans ce lot. La signature de l’installateur, Express 5 et les optimisations générales de l’audit initial restent des lots séparés.

## Validation

**`npm run verify` : 160 suites sur 160 réussies**, après les dernières corrections, en 363 secondes sous Linux (Node.js 24.22.1, npm 11.9.0). Six suites ont été ajoutées à la validation standard : client Auth, SQL, routes HTTP, interface MFA, superviseur et intégration du processus principal.

| Groupe | Suites réussies |
| --- | ---: |
| Structure et régressions | 99 |
| Interface et karaoké | 8 |
| Imports et bibliothèque | 27 |
| Données, sauvegardes et sécurité | 14 |
| Publication | 12 |

Deux recettes natives supplémentaires ont réussi avec Electron 45.2.1 :

- Arrêt brutal du vrai processus utilitaire, redémarrage sur un autre port, rotation du jeton local, refus de l’ancien jeton, conservation d’une entrée de bibliothèque et de ses notes dans une base isolée.
- Parcours d’interface : option à la connexion, QR code, ajout de deux authentificateurs, refus d’un mauvais code, connexion avec celui de secours, saisie de preuve sensible, sept langues et absence de débordement horizontal à 390 pixels. Ces interactions utilisent l’interface réelle avec un fournisseur Auth fictif ; elles ne contactent aucun compte réel.

Les tests du client couvrent aussi une révocation pendant la connexion ou la validation MFA et l’ordre de retrait des facteurs : le fournisseur rétrograde les sessions utilisant un facteur supprimé ; lors d’une désactivation complète, ce facteur est donc retiré en dernier.

L’audit npm relève six dépendances de compilation au niveau modéré, aucune élevée ou critique, et aucune vulnérabilité signalée dans les dépendances de production. Ces six alertes de build sont inchangées ; aucune mise à jour forcée n’a été appliquée.

Les preuves de validation finales sont regroupées dans `docs/verification-mfa-engine-20261112/`. Le test SQL exécute les migrations sur PostgreSQL via PGlite avec des données fictives ; les tests de parcours Auth simulent le fournisseur. Les tests natifs utilisent le vrai Electron 45.2.1 sous Linux. Ils ne constituent pas une recette contre le service Auth hébergé ni un essai d’installation Windows.

Sources : [MFA Supabase](https://supabase.com/docs/guides/auth/auth-mfa), [TOTP Supabase](https://supabase.com/docs/guides/auth/auth-mfa/totp), [sessions Supabase](https://supabase.com/docs/guides/auth/sessions), [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html), [processus utilitaires Electron](https://www.electronjs.org/docs/latest/api/utility-process).

Preuves : [160 suites](../verification-mfa-engine-20261112/verification.json), [journal](../verification-mfa-engine-20261112/verification.log), [recette moteur](../verification-mfa-engine-20261112/electron-recovery.json), [recette interface](../verification-mfa-engine-20261112/electron-mfa.json), [diff de code](../verification-mfa-engine-20261112/code.diff). Le diff est relatif à l’archive du lot 1 ; les fichiers web générés sont disponibles dans les sources complètes.

# Signature gratuite : dossier SignPath Foundation - ALM

**Etat : non demande, non approuve, non configure.** Ne pas afficher "signe" dans les pages publiques.

Informations pour la demande :

- Produit : Anime Local Manager (ALM), application Windows Electron, installateur NSIS x64.
- Depot public : https://github.com/Gentil-Robot/Anime-Local-Manager
- Licence : MIT ; droits des assets et donnees tierces a distinguer.
- Mainteneur : Gentil Robot.
- Build : `.github/workflows/windows-installer.yml`, runners Windows GitHub Actions ; Node `22.23.4` ; `npm ci` verrouille ; Electron `45.3.1` (candidate non encore revalidee sous Windows), electron-builder `26.16.1`.
- Tests : `scripts/verify-project.js`, 151 suites en date du 26/10/2026, essai application empaquetee, SHA-256 du livrable, recette manuelle VM Windows.
- Distribution : version `2.0.0` nommee *V2.0.0 Beta stable* a publier en **prerelease** GitHub et non en version stable.
- Signature : aucun certificat ni compte SignPath configure ; workflow actuel sait deja utiliser `ALM_WINDOWS_CERTIFICATE`, mais **la signature SignPath necessite une integration et une approbation propres**, non une simple substitution de secret.

### Conditions prealables

1. Verifier que l'integralite des **sources effectivement signees** est publique, avec leurs dependances et droits compatibles.
2. Fusionner la V2 apres validation ; creer une prerelease publique documentee (les criteres SignPath exigent un projet effectivement diffuse).
3. Activer le signalement prive de failles et une politique de revue des contributions.
4. Verifier qu'aucun service ni certificat prive ne soit embarque ; revoir les permissions du pipeline avant tout secret.
5. Lire les conditions officielles `https://signpath.org/terms` et le service `https://signpath.org/` ; soumettre la demande par le mainteneur du depot.
6. Une fois accepte seulement, connecter la signature aux artefacts **issus du runner CI**, avec validation manuelle et controle d'empreintes.

Aucun frais de certificat n'est engage par ce kit. L'eligibilite et l'acceptation relevent de SignPath Foundation ; la signature gratuite n'est pas garantie.

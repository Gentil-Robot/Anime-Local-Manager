# Securite - Anime Local Manager

## Versions prises en charge

La branche `main` represente le code propose a la communaute. La version **V2.0.0 Beta stable** reste une prerelease tant que la recette de securite et la signature de l'installateur ne sont pas terminees.

## Signaler une vulnerabilite

Merci de **ne pas publier de preuve d'exploitation ou de secret dans une issue publique**. Utilisez de preference la fonction **Private vulnerability reporting** de GitHub, si elle est activee :

1. Ouvrez la page du depot `Gentil-Robot/Anime-Local-Manager`.
2. Allez dans **Security > Advisories > Report a vulnerability**.
3. Indiquez la version, les preconditions, les etapes de reproduction non destructives et l'impact estime.

Si le lien de signalement prive n'apparait pas, contactez le mainteneur par un canal de contact public officiel sans envoyer d'information sensible dans une issue publique.

## Principes

- Ne transmettez jamais de sauvegardes reelles, jetons de session ou identifiants dans un rapport de bug.
- L'application privilegie les donnees locales ; la synchronisation communautaire est facultative.
- Les dependances npm et les binaires Electron/Chromium sont surveilles **separement** : `npm audit` ne couvre pas les vulnerabilites du runtime Electron.
- Aucune signature ne doit etre realisee avec une cle privee stockee dans le depot.
- Les releases publiques ne sont effectuees qu'apres verification de l'integrite, recette VM Windows et validation humaine.

# V2.2.0 — Revue complémentaire et contrôle de livraison

## État de référence
Run 46036234739 : les tests indépendants de cache, de performance, de sécurité du moteur et d'IPC ont avancé ; la vérification des rails a échoué sur une attente synchrone de jaquette hors ligne. Les installateurs ont été bloqués. Le scénario de performance a mesuré 100000 analyses de date pour 1000 fiches, 34 ms sur le runner pour ce tri, une lecture d'associations et un téléchargement simulé. Il ne s'agit pas d'une mesure de RAM ou du temps de démarrage global.

## Corrections
- Progression : réutilisation de createEpisodeStepper, verrou par ID partagé par les vues, maintien du même historique et de l'annulation, pas d'écriture sur ouverture de fiche.
- Import et cache : autorisation renouvelée via recherche locale, requêtes en vol mutualisées, génération de scan isolée, rechargement groupé des jaquettes, aucune URL arbitraire.
- Performances : réutilisation des candidats par titre, pré-calcul des tokens et de la saison dans le matcher, calcul unique du hash d'un fichier, construction groupée du DOM. La comparaison du matcher sur 100 recherches et 800 fiches a donné des résultats identiques.
- Nettoyage : garde d'initialisation, annulation des temporisations détachées, libération des observateurs, suppression d'une fonction après return inconditionnel et du chemin de rendu historique redondant quand le catalogue est actif.
- Sécurité : validation stricte du delta de progression, verrou et contrôle des actions de la fiche locale en lecture seule, protection contre dépassement du fichier d'associations et effacement silencieux, limites de recherche côté serveur.

## Contrôle restant
Le job security-review et la suite verify doivent être verts ; installer/smoke Windows et Linux doivent également réussir. Recette graphique et PC/NAS réel, mesures natives de mémoire, six alertes npm modérées historiques et audit des services externes restent à valider. Ce rapport est une revue ciblée des changements, non un certificat d'absence de vulnérabilités. Aucun déploiement ni modification de données externes.

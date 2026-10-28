# Réglages, sauvegardes et clés API

## Clés API

Capri vérifie un fournisseur avant d’enregistrer son choix ou sa nouvelle clé.
Si la vérification échoue, le fournisseur et la clé précédents restent en place.
Les erreurs renvoyées par le service ne sont pas recopiées dans ce parcours :
elles peuvent contenir la clé envoyée.

Une clé saisie dans Capri est chiffrée avec Electron `safeStorage` seulement si
un stockage sécurisé est disponible : DPAPI sous Windows, le trousseau macOS,
GNOME libsecret ou KWallet sous Linux. Le backend Linux `basic_text` et les
backends inconnus ne sont pas acceptés pour conserver de nouvelles clés.

Sans trousseau utilisable, ou si le chiffrement échoue, la clé reste **uniquement
en mémoire jusqu’à la fermeture de Capri**. Le panneau de saisie et la confirmation
indiquent ce comportement. Déverrouiller un trousseau système ou utiliser la
variable d’environnement du fournisseur permet de préparer les prochains lancements.
Les variables d’environnement ne sont pas copiées dans les fichiers de réglages.

Au démarrage, les anciennes clés en clair d’un fichier valide sont converties au
nouveau stockage ou déplacées en mémoire. Les anciennes valeurs chiffrées sont
réenveloppées avec le trousseau sécurisé si elles peuvent être déchiffrées.
Une valeur illisible est conservée sans être utilisée comme clé : déverrouiller
le trousseau d’origine ou saisir la clé à nouveau. Si le fichier n’est pas
inscriptible, la migration est signalée comme inachevée.

Le renderer reçoit uniquement les noms des fournisseurs et des états de stockage,
jamais les clés enregistrées. Le diagnostic copiable ne contient ni clés, ni
valeurs d’environnement, ni contenu des réglages ou des conversations.

## Écriture et récupération

`config.json` utilise un format versionné. Chaque sauvegarde écrit un fichier
temporaire dans le même dossier, synchronise son contenu puis le renomme pour
remplacer le fichier principal. Une erreur d’écriture ne remplace pas les réglages
en mémoire par des données prétendument sauvegardées ; Capri signale l’échec.

`config.json.bak` conserve les préférences valides précédentes, **sans clés API**.
Une récupération depuis cette sauvegarde peut donc nécessiter de saisir les clés
à nouveau. Il s’agit d’une sauvegarde de récupération, pas d’un historique de versions.

Si le fichier principal est invalide, Capri préserve ses octets dans un fichier
`config.json.corrupt-…` avant de restaurer la sauvegarde valide. Sans sauvegarde
valide, elle repart avec les valeurs par défaut. Un fichier illisible ou provenant
d’une version de format inconnue est préservé sans être remplacé ; les écritures
restent bloquées jusqu’à correction et relecture.

`memory.json` et sa sauvegarde utilisent le même mécanisme pour les conversations.
**Oublier nos conversations** vide le fichier courant et sa sauvegarde ordinaire.
Les fichiers de récupération `*.corrupt-…` déjà conservés ne sont pas supprimés
automatiquement. Ils peuvent contenir des données privées anciennes : ne pas les
joindre à un rapport de diagnostic public.

Sous Linux, les nouveaux fichiers, sauvegardes et fichiers endommagés préservés
ont des permissions `0600`. Sous Windows, les droits dépendent des ACL du dossier
de données utilisateur. Les fichiers résident dans le dossier utilisateur de Capri,
pas dans le dépôt ou le dossier d’installation.

Fermer Capri avant une restauration manuelle. Le diagnostic du menu permet ensuite
d’actualiser les observations après avoir corrigé un problème de droits ou de trousseau.

## Vérification

`npm test` simule les pannes d’écriture, de synchronisation et de renommage, la
corruption, les formats futurs et les migrations des clés. Les trousseaux y sont
simulés ; les essais avec de vrais trousseaux de bureau restent distincts.

`npm run test:smoke` lance Electron avec un profil isolé et le backend `basic_text`,
puis utilise une clé factice avec un faux fournisseur HTTP local. Il vérifie que
la clé ne figure dans aucun réglage sauvegardé et qu’une vérification refusée
ne remplace pas la clé de session précédente.

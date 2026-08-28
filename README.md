# Intégration Externe Android TV Remote pour Gladys Assistant

Intégration externe officielle pour **Gladys Assistant** permettant de contrôler les téléviseurs et boîtiers **Android TV** et **Google TV** sur le réseau local via le protocole **Remote v2 (TLS 6466/6467)**.

---

## 🌟 Fonctionnalités

- 📡 **Protocole Natif Remote v2 (TLS)** : Connexion sécurisée sur les ports 6466 et 6467 sans nécessiter l'activation du mode développeur / ADB.
- 🔑 **Appairage automatique par code PIN** : Procédure guidée depuis l'interface Gladys pour associer votre téléviseur.
- ⚡ **Contrôle Télécommande** :
  - Interrupteur d'alimentation (**Marche / Arrêt**)
  - Gestion du **Volume** et du mode **Sourdine (Mute)**
  - Boutons de **Navigation (D-Pad)** : Haut, Bas, Gauche, Droite, OK, Retour, Accueil, Menu
  - Contrôle des **Médias** : Lecture, Pause, Stop, Précédent, Suivant, Avancer, Reculer
- 🔁 **Retour d'état** : l'état marche/arrêt, le volume, la sourdine et l'application au premier plan remontés par la TV sont publiés dans Gladys en temps réel. Une TV qui ne répond plus sur le réseau est marquée éteinte ; un appareil qui accepte la session sans annoncer son état (Mi Box…) est considéré allumé.
- 🚀 **Lanceur d'Applications (Désactivable et Personnalisable)** : un sélecteur par TV pour lancer une application (_YouTube, Netflix, Prime Video, Disney+, Spotify, Plex, Twitch, Crunchyroll, YouTube Music, Apple TV, Arte, Molotov, myCANAL_), depuis le tableau de bord ou une scène. Masquez les applications que votre TV n'a pas (« Applications à masquer ») et ajoutez les vôtres (« Applications personnalisées », entrées `Nom = lien` séparées par des points-virgules) dans la configuration, puis relancez une recherche d'appareils.
- ⏰ **Wake-on-LAN (Facultatif)** : renseignez l'adresse MAC de la TV et « Allumer » depuis Gladys réveille une TV totalement éteinte via un magic packet, là où le protocole Remote v2 seul ne le permet pas. Le paquet est envoyé au broadcast du sous-réseau de la TV (ex : `192.168.1.255`), puis en secours au broadcast général `255.255.255.255` et à l'adresse IP de la TV.

---

## ⚙️ Configuration & Appairage

Tout ce que vous avez à saisir se trouve **dans les actions elles-mêmes** : rien à enregistrer entre les étapes.

1. Allumez votre téléviseur.
2. **Étape 1 — Démarrer l'appairage** : saisissez l'**adresse IP** de la TV (ex : `192.168.1.50`) et, si vous le souhaitez, un **nom** (ex : `TV Salon`) et son **adresse MAC** (pour le Wake-on-LAN, voir plus bas), puis exécutez l'action. Un code PIN à 6 caractères s'affiche à l'écran du téléviseur.
3. **Étape 2 — Valider le code PIN** : saisissez le code affiché et exécutez l'action **dans la foulée** (le code expire). Les certificats TLS clients sont générés et enregistrés.
4. Lancez une **recherche d'appareils** (onglet Découverte) pour ajouter la TV à vos appareils Gladys.

Pour appairer une **seconde TV**, reprenez à l'étape 1 avec sa propre adresse IP : les TV déjà appairées sont conservées.

Pour **retirer une TV**, utilisez l'action « Retirer une TV appairée » en choisissant la TV dans la liste : ses certificats sont supprimés (l'appareil Gladys correspondant, lui, se supprime depuis sa propre page).

Les actions « Renseigner l'adresse MAC », « Retirer une TV appairée » et « Tester la connexion » proposent un **sélecteur listant vos TV** (les appareils créés de l'intégration) : plus d'adresse IP à retaper. Le champ « Adresse IP (secours) » ne sert que pour une TV appairée mais **pas encore ajoutée comme appareil** — elle n'apparaît pas encore dans la liste.

> ℹ️ Seules les TV **déjà appairées** apparaissent lors de la recherche. Une TV sans certificat ne pourrait recevoir aucune commande.

### Bon à savoir

- **Réservez l'adresse IP de la TV dans votre box/routeur (réservation DHCP)** : l'adresse IP sert d'identifiant à l'appareil dans Gladys. Si elle change, l'appareil existant devient injoignable et il faut ré-appairer la TV puis relancer une recherche.
- Les touches **Marche/Arrêt** et **Sourdine** du protocole Remote v2 sont des **bascules** : l'intégration ne les envoie que si l'état connu de la TV diffère de l'état demandé.
- Le protocole n'a pas de commande de volume absolue : le niveau demandé est atteint en répétant les touches volume +/−, sur l'échelle de volume annoncée par la TV.
- Si la TV est éteinte au démarrage de l'intégration, la connexion est retentée automatiquement, y compris au moment où une commande arrive : elle se rétablit dès que la TV est joignable.
- **Allumer la TV à distance** via le protocole Remote v2 seul ne fonctionne que si elle est en **veille réseau** (le port reste ouvert en veille sur la plupart des modèles). Pour réveiller une TV **totalement éteinte**, renseignez son **adresse MAC** (visible dans ses paramètres réseau) via l'action « Renseigner l'adresse MAC d'une TV appairée » : « Allumer » depuis Gladys enverra alors un paquet **Wake-on-LAN**. Activez « Wake-on-LAN » / « Réveil réseau » dans les paramètres de la TV si l'option existe (en Wi-Fi, cherchez « Wake-on-WLAN »).
- **Le Wake-on-LAN a une condition matérielle** : la carte réseau de l'appareil doit **rester alimentée quand il est éteint**. C'est généralement le cas de l'Ethernet intégré des TV, rarement du Wi-Fi, et **jamais d'un adaptateur USB-Ethernet** (Mi Box + adaptateur ugreen par exemple) : la plupart des boîtiers coupent l'alimentation du bus USB à l'extinction, l'adaptateur disparaît du réseau et aucun magic packet ne peut le réveiller. Dans ce cas, laissez le boîtier en **veille réseau** (le protocole Remote v2 suffit alors à le rallumer) plutôt que de l'éteindre complètement.
- **Lancer une application absente de la TV** est refusé par la TV elle-même, qui **coupe la connexion** au passage (elle se rétablit automatiquement quelques secondes plus tard). L'intégration remonte alors une erreur explicite : masquez l'application dans « Applications à masquer », ou corrigez son lien via « Applications personnalisées ».
- **Migration depuis la v1.0** : les boutons « App … » par application sont remplacés par un sélecteur unique « Application ». Relancez une **recherche d'appareils** et cliquez sur **Mettre à jour** sur chaque TV pour récupérer le sélecteur.

---

## 🐳 Déploiement Docker

L'image Docker multi-architecture (`amd64`, `arm64`, `arm/v7`) est automatiquement construite via GitHub Actions. Chaque merge sur `main` publie l'image versionnée annoncée par le manifeste (`gladys-assistant-integration.json`) : pensez à y **incrémenter la version** dans toute PR qui change le comportement, c'est elle qui déclenche la proposition de mise à jour côté Gladys.

En usage normal, c'est **Gladys qui démarre le conteneur** : rien à lancer à la main. La commande ci-dessous ne sert qu'au débogage en dehors de Gladys.

```bash
docker run -d \
  --name gladys-integration-android-tv-remote \
  -e GLADYS_HOST_API_URL=http://localhost:8080 \
  -e GLADYS_INTEGRATION_TOKEN=your_token_here \
  -e GLADYS_INTEGRATION_SELECTOR=android-tv-remote \
  ghcr.io/guim31/gladys-integration-android-tv-remote:1.3.0
```

| Tag       | Contenu                                                      |
| --------- | ------------------------------------------------------------ |
| `:1.3.0`  | Version figée — **recommandé**                               |
| `:latest` | Dernier état stable de la branche `main`                     |
| `:dev`    | Dernier build de la branche `dev` — pour tester, peut casser |

---

## 🛠️ Dépannage

Premier réflexe : lire les logs du conteneur (`docker logs gladys-ext-...`). Les lignes `[gladys-sdk]` concernent la liaison avec Gladys, les lignes `[AndroidTV]` concernent les TV.

### « L'action a échoué. Vérifiez que l'intégration est démarrée » / le toggle retombe sur « arrêté »

Si les logs montrent en boucle :

```
[ERROR] [gladys-sdk] websocket error on ws://gladys:8082: connect ETIMEDOUT ...
[WARN]  [gladys-sdk] not connected to Gladys (ws://gladys:8082), retrying in ... ms
```

le conteneur de l'intégration n'arrive pas à joindre Gladys : il ne s'est jamais enregistré, donc Gladys le considère comme non démarré. `ETIMEDOUT` (et non « connection refused ») signifie que les paquets sont jetés en route — c'est un problème de réseau **entre les deux conteneurs**, pas un problème de port. Le port peut très bien être en écoute et joignable depuis l'hôte tout en restant inaccessible depuis le réseau où vit le conteneur de l'intégration.

Dans l'ordre :

1. **Vérifiez le mode réseau de Gladys.** L'installation officielle fait tourner le conteneur Gladys en `network_mode: host` : c'est la configuration attendue pour les intégrations externes. Si votre conteneur Gladys a une IP de bridge (ex : `172.30.0.2`) et un mapping de port (ex : `8082:8082`), il tourne en bridge — repassez-le en réseau host.
2. **Comparez les réseaux des deux conteneurs :**

   ```bash
   docker inspect -f '{{json .NetworkSettings.Networks}}' <conteneur-gladys>
   docker inspect -f '{{json .NetworkSettings.Networks}}' <conteneur-integration>
   ```

   Docker isole les bridges entre eux : deux conteneurs qui ne partagent aucun réseau ne peuvent pas communiquer, le trafic est jeté silencieusement (d'où le timeout).

3. **Testez depuis le conteneur de l'intégration :**

   ```bash
   docker exec <conteneur-integration> wget -qO- --timeout=5 http://gladys:8082 || echo KO
   ```

4. **Vérifiez le pare-feu de l'hôte ou du NAS** (ufw, firewalld…) : certains bloquent le trafic inter-conteneurs.

Dès que le réseau est réparé, l'intégration se reconnecte toute seule (le SDK réessaie indéfiniment, avec un délai plafonné) : inutile de redémarrer le conteneur.

### Une commande échoue avec « The Android TV at ... is not reachable »

La TV est totalement hors tension, a changé d'adresse IP, ou n'est pas sur le même réseau que Gladys. Rappels :

- L'allumage à distance sans Wake-on-LAN ne fonctionne que si la TV est en **veille réseau** ; renseignez l'**adresse MAC** de la TV pour réveiller une TV totalement éteinte (voir [Bon à savoir](#bon-à-savoir)).
- Si l'adresse IP de la TV a changé, l'appareil Gladys ne la retrouvera pas : mettez une **réservation DHCP** en place, puis ré-appairez si nécessaire.

### La TV n'apparaît pas dans le champ « Appareil » d'un widget ou d'une scène

L'appareil créé par l'intégration est un appareil Gladys comme un autre : il est éligible aux widgets du tableau de bord (Télévision, Appareils dans une pièce…) et aux actions de scène. S'il semble absent du champ « Appareil » :

- Le filtre de ce champ cherche dans le **nom de l'appareil** : tapez un fragment du nom tel qu'il apparaît dans l'onglet Appareils de l'intégration (ex : `Android TV` avec l'espace, ou un bout de l'IP), ou videz le champ de recherche et parcourez la liste complète.
- Donnez un **nom simple** à la TV à l'étape 1 de l'appairage (ex : `TV Salon`) : il se retrouve plus facilement que le nom par défaut `Android TV (192.168.1.50)`.
- Vérifiez que l'appareil est bien **associé à une pièce** : certains widgets listent les appareils par pièce.

Si le champ ne retrouve vraiment pas un appareil qui existe (il apparaît dans la liste complète mais pas via la recherche), c'est un bug du **filtre de l'interface Gladys**, pas de l'intégration : signalez-le sur le forum avec le nom exact de l'appareil et le texte tapé, pour qu'il soit corrigé côté Gladys.

### La TV est éteinte : que fait l'intégration ?

Rien d'agressif. Quand une TV appairée est injoignable (hors tension, débranchée), l'intégration
tente de s'y reconnecter en arrière-plan avec un délai qui **double à chaque échec** (5 s, 10 s,
20 s… plafonné à 2 minutes), et le délai repart à zéro dès qu'une connexion aboutit. La TV est donc
reprise automatiquement en quelques secondes lorsqu'elle redevient joignable (allumage, retour de
veille réseau), sans inonder les logs ni le réseau entre-temps. Une commande envoyée depuis un
dashboard pendant ce temps déclenche une tentative immédiate : si la TV ne répond pas, la commande
échoue en quelques secondes avec un message explicite au lieu de rester bloquée.

### « The TV refused the pairing » / « rejected the stored certificate »

La TV a révoqué le certificat de l'intégration (réinitialisation d'usine, suppression manuelle dans les paramètres de la TV…). Relancez la séquence d'appairage (étapes 1 et 2) pour cette adresse IP : le nouveau certificat remplace l'ancien.

---

## 🧪 Tests locaux

```bash
# Installation des dépendances
npm install

# Exécution des tests unitaires
npm test

# Verification du formatage & linting
npm run lint
npm run format:check
```

---

## 🤝 Contribuer

Le dépôt suit un modèle à deux branches : `dev` (intégration) et `main`
(production). Les détails — nommage des branches, convention de commits,
processus de publication — sont dans [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📜 Licence

Sous licence Apache-2.0.

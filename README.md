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
- 🔁 **Retour d'état** : l'état marche/arrêt, le volume et la sourdine remontés par la TV sont publiés dans Gladys en temps réel.
- 🚀 **Raccourcis d'Applications (Désactivables)** : Lancement direct d'applications populaires (_YouTube, Netflix, Prime Video, Disney+, Spotify, Plex, Arte, Molotov, myCANAL_).

---

## ⚙️ Configuration & Appairage

Tout ce que vous avez à saisir se trouve **dans les actions elles-mêmes** : rien à enregistrer entre les étapes.

1. Allumez votre téléviseur.
2. **Étape 1 — Démarrer l'appairage** : saisissez l'**adresse IP** de la TV (ex : `192.168.1.50`) et, si vous le souhaitez, un **nom** (ex : `TV Salon`), puis exécutez l'action. Un code PIN à 6 caractères s'affiche à l'écran du téléviseur.
3. **Étape 2 — Valider le code PIN** : saisissez le code affiché et exécutez l'action **dans la foulée** (le code expire). Les certificats TLS clients sont générés et enregistrés.
4. Lancez une **recherche d'appareils** (onglet Découverte) pour ajouter la TV à vos appareils Gladys.

Pour appairer une **seconde TV**, reprenez à l'étape 1 avec sa propre adresse IP : les TV déjà appairées sont conservées.

Pour **retirer une TV**, utilisez l'action « Retirer une TV appairée » avec son adresse IP : ses certificats sont supprimés (l'appareil Gladys correspondant, lui, se supprime depuis sa propre page).

> ℹ️ Seules les TV **déjà appairées** apparaissent lors de la recherche. Une TV sans certificat ne pourrait recevoir aucune commande.

### Bon à savoir

- **Réservez l'adresse IP de la TV dans votre box/routeur (réservation DHCP)** : l'adresse IP sert d'identifiant à l'appareil dans Gladys. Si elle change, l'appareil existant devient injoignable et il faut ré-appairer la TV puis relancer une recherche.
- Les touches **Marche/Arrêt** et **Sourdine** du protocole Remote v2 sont des **bascules** : l'intégration ne les envoie que si l'état connu de la TV diffère de l'état demandé.
- Le protocole n'a pas de commande de volume absolue : le niveau demandé est atteint en répétant les touches volume +/−, sur l'échelle de volume annoncée par la TV.
- Si la TV est éteinte au démarrage de l'intégration, la connexion est retentée automatiquement, y compris au moment où une commande arrive : elle se rétablit dès que la TV est joignable.
- **Allumer la TV à distance** ne fonctionne que si elle est en **veille réseau** (le port Remote v2 reste ouvert en veille sur la plupart des modèles). Une TV totalement hors tension doit être rallumée avec sa télécommande physique ou via HDMI-CEC.

---

## 🐳 Déploiement Docker

L'image Docker multi-architecture (`amd64`, `arm64`, `arm/v7`) est automatiquement construite via GitHub Actions.

En usage normal, c'est **Gladys qui démarre le conteneur** : rien à lancer à la main. La commande ci-dessous ne sert qu'au débogage en dehors de Gladys.

```bash
docker run -d \
  --name gladys-integration-android-tv-remote \
  -e GLADYS_HOST_API_URL=http://localhost:8080 \
  -e GLADYS_INTEGRATION_TOKEN=your_token_here \
  -e GLADYS_INTEGRATION_SELECTOR=android-tv-remote \
  ghcr.io/guim31/gladys-integration-android-tv-remote:1.0.4
```

| Tag       | Contenu                                                      |
| --------- | ------------------------------------------------------------ |
| `:1.0.4`  | Version figée — **recommandé**                               |
| `:latest` | Dernier état stable de la branche `main`                     |
| `:dev`    | Dernier build de la branche `dev` — pour tester, peut casser |

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

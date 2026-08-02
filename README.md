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

1. **Renseignez l'adresse IP** de votre Android TV / Google TV dans la configuration de l'intégration dans Gladys (ex : `192.168.1.50`), puis **enregistrez**.
2. Cliquez sur l'action **`1. Démarrer l'appairage`**. Un code PIN à 6 caractères s'affiche à l'écran de votre téléviseur (qui doit être **allumé**).
3. Saisissez ce code PIN dans le champ **`Code d'association (PIN)`** de la configuration, puis **enregistrez**.
4. Cliquez sur **`2. Valider le code PIN & Ajouter la TV`**. Les certificats TLS clients sont générés et enregistrés dans la configuration de l'intégration.
5. Effectuez un scan pour découvrir l'appareil et l'ajouter à vos appareils Gladys.

Pour appairer une **seconde TV**, remplacez l'adresse IP dans le formulaire et recommencez à l'étape 1 : les TV déjà appairées sont conservées.

> ℹ️ Seules les TV **déjà appairées** apparaissent lors du scan. Une TV sans certificat ne pourrait recevoir aucune commande.

### Bon à savoir

- Les touches **Marche/Arrêt** et **Sourdine** du protocole Remote v2 sont des **bascules** : l'intégration ne les envoie que si l'état connu de la TV diffère de l'état demandé.
- Le protocole n'a pas de commande de volume absolue : le niveau demandé est atteint en répétant les touches volume +/−, sur l'échelle de volume annoncée par la TV.
- Si la TV est éteinte au démarrage de l'intégration, la connexion est retentée automatiquement : elle se rétablit dès que la TV est rallumée.

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
  ghcr.io/guim31/gladys-integration-android-tv-remote:1.0.1
```

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

## 📜 Licence

Sous licence Apache-2.0.

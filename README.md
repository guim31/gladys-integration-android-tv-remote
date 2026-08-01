# Intégration Externe Android TV Remote pour Gladys Assistant

Intégration externe officielle pour **Gladys Assistant** permettant de contrôler les téléviseurs et boîtiers **Android TV** et **Google TV** sur le réseau local via le protocole **Remote v2 (TLS 6466/6467)**.

---

## 🌟 Fonctionnalités

- 📡 **Protocole Natif Remote v2 (TLS)** : Connexion sécurisée sur les ports 6466 et 6467 sans nécessiter l'activation du mode développeur / ADB.
- 🔑 **Appairage automatique par code PIN** : Procédure guidée depuis l'interface Gladys pour associer votre téléviseur.
- ⚡ **Contrôle Télécommande** :
  - Interrupteur d'alimentation (**Marche / Arrêt**)
  - Gestion du **Volume** et du mode **Sourdine (Mute)**
  - Boutons de **Navigation (D-Pad)** : Haut, Bas, Gauche, Droite, OK/Sélection, Retour, Accueil
  - Contrôle des **Médias** : Lecture / Pause, Avancer, Reculer
- 🚀 **Raccourcis d'Applications (Désactivables)** : Lancement direct d'applications populaires (_YouTube, Netflix, Prime Video, Disney+, Spotify, Plex, Arte, Molotov, myCANAL_).

---

## ⚙️ Configuration & Appairage

1. **Renseignez l'adresse IP** de votre Android TV / Google TV dans la configuration de l'intégration dans Gladys (ex : `192.168.1.50`).
2. Cliquez sur l'action **`1. Démarrer l'appairage`**. Un code PIN à 6 caractères s'affiche à l'écran de votre téléviseur.
3. Saisissez ce code PIN dans le champ **`Code d'association (PIN)`** de la configuration.
4. Cliquez sur **`2. Valider le code PIN`**. Les certificats TLS clients seront automatiquement générés et enregistrés de manière sécurisée.
5. Effectuez un scan pour découvrir l'appareil et l'ajouter à vos appareils Gladys.

---

## 🐳 Déploiement Docker

L'image Docker multi-architecture (`amd64`, `arm64`, `arm/v7`) est automatiquement construite via GitHub Actions.

```bash
docker run -d \
  --name gladys-integration-android-tv-remote \
  --network host \
  -e GLADYS_HOST_API_URL=http://localhost:8080 \
  -e GLADYS_INTEGRATION_TOKEN=your_token_here \
  ghcr.io/guim31/gladys-integration-android-tv-remote:1.0.0
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

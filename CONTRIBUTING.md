# Contribuer

Merci de votre intérêt pour cette intégration ! Ce document décrit l'organisation
des branches, le cycle de développement et le processus de publication.

---

## 🌳 Stratégie de branches

Le dépôt suit un modèle **Git Flow simplifié** à deux branches permanentes :

| Branche | Rôle                                                                       | Image Docker publiée |
| ------- | -------------------------------------------------------------------------- | -------------------- |
| `main`  | Code stable, en production. Chaque version est taguée `vX.Y.Z`.            | `:latest`, `:X.Y.Z`  |
| `dev`   | Branche d'intégration. Les fonctionnalités y sont fusionnées puis testées. | `:dev`, `:dev-<sha>` |

```
main          ← production, taguée vX.Y.Z
 └── dev      ← intégration
      ├── feature/nom-de-la-fonctionnalite
      └── fix/nom-du-correctif
```

**Aucun commit direct sur `main` ni sur `dev`** : tout passe par une pull request.

### Nommage des branches de travail

| Préfixe     | Usage                                       |
| ----------- | ------------------------------------------- |
| `feature/`  | Nouvelle fonctionnalité                     |
| `fix/`      | Correction de bug                           |
| `chore/`    | Maintenance, dépendances, outillage         |
| `docs/`     | Documentation uniquement                    |
| `refactor/` | Restructuration sans changement fonctionnel |

---

## 🔄 Cycle de développement

1. **Partir de `dev`** (toujours à jour) :

   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/ma-fonctionnalite
   ```

2. **Développer**, en vérifiant localement avant chaque commit :

   ```bash
   npm ci             # installation reproductible des dépendances
   npm run lint       # ESLint
   npm run format     # Prettier (écriture) — ou format:check pour vérifier
   npm test           # tests unitaires (node --test)
   ```

3. **Committer** en suivant la convention [Conventional Commits](https://www.conventionalcommits.org/fr/) :

   ```
   feat: ajoute le raccourci vers l'application Twitch
   fix: évite un crash quand la TV répond sans niveau de volume
   chore: met à jour eslint en 10.7
   docs: précise la procédure d'appairage
   ```

4. **Ouvrir une pull request vers `dev`**. La CI (lint, formatage, tests sur
   Node 20 et 22) doit être verte avant toute fusion.

5. Une fois `dev` stable, ouvrir une pull request **`dev` → `main`**, puis
   publier une version (voir ci-dessous).

---

## 🤖 Intégration continue

Deux workflows GitHub Actions :

- **`ci.yml`** — lance ESLint, la vérification Prettier et les tests unitaires
  sur Node 20 et Node 22. Déclenché sur chaque pull request vers `main` ou `dev`.
- **`deploy.yml`** — rejoue d'abord la CI, puis construit et publie l'image
  Docker multi-architecture (`amd64`, `arm64`, `arm/v7`) sur `ghcr.io`. Aucune
  image n'est publiée si la CI échoue.

### Images publiées

| Déclencheur     | Tags produits                  |
| --------------- | ------------------------------ |
| Push sur `dev`  | `:dev`, `:dev-<sha-court>`     |
| Push sur `main` | `:latest`                      |
| Tag `vX.Y.Z`    | `:X.Y.Z`, `:vX.Y.Z`, `:latest` |

Le tag `:dev` est **mouvant** : il pointe toujours vers le dernier build de la
branche `dev`. Pour figer une version de test précise, utiliser `:dev-<sha>`.

Tester une image de développement :

```bash
docker run -d \
  --name gladys-integration-android-tv-remote-dev \
  -e GLADYS_HOST_API_URL=http://localhost:8080 \
  -e GLADYS_INTEGRATION_TOKEN=your_token_here \
  -e GLADYS_INTEGRATION_SELECTOR=android-tv-remote \
  ghcr.io/guim31/gladys-integration-android-tv-remote:dev
```

> ⚠️ Les images `:dev` ne sont pas destinées à un usage quotidien : elles
> peuvent contenir des régressions. Utiliser `:latest` ou un tag de version
> pour une installation stable.

---

## 🚀 Publier une version

1. Fusionner `dev` dans `main` via une pull request.
2. Mettre à jour le numéro de version dans `package.json` **et** dans
   `gladys-assistant-integration.json` si nécessaire.
3. Créer et pousser le tag :

   ```bash
   git checkout main
   git pull origin main
   git tag -a v1.0.4 -m "v1.0.4"
   git push origin v1.0.4
   ```

4. Le workflow `deploy.yml` construit et publie automatiquement les images
   `:1.0.4`, `:v1.0.4` et `:latest`, et le workflow `release.yml` crée la
   release GitHub du tag. Son corps vient de
   `.github/release-notes/vX.Y.Z.md` (à ajouter dans la PR de release) ;
   à défaut, du message du tag annoté, sinon des notes générées par GitHub.
5. Répercuter la nouvelle version dans le `docker run` du `README.md`.

---

## 🧪 Écrire des tests

Les tests utilisent le runner natif de Node (`node --test`) et vivent dans
`test/`, un fichier par module de `src/`. Toute nouvelle fonctionnalité doit
être couverte, en particulier :

- `test/sdk-contract.test.js` vérifie que chaque action déclarée dans le
  manifeste `gladys-assistant-integration.json` est bien gérée par le code.
  Ajouter une action au manifeste implique donc d'ajouter son handler.

---

## 🛡️ Protection des branches (mainteneurs)

À configurer dans **Settings → Branches** sur GitHub, pour `main` et `dev` :

- Require a pull request before merging
- Require status checks to pass before merging → sélectionner les jobs
  `Lint, format & tests (Node 20)` et `Lint, format & tests (Node 22)`
- Require branches to be up to date before merging
- Bloquer les force-push et les suppressions de branche

# Contribuer

Merci de votre intérêt pour cette intégration ! Ce document décrit l'organisation
des branches, le cycle de développement et le processus de publication. Il est
le même pour toutes les intégrations Gladys de l'auteur.

---

## 🌳 Branches

Une seule branche permanente, **`main`** : c'est ce qui est publié. Chaque version
y est taguée `vX.Y.Z` par le workflow Release.

```
main          ← publié, tagué vX.Y.Z par le workflow Release
 ├── feature/nom-de-la-fonctionnalite
 └── fix/nom-du-correctif
```

**Aucun commit direct sur `main`** : tout passe par une pull request.

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

1. **Partir de `main`** (toujours à jour) :

   ```bash
   git checkout main
   git pull origin main
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

4. **Ouvrir une pull request vers `main`**. La CI (lint, formatage, tests) doit
   être verte avant toute fusion. Ne pas toucher à la `version` du manifeste ni
   de `package.json` : c'est le workflow Release qui la monte.

---

## 🤖 Intégration continue

Trois workflows GitHub Actions, communs aux intégrations de l'auteur :

- **`ci.yml`** — ESLint, vérification Prettier et tests unitaires, sur chaque
  pull request et chaque push sur `main`.
- **`build.yml`** — construit et publie l'image Docker multi-architecture
  (`amd64`, `arm64`) sur `ghcr.io`. Appelé par le workflow Release ; lancé à la
  main (Actions → Build and publish image, sur une branche), il publie une image
  d'essai taguée du nom de la branche, sans toucher à `:latest`.
- **`release.yml`** — publie une version (voir ci-dessous).

### Images publiées

| Déclencheur                        | Tags produits                    |
| ---------------------------------- | -------------------------------- |
| Workflow Release                   | `:X.Y.Z`, `:latest`              |
| Build and publish image, à la main | `:<nom-de-branche>` ou tag saisi |

Tester une image d'essai :

```bash
docker run -d \
  --name gladys-integration-android-tv-remote-test \
  -e GLADYS_HOST_API_URL=http://localhost:8080 \
  -e GLADYS_INTEGRATION_TOKEN=your_token_here \
  -e GLADYS_INTEGRATION_SELECTOR=android-tv-remote \
  ghcr.io/guim31/gladys-integration-android-tv-remote:ma-branche
```

> ⚠️ Les images d'essai ne sont pas destinées à un usage quotidien : elles
> peuvent contenir des régressions. Utiliser un tag de version pour une
> installation stable.

---

## 🚀 Publier une version

Tout se fait depuis GitHub : **Actions → Release → Run workflow**, choisir
`patch`, `minor` ou `major`. Le workflow :

1. calcule la version suivante (règles de `npm version`) et l'écrit dans
   `package.json`, `package-lock.json` et le manifeste
   `gladys-assistant-integration.json` (`version` et tag de `docker_image`),
   puis reformate le manifeste avec Prettier ;
2. commite `chore(release): X.Y.Z` sur `main` et pousse le tag `vX.Y.Z` ;
3. construit et publie les images `:X.Y.Z` et `:latest` ;
4. crée la **release GitHub** du tag — c'est elle que Gladys affiche via le lien
   « Voir le changelog de cette version » de l'onglet Supervision. Son corps est
   le fichier `.github/release-notes/vX.Y.Z.md` s'il existe (à ajouter dans une
   PR avant la release), sinon les notes générées par GitHub depuis les pull
   requests fusionnées.

Répercuter ensuite la nouvelle version dans le `docker run` du `README.md`.

Les Gladys qui lisent le manifeste sur `main` proposent la mise à jour dès que
la version a changé : une version ne se publie que par ce workflow.

---

## 🧪 Écrire des tests

Les tests utilisent le runner natif de Node (`node --test`) et vivent dans
`test/`, un fichier par module de `src/`. Toute nouvelle fonctionnalité doit
être couverte, en particulier :

- `test/sdk-contract.test.js` vérifie que chaque action déclarée dans le
  manifeste `gladys-assistant-integration.json` est bien gérée par le code.
  Ajouter une action au manifeste implique donc d'ajouter son handler.

---

## 🛡️ Protection de la branche (mainteneurs)

À configurer dans **Settings → Branches** sur GitHub, pour `main` :

- Require a pull request before merging
- Require status checks to pass before merging → sélectionner le job `Lint & test`
- Bloquer les force-push et la suppression de la branche

Le workflow Release pousse son commit de version sur `main` avec le jeton
`GITHUB_TOKEN` : si la branche est protégée, autoriser GitHub Actions à
contourner la règle, sinon la release échoue au push.

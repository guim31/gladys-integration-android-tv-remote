# CLAUDE.md — Android TV Remote

Téléviseurs et boîtiers Android TV / Google TV pilotés en local par le protocole Remote v2 (TLS
6466/6467) : alimentation, volume, sourdine, touches, lanceur d'applications, Wake-on-LAN, widgets.

Intégration externe pour [Gladys Assistant](https://gladysassistant.com) (SDK
`@gladysassistant/integration-sdk` ^0.14.0, `gladys_version` `>=5.1.0`). Mainteneur : Guilhem
(`guim31`). Dépôts jumeaux du même auteur, à consulter pour les widgets : `guim31/gladys-jellyfin`
et `guim31/gladys-dreame`.

Ce fichier rassemble ce qu'une session de code doit savoir et qui ne se lit pas dans le code :
choix de conception, faits vérifiés en réel, pièges déjà payés. Le compléter quand un nouveau
piège est découvert.

## État au 05/10/2026

Version 1.4.0 (`main`, image `ghcr.io/guim31/gladys-integration-android-tv-remote:1.4.0`, notes
dans `.github/release-notes/v1.4.0.md`) : **quatre widgets de tableau de bord** (`remote`,
`media`, `apps`, `volume`), SDK 0.12 → 0.14, `gladys_version` 4.86 → 5.1 (les Gladys plus anciens
restent en 1.3.0), `docs/fr.md` / `docs/en.md` (le validateur du store les exige). Les versions 1.1
à 1.3 sont issues de retours d'utilisateurs du forum Gladys (retour d'état, Wake-on-LAN, lanceur
configurable, sélecteur de TV sur les actions, contournement du filtre « Appareil » de Gladys v5
signalé par lmilcent).

**Les widgets n'ont été vérifiés sur aucune instance Gladys ni aucune TV** avant la 1.4.0 : seuls
les tests, le lint et le validateur du store ont tourné. À vérifier en réel : le rendu des quatre widgets (ordre des
composants, icônes Feather, libellés), le bouton d'alimentation depuis l'état connu, le toast
d'erreur quand la TV refuse une application, la tuile Volume liée à la fonctionnalité, et le
rafraîchissement des widgets quand la TV change d'état.

## Protocole et bibliothèque

- `androidtv-remote` ^1.0.10 (dépendance unique hors SDK). Elle lit `service_name`, émet
  `powered` (et non `power`), `volume` `{ level, maximum, muted }`, `current_app` (paquet
  Android), `unpaired`, `ready`.
- La bibliothèque **se reconnecte toute seule toutes les secondes, pour toujours** : son
  `RemoteManager` relance `start()` depuis son propre `close`. `AndroidTVClient.disconnect()`
  neutralise `start()` et détruit la socket après avoir retiré les écouteurs `close`, sinon chaque
  sauvegarde de configuration empile des connexions. Les reconnexions sont faites par
  `AndroidTVClientManager`, délai doublé de 5 s à 2 min.
- Le `RemoteManager` émet `error` sur lui-même (jamais relayé à `AndroidRemote`) : sans écouteur,
  `ERR_UNHANDLED_ERROR` tue le conteneur (`_guardRemoteManager()`).
- `start()` de la bibliothèque **avale** les erreurs de connexion : seul le `start()` du manager,
  intercepté, apprend qu'une TV est injoignable (`EHOSTUNREACH` en quelques secondes).
- Pas de requête d'état : une TV injoignable est publiée éteinte ; une TV qui accepte la session
  sans annoncer son état sous 5 s (Mi Box…) est considérée allumée ; une TV en veille réseau
  envoie `remoteStart(false)`.
- `KEYCODE_POWER` et `KEYCODE_VOLUME_MUTE` sont des **bascules** : envoyées seulement si l'état
  connu diffère de l'état demandé. Pas de volume absolu : touches répétées sur l'échelle
  `volumeMax` annoncée par la TV, 40 ms entre deux.
- Un lancement d'application réussi n'est **jamais acquitté** ; une application absente provoque
  un `remoteError` qui cite le lien, puis la TV **coupe la connexion**. `sendApp()` attend 1,5 s ce
  verdict pour remonter une erreur lisible.
- Le PIN porte un checksum dans ses deux premiers caractères : `sendCode()` renvoie `false` et
  tue la socket sur une faute de frappe, sans rien émettre ensuite.

## Choix de conception non évidents

- L'**adresse IP** est l'identifiant de la TV : `external_id` = `tv:192_168_1_50`
  (`sanitizeIpForExternalId`, construit par `tvDeviceExternalId()`), fonctionnalités
  `:power`, `:volume`, `:mute`, `:app`, `:key:<nom>`. Changer la correspondance casserait les
  appareils existants. `findTvByExternalId()` fait le chemin inverse pour les champs et réglages
  `source: "devices"`.
- Les certificats TLS vivent dans la configuration (`tvs[]`, écrite par `setConfig()` après le
  PIN), jamais dans les `params` de l'appareil, lisibles dans l'interface.
- L'appairage tient en deux actions dont les champs portent la saisie (IP, nom, MAC, PIN) : rien
  à enregistrer entre les deux, et la session ouverte par l'étape 1 est gardée par
  `pairingTarget` pour l'étape 2. `disconnectAll()` épargne un client en appairage.
- Une TV sans certificat n'est **pas publiée** à la découverte : son appareil ne pourrait rien
  recevoir.
- Les touches sont des fonctionnalités `television` (`exit` pour « Accueil », Gladys n'ayant pas
  de type `home`). Le lanceur est un `text/select` dont les options sont les applications
  résolues (`resolveApps()` : catalogue moins masquées, plus personnalisées ; une personnalisée
  qui porte le nom d'une entrée du catalogue la remplace et garde son paquet).
- Wake-on-LAN : trois destinations (broadcast du /24, `255.255.255.255`, unicast), espacées de
  2,1 s parce que le cœur limite `wakeOnLan` à un paquet par 2 s. « Allumer » une TV injoignable
  acquitte tout de suite (le cœur attend 5 s) et laisse les reconnexions ramener l'état.

**Widgets (feature/dashboard-widgets)**

- `src/widgets.js` est **pur** (aucun réseau) : `resolveWidgetTv()`, les builders
  `remoteContent`, `mediaContent`, `appsContent`, `volumeContent`, le dispatcher
  `widgetContent()`, la liste blanche `widgetCommand()` et les toasts. `index.js` ne fait que
  construire la vue (`buildWidgetView()`) et exécuter la commande (`handleWidgetAction()`).
- `AndroidTVClientManager` garde le **dernier état connu par IP** (`getTvState()` :
  `connected`, `powered`, `volume` en %, `muted`, `appPackage`) et appelle
  `requestWidgetRefresh` pour les widgets concernés **seulement sur un changement**, en
  coalesçant dans une fenêtre de 10 s (`WIDGET_NUDGE_MS`, surchargeable pour les tests) : le cœur
  jette en silence une seconde demande dans la fenêtre, et une TV répète son volume à chaque
  touche.
- Le bouton d'alimentation **bascule depuis l'état connu** : « Éteindre » quand la TV est
  connectée et allumée, « Allumer » sinon (Wake-on-LAN inclus via `handlePowerRequest()`). La
  sourdine du widget Volume envoie la touche brute (bascule), la coche signale l'état actif.
- `Injoignable` (warning) = aucune session ouverte ; `Éteinte` (neutral) = session ouverte et TV
  ayant dit `powered: false` (veille) ; `Allumée` sinon, y compris avant son premier rapport (le
  client la considère éveillée après 5 s de silence). Les widgets Lecture et Volume ajoutent cette
  ligne seulement quand la TV est injoignable.
- Un état inconnu (volume, sourdine, application) **n'affiche pas de ligne** ; une application
  hors lanceur n'est pas nommée (seul le paquet est connu).
- La tuile Volume est liée à `${deviceExternalId}:volume` **seulement si l'appareil existe** dans
  Gladys, lu dans `gladys.devices` (le SDK le tient en mémoire : resynchronisé à
  l'authentification et sur `device.created/updated/deleted`, jamais de requête HTTP au rendu) ;
  sinon tuile statique avec le dernier niveau connu.
- Boutons Applications : clés `app_1`…`app_4` (les clés des réglages), l'application dans
  `params.app` ; noms comparés par `slugifyAppName()` au nom **et** à l'id ; nom inconnu = bouton
  omis + caption « Inconnu : X. Connus : … » coupée à 80.
- Les widgets ont été dessinés sans tester le rendu : si l'ordre canonique du cœur (textes,
  tuiles, focal, status, boutons) ne convient pas, c'est le contenu qu'il faut changer, pas
  l'ordre d'envoi.

## Pièges déjà payés

- `saveConfig()` n'existe pas dans le SDK (c'est `setConfig()`) : `test/sdk-contract.test.js`
  vérifie que chaque `gladys.<méthode>(` appelée existe sur `GladysIntegration.prototype`.
- Le `package-lock.json` traînait en 1.2.0 avec un `package.json` en 1.3.0 : `npm install` le
  resynchronise, c'est normal de le voir changer avec une montée de dépendance.
- Les descriptions de widgets du manifeste doivent tenir en **100 caractères par langue** : la
  version française déborde vite (celle de `remote` fait 99).
- Les tests n'utilisent que des adresses de la plage `192.168.1.x` : aucune adresse réelle.

## Travailler sur ce dépôt

- **Une seule branche permanente, `main`** (`CONTRIBUTING.md`, aligné sur les autres intégrations
  de guim31 depuis la 1.4.0 ; l'ancienne branche `dev` et ses images `:dev` n'existent plus) :
  branche `feature/…` ou `fix/…`, PR vers `main`. Commits Conventional Commits (`feat:`, `fix:`,
  `docs:`, `chore:`…). Ne pas toucher `.github/workflows/` (communs aux 11 dépôts), ni la
  `version` du manifeste et de `package.json` : le workflow **Release** (Actions → Release, patch /
  minor / major) la monte, reformate le manifeste, pose le tag, publie l'image et crée la release
  GitHub (notes depuis `.github/release-notes/vX.Y.Z.md` s'il existe, sinon générées depuis les
  PR). Répercuter la version dans le `docker run` du README au commit suivant si besoin.
- Mêmes étapes que la CI, dans le même ordre : `npm ci`, `npm run lint`, `npm run format:check`,
  `npm test` (`node --test`, un fichier par module). Prettier contrôle **aussi le Markdown et le
  JSON** : lancer `npm run format` après avoir touché ce fichier, le README, les docs ou le
  manifeste. La CI tourne sur Node 20 et 22 ; une session cloud a Node 22.
- Avant une release, le validateur officiel du store, depuis la racine :
  `npx -y github:GladysAssistant/integration-store` (il demande Node ≥ 24 mais tourne en 22 avec
  un avertissement). Il exige `docs/fr.md` et `docs/en.md` (≥ 300 caractères) et une
  `description` ≤ 100 caractères par langue ; il avertit sur l'absence de `categories`. Seule
  l'image Docker d'une version non encore publiée peut échouer.
- Une session de code n'a **ni instance Gladys ni TV**. Tests, lint et validateur sont les seules
  vérifications possibles : le test réel passe par Guilhem ou les utilisateurs du forum. Le dire
  dans la PR, plutôt que de conclure que « ça marche ».
- Le dépôt est **public** : aucun secret, aucune adresse ni détail d'infrastructure privée, ni
  ici, ni dans les tests.

## Pièges du cœur Gladys (communs aux intégrations de guim31)

Vérifiés dans le code du cœur ou payés sur une intégration publiée du même auteur. Ils valent
pour toutes.

**Appareils et fonctionnalités**

- **`min` et `max` sont NOT NULL** dans `t_device_feature`, y compris pour `text/select` : sans
  eux, « Ajouter à Gladys » échoue en HTTP 422. Mettre 0/1 ou 0/0.
- Gladys refuse un appareil portant un **type de fonctionnalité inconnu** de sa catégorie :
  `test/devices.test.js` vérifie chaque couple catégorie/type contre les constantes du SDK.
- Les **noms de fonctionnalités sont figés à la création**. Quand une fonctionnalité est seule de
  son type sur l'appareil, le tableau de bord affiche le libellé générique du type à la place du
  nom publié.
- Depuis Gladys 4.84, un changement de structure fait proposer « Mettre à jour » dans l'onglet
  Découverte (`structure_changed`). Un changement des seules `supported_options` ne le déclenche
  pas.
- Le cœur plafonne à **300 états par minute** et réévalue les scènes à chaque état : ne publier
  que les changements. Un `text/select` reçoit `{ text }`, jamais vide.
- Le cœur attend **5 s** l'acquittement d'une commande `setValue` : une action longue (démarrage
  d'une TV) acquitte tout de suite et publie l'état plus tard.
- Une intégration `device` ne reçoit pas la langue de l'utilisateur (un widget, si) : les
  messages d'action sont des objets `{ en, fr }`.

**Formulaires de configuration et actions**

- Un champ `select` avec `source: "devices"` (action ou réglage de widget) reçoit l'`external_id`
  de l'appareil choisi : seule source dynamique, et seulement les appareils **créés** de
  l'intégration. Prévoir un champ IP de secours pour une TV appairée mais pas encore ajoutée.
- Une action n'applique **aucun `default`** à ses champs et exige les `required` (422) : laisser
  les champs facultatifs et compléter côté code.
- Les champs `number` sont rendus sans `step` : min et défaut entiers seulement.
- Le filtre du champ « Appareil » des widgets et scènes du cœur (Gladys v5) peut retourner une
  liste vide au premier passage : retaper puis recliquer le champ (bug du front, documenté dans le
  README).

**Widgets (SDK ≥ 0.14, Gladys ≥ 5.1)**

- Budget du cœur : **8 composants par widget**, 1 focal, 6 tuiles, **2 textes dont 1 `body`**,
  1 `status` (1–10 lignes), **4 boutons**, clés d'action **uniques** dans un contenu (le cœur
  jette le doublon). `validateWidgetContent` du SDK est exporté pour les tests : chaque contenu
  produit doit renvoyer `[]`.
- Ordre canonique imposé au rendu (textes d'en-tête, tuiles, focal, status, boutons), quel que
  soit l'ordre envoyé.
- **En mode sombre, le style `primary` d'un bouton ne se voit pas** : signaler un état par
  l'icône (`check-circle`), jamais par le style.
- `onWidgetAction` fait recharger le widget dès la résolution ; `requestWidgetRefresh` est
  plafonné à **1 appel par 10 s par widget**, les suivants jetés en silence : dédoublonner côté
  intégration.
- Le contenu est **tiré** par le cœur (15 s d'acquittement) et mis en cache par réglages, langue
  et unités : le construire depuis la mémoire, jamais depuis une requête à l'appareil. Une tuile
  `device_feature` suit les états publiés sans aucun nudge.
- L'état vide est un `text` `body` explicite, jamais une erreur. Les `params` d'un bouton
  reviennent tels que déclarés (jamais de saisie utilisateur) ; le handler n'accepte qu'une liste
  blanche.
- **Les clés de widgets sont figées une fois publiées.** Passer `gladys_version` à `>=5.1.0`
  coupe les mises à jour des cœurs plus anciens, qui refusent les champs inconnus du manifeste.

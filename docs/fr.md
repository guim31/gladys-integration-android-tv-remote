# Android TV Remote

Pilotez vos téléviseurs et boîtiers **Android TV** et **Google TV** depuis Gladys Assistant, sur le
réseau local, via le protocole **Remote v2** (TLS, ports 6466 et 6467) : celui de l'application
Google TV de votre téléphone. Aucun mode développeur, aucun ADB à activer.

## Fonctionnalités

Pour chaque TV appairée, un appareil Gladys avec :

- **Marche / Arrêt**, avec retour d'état : une TV qui ne répond plus sur le réseau est marquée
  éteinte.
- **Volume** (en %) et **Sourdine**, suivis en temps réel.
- Les touches de **navigation** (haut, bas, gauche, droite, OK, retour, accueil, menu) et de
  **lecture** (lecture, pause, stop, précédent, suivant, avancer, reculer).
- Un sélecteur **Application** pour lancer YouTube, Netflix, Prime Video, Disney+, Spotify, Plex,
  Twitch, Crunchyroll, YouTube Music, Apple TV, Arte, Molotov ou myCANAL, et vos propres
  applications. L'application au premier plan y est affichée.
- **Wake-on-LAN** facultatif : avec l'adresse MAC de la TV, « Allumer » réveille une TV totalement
  éteinte.

## Appairage

Tout se saisit dans les actions de la page de configuration, rien à enregistrer entre les étapes.

1. Allumez la TV.
2. **Étape 1 — Démarrer l'appairage** : saisissez l'adresse IP de la TV (ex : `192.168.1.50`), un
   nom si vous le souhaitez (ex : `TV Salon`) et son adresse MAC pour le Wake-on-LAN, puis exécutez
   l'action. Un code PIN s'affiche sur la TV.
3. **Étape 2 — Valider le code PIN** : saisissez le code et exécutez l'action dans la foulée, le
   code expire.
4. Lancez une **recherche d'appareils** (onglet Découverte) pour ajouter la TV à vos appareils.

Répétez pour chaque TV. Réservez l'adresse IP de la TV dans votre box (réservation DHCP) : elle
sert d'identifiant à l'appareil dans Gladys.

Les actions « Renseigner l'adresse MAC », « Retirer une TV appairée » et « Tester la connexion »
proposent la liste de vos TV.

## Widgets du tableau de bord

Avec Gladys 5.1 ou plus récent, quatre widgets (**Modifier le tableau de bord** → **Ajouter un
widget**). Chacun a un réglage **TV** ; laissé vide, il affiche la première TV appairée. Ils
montrent le dernier état remonté par la TV et se rafraîchissent dès qu'elle signale un changement.

- **Télécommande** — alimentation (_Allumée_, _Éteinte_, _Injoignable_), volume, sourdine,
  application au premier plan, et les touches _Allumer_ / _Éteindre_, _Accueil_, _Retour_, _OK_.
- **Lecture** — l'application au premier plan et les touches _Lecture / Pause_, _Stop_,
  _Précédent_, _Suivant_.
- **Applications** — jusqu'à quatre boutons. Sans réglage, les quatre premières applications du
  lanceur ; sinon écrivez dans **Application 1** à **4** le nom d'une application (majuscules et
  accents indifférents). Un nom inconnu est signalé avec les noms reconnus. L'application au
  premier plan est cochée. Pour plus de quatre boutons, ajoutez un second widget.
- **Volume** — une tuile liée à la fonctionnalité Volume de la TV (en direct), la sourdine, et
  les touches _Vol −_, _Vol +_, _Sourdine_ (cochée quand elle est active).

## Bon à savoir

- Les touches **Marche/Arrêt** et **Sourdine** sont des bascules sur la TV : l'intégration ne les
  envoie que si l'état connu diffère de l'état demandé.
- Le protocole n'a pas de volume absolu : le niveau demandé est atteint touche par touche.
- Sans Wake-on-LAN, « Allumer » ne fonctionne que si la TV est en **veille réseau**. Un adaptateur
  USB-Ethernet ne permet jamais le réveil : laissez le boîtier en veille plutôt qu'éteint.
- Une **application absente de la TV** est refusée par la TV, qui coupe la connexion au passage :
  masquez-la (« Applications à masquer ») ou corrigez son lien (« Applications personnalisées »).
- « The TV refused the pairing » : la TV a révoqué le certificat, refaites l'appairage.

## Limites

- Une TV totalement éteinte, sans adresse MAC renseignée, ne peut être rallumée que depuis sa
  télécommande ou par HDMI-CEC.
- L'application au premier plan n'est reconnue que si elle fait partie du lanceur ; une
  application personnalisée ne l'est que si elle remplace une entrée du catalogue.
- Les widgets exigent Gladys 5.1 : une installation plus ancienne ne reçoit plus les mises à jour
  de l'intégration.

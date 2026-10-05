# Android TV Remote

Control your **Android TV** and **Google TV** sets and boxes from Gladys Assistant, over the local
network, through the **Remote v2** protocol (TLS, ports 6466 and 6467): the one the Google TV app
of your phone uses. No developer mode, no ADB to enable.

## Features

For every paired TV, a Gladys device with:

- **Power on / off**, with state feedback: a TV that stops answering the network is marked off.
- **Volume** (percent) and **Mute**, followed in real time.
- The **navigation** keys (up, down, left, right, OK, back, home, menu) and the **playback** keys
  (play, pause, stop, previous, next, fast forward, rewind).
- An **Application** select to launch YouTube, Netflix, Prime Video, Disney+, Spotify, Plex,
  Twitch, Crunchyroll, YouTube Music, Apple TV, Arte, Molotov or myCANAL, and your own
  applications. The foreground app shows there.
- Optional **Wake-on-LAN**: with the MAC address of the TV, "turn on" wakes a TV that is fully
  powered off.

## Pairing

Everything is typed in the actions of the configuration page, nothing to save in between.

1. Turn the TV on.
2. **Step 1 — Start pairing**: type the IP address of the TV (e.g. `192.168.1.50`), a name if you
   like (e.g. `Living Room TV`) and its MAC address for Wake-on-LAN, then run the action. A PIN
   code shows up on the TV.
3. **Step 2 — Confirm the PIN**: type the code and run the action right away, the code expires.
4. Run a **device scan** (Discovery tab) to add the TV to your devices.

Repeat for every TV. Reserve the IP address of the TV in your router (DHCP reservation): it
identifies the device in Gladys.

The "Set the MAC address", "Remove a paired TV" and "Test the connection" actions list your TVs.

## Dashboard widgets

With Gladys 5.1 or newer, four widgets (**Edit dashboard** → **Add a widget**). Each has a **TV**
setting; left empty, it shows the first paired TV. They show the last state the TV reported and
refresh as soon as it reports a change.

- **Remote** — power (_On_, _Off_, _Unreachable_), volume, mute, foreground app, and the _Turn on_
  / _Turn off_, _Home_, _Back_, _OK_ keys.
- **Playback** — the foreground app and the _Play / Pause_, _Stop_, _Previous_, _Next_ keys.
- **Apps** — up to four buttons. Without a setting, the first four apps of the launcher; else
  type in **Application 1** to **4** the name of an app (case and accents do not matter). An
  unknown name is reported with the known ones. The foreground app is ticked. For more than four
  buttons, add a second widget.
- **Volume** — a tile bound to the Volume feature of the TV (live), the mute state, and the
  _Vol −_, _Vol +_, _Mute_ keys (ticked while mute is on).

## Good to know

- The **Power** and **Mute** keys are toggles on the TV: the integration only sends them when the
  known state differs from the requested one.
- The protocol has no absolute volume: the requested level is reached key by key.
- Without Wake-on-LAN, "turn on" only works on a TV in **network standby**. A USB-Ethernet adapter
  never allows a wake-up: leave the box in standby rather than off.
- An **application the TV does not have** is refused by the TV, which drops the connection on the
  way: hide it ("Applications to hide") or fix its link ("Custom applications").
- "The TV refused the pairing": the TV revoked the certificate, pair it again.

## Limits

- A TV fully powered off, without a stored MAC address, can only be turned on with its remote or
  through HDMI-CEC.
- The foreground app is only recognized when it is part of the launcher; a custom app only when
  it replaces a catalog entry.
- The widgets need Gladys 5.1: an older installation no longer receives the updates of the
  integration.

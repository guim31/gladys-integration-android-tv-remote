# Changelog

All notable changes to this integration are documented here. The released
versions are described in their GitHub release notes.

## [Unreleased]

### Changed

- Integration SDK 0.14 → 0.15. The states reported by the TV go through
  `publishChangedStates`: a TV repeats its whole volume report on every key
  press, only the values that changed now reach Gladys (rate limit of 300 states
  per minute).
- Quieter logs. The info level keeps the lifecycle only (start, a TV connected,
  lost, back) and one line per user action; a TV that stays unreachable is
  reported once when it is lost and once when it answers again, not at every
  reconnection attempt, and a refused certificate once.
- Development dependencies updated; `protobufjs` 7.6 and `node-forge` 1.4 forced
  through `overrides` (the `androidtv-remote` library, unmaintained since 2022,
  still asks for vulnerable versions).

### Fixed

- The `androidtv-remote` library printed every message exchanged with the TV,
  every connection attempt and the full stack of every socket error, whatever
  the log level: its console output now goes to the debug level.
- A TV volume set from the dashboard no longer writes one info line per key
  step.
- A TV added from the discovery tab while its session is already open gets its
  current power, volume, mute and application right away, instead of on the
  next change.

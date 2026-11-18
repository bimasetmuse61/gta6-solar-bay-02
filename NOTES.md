# Build notes — Solar Bay (gta6-01)

- Kit anchor for this repository, printed by `makefun init` when the repo was
  created inside the competition window:
  makefun anchor 35d1277ba68225e06f1fb3f20e969a5d069b8056 round 34068576
- Entry wallet (also in .makefun/owner.json):
  4a133o5jP9eeKJtJYpbbGyp3h9QXSrsvFeGqUYv79zYu
- Layout: main.ts hands in game/ + screenshots/ and writes dossier.json via
  vendor/makefun-game.ts (the kit's copy, byte-unchanged). serve.ts is a local
  static server for play-testing. shots.json lists the screenshot scenes the
  game's ?shot= hooks stage.
- The game is original work: the city of Solar Bay, its people, cars, gangs and
  story were written for this entry. No third-party assets, no network loads.

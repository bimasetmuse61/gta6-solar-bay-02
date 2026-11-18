[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bimasetmuse61/gta6-solar-bay-02/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bimasetmuse61/gta6-solar-bay-02/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solar Bay — an open-world crime game

**Solar Bay** is an original open-world crime game for the browser, built for
make.fun's **gta6-01 "Make GTA 6"** competition. Marina Solano comes home to a
sun-soaked coastal city that owes her family money. Explore Solar Bay on foot
and by car, steal and drive anything with wheels, take story missions from
Dario's Garage, run courier work between them, and try not to let the SBPD
turn your evening into a fine.

## Play it

Serve the game folder with the bundled static server and open it in desktop
Chrome:

```
node serve.ts            # serves game/ at http://localhost:8080
```

Or serve `game/` with any static file server — `game/index.html` is the game.
It loads nothing from the network; every script is a local file.

## Controls

- **On foot:** WASD/arrows move · Shift run · F take the nearest car ·
  mouse aim, hold click to shoot · E talk / skip dialogue
- **In a car:** WASD drive · Space handbrake · F get out
- **P** pause (S saves while paused). Progress also saves automatically
  after every mission, in the browser's localStorage.

## What's in the city

- An 8×8-block city with named places: Dario's Garage, The Palms Casino,
  Banco del Sol, the Marina Warehouse, the Coral Heights Safehouse, the
  Solar Bay PD and St. Alba Hospital, plus parks, a beachfront and palms.
- Lane-keeping traffic that turns at intersections, parked cars, and
  pedestrians who stroll, pause, and run when frightened.
- A five-mission story (Homecoming → Package Run → Repo Man → Hot Night →
  The Palms Job) plus repeatable courier jobs.
- A wanted system: crimes witnessed raise your stars, police pursue, shoot
  back at three stars and up, and close in for the bust. Get busted or
  wasted and you pay a fine and wake up at the station or the hospital.
- HUD with cash, health, clock, wanted stars, objective marker with
  distance, dialogue, and a live minimap with police and objective blips.
- A full day cycle from golden afternoon into a lit-window night, and
  synthesised WebAudio sound: engine, sirens, shots, crashes and chimes.

## Hand in (how the entry is built)

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with
`vendor/makefun-game.ts`, the kit's library, byte-unchanged.

## Layout

- `game/index.html` — the page; `game/src/` holds the game, one job per file:
  `config` (the city's numbers), `random` (seeded RNG), `city` (streets,
  buildings, collisions), `entities` (traffic, pedestrians, police),
  `missions` (the story and its step engine), `world` (the simulation and
  its rules), `render` (drawing and HUD), `shots` (screenshot scenes),
  `audio` (synthesised sound), `input` (keyboard and mouse), `main` (boot).
- `screenshots/` — four real captures of the running game; the first is the
  cover. They are staged with the game's own `?shot=` scenes (see
  `shots.json`) and screenshotted from a headless browser, never edited.

Everything — city, people, cars, story, art, sound — is original work for
this entry. MIT licensed (see LICENSE).

// missions.js — the story of Solar Bay and the work between its chapters.
// Marina Solano has come home to a city that owes her family money, and her
// cousin Dario has a garage, a plan, and a talent for trouble. Five story
// missions run in order; a generic step engine (go somewhere, take a car,
// carry a package, hold a position, run) drives them all, and repeatable
// courier jobs fill the gaps. This module owns mission state and objectives;
// the world owns physics, crime and consequences.
import { GOLD_COUPE_COLOR, WORLD_H } from './config.js';
import { makeParkedCar } from './entities.js';
import { dist, pick } from './random.js';

// Step kinds the engine understands:
//   goto      reach the point, on foot or in a car (flag inCar to require one)
//   enterCar  get into world.missionCar
//   deliverCar drive world.missionCar to the point
//   pickup    walk to the point and take the package (world.carryingPackage)
//   hold      stay inside the circle for `seconds` (flag inCar to sit in a car)
//   escapeTo  reach the point; the step may begin by raising the wanted level
export const MISSIONS = [
  {
    id: 'homecoming',
    title: 'Homecoming',
    reward: 250,
    intro: [
      ['Dario (phone)', 'Mari? You are really back. My sedan is parked at the Marina Warehouse — the blue one.'],
      ['Dario (phone)', 'Bring it to my garage and I will tell you everything. And Mari… drive like you never left.'],
    ],
    outro: [
      ['Dario', 'Still got the touch. The garage is yours whenever you need a roof, prima.'],
      ['Dario', 'Work? Oh, there is work. The Palms owes this family. Start small: a package, tomorrow.'],
    ],
  },
  {
    id: 'package-run',
    title: 'Package Run',
    reward: 400,
    intro: [
      ['Dario', 'A package waits at the Marina Warehouse. Nothing illegal — well, nothing they can prove.'],
      ['Dario', 'Take it to the doorman at The Palms Casino. If the police look interested, that is why you are paid.'],
    ],
    outro: [
      ['Doorman', 'The Palms thanks you. Mr. Vega says the family is remembered.'],
      ['Dario (phone)', 'Good. Now we stop being polite. There is a gold coupe at Banco del Sol with our name on it.'],
    ],
  },
  {
    id: 'repo-man',
    title: 'Repo Man',
    reward: 650,
    intro: [
      ['Dario', 'The gold Vireo at the bank plaza? Vega bought it with money he borrowed from us.'],
      ['Dario', 'So it is not stealing, prima. It is repossession. Bring it home to the garage.'],
    ],
    outro: [
      ['Dario', 'Beautiful. He will feel that one. But Vega has friends with badges — lie low tonight.'],
      ['Dario', 'I have a safehouse in Coral Heights. When the heat comes, that is where you run. Remember it.'],
    ],
  },
  {
    id: 'hot-night',
    title: 'Hot Night',
    reward: 900,
    intro: [
      ['Dario (phone)', 'Mari, Vega talked. Half the SBPD is looking for you tonight.'],
      ['Dario (phone)', 'Do not come here. Run to the Coral Heights safehouse and stay alive. Go!'],
    ],
    outro: [
      ['Marina', 'Safe. For tonight, anyway.'],
      ['Dario (phone)', 'You outran the whole bay. Tomorrow we finish this: the Palms vault, with a crew. Rest up.'],
    ],
  },
  {
    id: 'the-palms-job',
    title: 'The Palms Job',
    reward: 2500,
    intro: [
      ['Dario', 'Last job, prima. Pick up Alba at the casino door, then Bruno at the bank plaza.'],
      ['Dario', 'They crack the Palms vault from the service door while you keep the engine warm.'],
      ['Dario', 'Then everyone runs for the boat at the marina. After tonight, the family is square.'],
    ],
    outro: [
      ['Alba', 'We are rich, we are wet, and we are alive. Best night in Solar Bay history.'],
      ['Marina', 'Square at last. The bay is ours again — drive safe out there.'],
    ],
  },
];

/** Fresh story state: next mission index, the active mission, side work. */
export function createStory() {
  return { next: 0, active: null, sideJob: null, sideTimer: 8, finished: false };
}

/** Where a mission begins: usually Dario's garage door, the first at the marina. */
function startPoint(world, mission) {
  const specials = world.city.specials;
  return mission.id === 'homecoming' ? specials.marina.door : specials.garage.door;
}

/** Put a mission's props into the world (its car, its package, its heat). */
function setupMission(world, mission) {
  const specials = world.city.specials;
  const rng = world.rng;
  if (mission.id === 'homecoming') {
    const door = specials.marina.door;
    world.missionCar = makeParkedCar(rng, door.x + 30, door.y + 34, Math.PI / 2, null, '#457b9d');
    world.missionCar.mission = true;
    world.cars.push(world.missionCar);
  }
  if (mission.id === 'package-run') {
    const door = specials.marina.door;
    world.packageAt = { x: door.x, y: door.y + 6 };
  }
  if (mission.id === 'repo-man') {
    const door = specials.bank.door;
    const coupe = makeParkedCar(rng, door.x - 44, door.y + 30, Math.PI / 2,
      world.carTypeByKind('coupe'), GOLD_COUPE_COLOR);
    coupe.mission = true;
    world.missionCar = coupe;
    world.cars.push(coupe);
  }
  if (mission.id === 'hot-night') {
    world.setWanted(3);
  }
  if (mission.id === 'the-palms-job') {
    world.crew = { picked: 0 };
  }
}

/** The step list of a mission, built against the city's real addresses. */
function stepsFor(world, mission) {
  const s = world.city.specials;
  const pier = { x: s.marina.door.x, y: WORLD_H - 36 };
  switch (mission.id) {
    case 'homecoming':
      return [
        { kind: 'enterCar', label: 'Get into Dario\u2019s sedan' },
        { kind: 'deliverCar', x: s.garage.door.x, y: s.garage.door.y, label: 'Deliver the sedan to Dario\u2019s Garage' },
      ];
    case 'package-run':
      return [
        { kind: 'pickup', x: s.marina.door.x, y: s.marina.door.y + 6, label: 'Pick up the package at the Marina Warehouse' },
        { kind: 'goto', x: s.casino.door.x, y: s.casino.door.y, label: 'Deliver the package to The Palms Casino', needsPackage: true },
      ];
    case 'repo-man':
      return [
        { kind: 'enterCar', label: 'Take the gold coupe at Banco del Sol' },
        { kind: 'deliverCar', x: s.garage.door.x, y: s.garage.door.y, label: 'Bring the coupe to Dario\u2019s Garage' },
      ];
    case 'hot-night':
      return [
        { kind: 'goto', x: s.safehouse.door.x, y: s.safehouse.door.y, label: 'Reach the Coral Heights safehouse' },
      ];
    case 'the-palms-job':
      return [
        { kind: 'hold', x: s.casino.door.x, y: s.casino.door.y, seconds: 2, inCar: true, label: 'Pick up Alba at the casino door' },
        { kind: 'hold', x: s.bank.door.x, y: s.bank.door.y, seconds: 2, inCar: true, label: 'Pick up Bruno at the bank plaza' },
        { kind: 'hold', x: s.casino.door.x - 60, y: s.casino.door.y + 40, seconds: 12, inCar: true, label: 'Keep the engine warm while the crew cracks the vault', heat: true },
        { kind: 'escapeTo', x: pier.x, y: pier.y, label: 'Escape to the boat at the marina' },
      ];
    default:
      return [];
  }
}

/** Begin a story mission: props in, dialogue up, banner shown. */
export function startMission(world, story, mission) {
  story.active = { def: mission, step: 0, steps: stepsFor(world, mission), holdT: 0 };
  setupMission(world, mission);
  world.showDialogue(mission.intro);
  world.showBanner(mission.title, 'Story mission');
  world.audio.ui();
}

/** Finish the active mission: pay out, outro dialogue, save, next chapter. */
function completeMission(world, story) {
  const mission = story.active.def;
  world.player.cash += mission.reward;
  world.stats.missionsDone += 1;
  story.next += 1;
  story.active = null;
  world.missionCar = null;
  world.packageAt = null;
  world.carryingPackage = false;
  world.showDialogue(mission.outro);
  world.showBanner(`${mission.title} — complete`, `+$${mission.reward}`);
  world.audio.missionDone();
  if (story.next >= MISSIONS.length) {
    story.finished = true;
    world.endingT = 6;
  }
  world.saveGame();
}

/** Offer a courier job between two of the city's named doors. */
function offerSideJob(world, story) {
  const keys = Object.keys(world.city.specials);
  const fromKey = pick(world.rng, keys);
  let toKey = pick(world.rng, keys);
  if (toKey === fromKey) toKey = keys[(keys.indexOf(fromKey) + 2) % keys.length];
  const from = world.city.specials[fromKey].door;
  const to = world.city.specials[toKey].door;
  const pay = Math.round(dist(from.x, from.y, to.x, to.y) / 9) + 60;
  story.sideJob = {
    phase: 'pickup',
    x: from.x, y: from.y,
    toX: to.x, toY: to.y,
    pay,
    label: `Courier: pick up at ${world.city.specials[fromKey].building.name}`,
    deliverLabel: `Courier: deliver to ${world.city.specials[toKey].building.name}`,
  };
}

/**
 * Advance missions and side work by one step of the simulation. Reads the
 * player's position and car from the world, writes world.objective for the
 * HUD and minimap, and completes steps as their conditions are met.
 */
export function updateMissions(world, story, dt) {
  const player = world.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;

  if (!story.active && !story.finished && story.next < MISSIONS.length) {
    const mission = MISSIONS[story.next];
    const start = startPoint(world, mission);
    world.objective = { x: start.x, y: start.y, label: `New mission: ${mission.title}`, story: true };
    if (!player.car && dist(player.x, player.y, start.x, start.y) < 34) {
      startMission(world, story, mission);
    }
    return;
  }

  if (!story.active) {
    // Between chapters (and after the story) the city still offers work.
    story.sideTimer -= dt;
    if (!story.sideJob && story.sideTimer <= 0) offerSideJob(world, story);
    const job = story.sideJob;
    if (job) {
      world.objective = { x: job.x, y: job.y, label: job.phase === 'pickup' ? job.label : job.deliverLabel, side: true };
      if (dist(px, py, job.x, job.y) < 40) {
        if (job.phase === 'pickup') {
          job.phase = 'deliver';
          job.x = job.toX;
          job.y = job.toY;
          world.audio.pickup();
          world.showBanner('Package on board', 'Courier job');
        } else {
          world.player.cash += job.pay;
          world.stats.courierJobs += 1;
          world.showBanner('Courier job done', `+$${job.pay}`);
          world.audio.cash();
          story.sideJob = null;
          story.sideTimer = 14;
          world.saveGame();
        }
      }
    } else {
      world.objective = null;
    }
    return;
  }

  const active = story.active;
  const step = active.steps[active.step];
  if (!step) {
    completeMission(world, story);
    return;
  }
  if (step.heat) world.heatPulse(dt);

  let target = step;
  if (step.kind === 'enterCar' && world.missionCar) {
    target = { ...step, x: world.missionCar.x, y: world.missionCar.y };
  }
  world.objective = {
    x: target.x ?? px, y: target.y ?? py, label: step.label,
    progress: step.kind === 'hold' ? active.holdT / step.seconds : null,
    story: true,
  };

  let done = false;
  switch (step.kind) {
    case 'enterCar':
      done = Boolean(world.missionCar && player.car === world.missionCar);
      if (done && active.def.id === 'repo-man') world.commitCrime('stealWitnessed');
      break;
    case 'deliverCar':
      done = Boolean(world.missionCar && player.car === world.missionCar &&
        dist(player.car.x, player.car.y, step.x, step.y) < 52);
      break;
    case 'pickup':
      done = !player.car && dist(player.x, player.y, step.x, step.y) < 30;
      if (done) {
        world.carryingPackage = true;
        world.packageAt = null;
        world.commitCrime('packageHeat');
        world.audio.pickup();
      }
      break;
    case 'goto':
    case 'escapeTo': {
      const at = dist(px, py, step.x, step.y) < (step.kind === 'escapeTo' ? 56 : 44);
      done = at && (!step.needsPackage || world.carryingPackage);
      if (done && step.needsPackage) world.carryingPackage = false;
      break;
    }
    case 'hold': {
      const inside = dist(px, py, step.x, step.y) < 58 && (step.inCar ? Boolean(player.car) : !player.car);
      if (inside) {
        active.holdT += dt;
        if (step.heat && active.holdT > 4 && world.wanted.stars < 3) world.setWanted(3);
        done = active.holdT >= step.seconds;
      } else {
        active.holdT = Math.max(0, active.holdT - dt * 0.5);
      }
      break;
    }
    default:
      done = false;
  }

  if (done) {
    active.step += 1;
    active.holdT = 0;
    world.audio.ui();
    if (active.step >= active.steps.length) completeMission(world, story);
  }
}

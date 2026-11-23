import { buildMeshCollider, meshIntersectsBody, meshSurface, meshSupport, sweepMesh } from "./mesh-collision.mjs";
import { createClimberPose, advanceClimberPose } from "./climber-pose.mjs";
import { HIKER_HEIGHT } from "./hiker-contact.mjs";
import { levels } from "./levels.mjs";
export { LEVEL_COUNT, levels } from "./levels.mjs";

export const WIDTH = 1120;
export const HEIGHT = 720;
export const DEPTH = 1100;
export const PLAYER_WIDTH = 26;
export const PLAYER_HEIGHT = HIKER_HEIGHT;
export const PLAYER_DEPTH = 26;


const durations = {
  slippery: 9, boost: 9, float: 10, flip: 1.65, gust: 4.5, bounce: 8, perspective: 2, sound: 1.2, mute: 2.4,
  sprint: 3, heavy: 3, feather: 3, glide: 3, cyclone: 3, airControl: 3, grip: 3,
  directionLock: 2.1, stutter: 3, quiet: 3, brake: 3, dive: 3, lateJump: 3,
};
const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);
const halfWidth = PLAYER_WIDTH / 2;
const halfDepth = PLAYER_DEPTH / 2;

function overPlatform(x, z, solid) {
  if (x <= solid.min.x || x >= solid.max.x || z <= solid.min.z || z >= solid.max.z) return false;
  return !solid.sides || solid.sides.every((side) => {
    const projection = side.x * x + side.z * z;
    return projection > side.low + epsilon && projection < side.high - epsilon;
  });
}

export function platformTop(platform, x, z) {
  if (!platform.slope) return platform.y;
  const { axis, rise } = platform.slope;
  const length = axis === "x" ? platform.w : platform.d;
  const distance = clamp((axis === "x" ? x : z) - platform[axis], 0, length);
  return platform.y + (rise < 0 ? -rise : 0) + rise * distance / length;
}

function containsPoint(shape, x, z) {
  const u = (x - shape.x) / shape.w;
  const v = (z - shape.z) / shape.d;
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  if (!shape.footprint) return true;
  let winding = 0;
  for (const [index, [ax, az]] of shape.footprint.entries()) {
    const [bx, bz] = shape.footprint[(index + 1) % shape.footprint.length];
    const area = (bx - ax) * (v - .5 - az) - (bz - az) * (u - .5 - ax);
    if (Math.abs(area) <= epsilon) continue;
    if (winding && winding !== Math.sign(area)) return false;
    winding = Math.sign(area);
  }
  return true;
}

const meshCache = new WeakMap();

function colliderFor(platform) {
  const source = platform.mesh;
  if (!source) return null;
  if (!meshCache.has(source)) meshCache.set(source, new Map());
  const variants = meshCache.get(source);
  const key = `${platform.w}:${platform.thickness}:${platform.d}:${Boolean(platform.quarterTurn)}`;
  if (!variants.has(key)) variants.set(key, buildMeshCollider(
    { ...platform, x: 0, y: 0, z: 0 }, [halfWidth, PLAYER_HEIGHT, halfDepth],
  ));
  return variants.get(key);
}

export function platformSurface(platform, x, z) {
  if (platform.mesh) {
    const height = meshSurface(colliderFor(platform), x - platform.x, z - platform.z);
    return height === null ? null : platform.y + height;
  }
  return containsPoint(platform, x, z) ? platformTop(platform, x, z) : null;
}

export function landingPoint(platform) {
  const [u, v] = platform.landing ?? [.5, .5];
  const x = platform.x + u * platform.w;
  const z = platform.z + v * platform.d;
  return { x, y: platformSurface(platform, x, z) ?? platform.y, z };
}

function supportHeight(platform, player) {
  const slope = platform.slope;
  const extra = slope ? Math.sign(slope.rise) * (slope.axis === "x" ? halfWidth : halfDepth) : 0;
  return platformTop(platform, player.x + (slope?.axis === "x" ? extra : 0), player.z + (slope?.axis === "z" ? extra : 0));
}

export function targetPlatform(game) {
  const route = game.level.platforms;
  return route[route.indexOf(game.lastPlatform) + 1];
}

export function platformPosition(platform, time) {
  const phase = time * 1.8 * (platform.movementRate ?? 1) + (platform.visualY ?? platform.y) * 0.028;
  const movement = platform.kind === "moving" ? Math.sin(phase) : 0;
  const x = platform.x + 25 * movement;
  const z = platform.z + 18 * movement;
  const y = platform.y + (platform.kind === "wobble" ? 8 * Math.sin(phase) : 0);
  return { ...platform, x, y, z };
}

export function createGame(levelIndex = 0) {
  const level = (Number.isInteger(levelIndex) && levels[levelIndex]) || levels[0];
  const game = {
    level,
    levelComplete: false,
    time: 0,
    player: {},
    effects: Object.fromEntries(Object.keys(durations).map((key) => [key, 0])),
    effectPower: Object.fromEntries(Object.keys(durations).map((key) => [key, 1])),
    jumpOnlyBoost: false,
    dragon: null,
    soundCue: null,
    lockedDirection: null,
    bestY: level.baseY,
    won: false,
    notice: "",
    noticeUntil: 0,
    gustDirection: 1,
    gustDepth: 1,
  };
  respawn(game);
  return game;
}

export function respawn(game) {
  const { spawn, platforms: route } = game.level;
  game.lastPlatform = route[0];
  Object.assign(game.player, {
    ...spawn, pose: createClimberPose(Math.atan2(route[1]?.x + route[1]?.w / 2 - spawn.x, route[1]?.z + route[1]?.d / 2 - spawn.z) || 0), vx: 0, vy: 0, vz: 0, grounded: route[0], coyote: 0, jumpBuffer: 0, jumpHeld: false,
  });
}

export function advanceLevel(game) {
  if (!game.levelComplete || game.won) return false;
  Object.assign(game, createGame(game.level.index + 1));
  return true;
}

export function trigger(game, effect, { power = 1, seconds, wind, jumpOnly = false, pan = 0, direction: lockedDirection = "left" } = {}) {
  if (game.levelComplete) return false;

  if (effect === "dragon") {
    if (game.dragon) return false;
    const direction = game.player.x >= WIDTH / 2 ? -1 : 1;
    const startX = game.player.x - direction * 210;
    game.dragon = {
      x: startX,
      startX,
      endX: game.player.x + direction * 245,
      y: game.player.y + 13,
      z: game.player.z,
      phase: "warning",
      direction,
      elapsed: 0,
      warning: .92 / power,
      speed: 650 * power,
      hit: false,
    };
    return true;
  }

  if (!Object.hasOwn(durations, effect)) return false;
  if (effect === "gust") {
    game.gustDirection = wind?.[0] ?? (game.player.x < WIDTH / 2 ? -1 : 1);
    game.gustDepth = wind?.[1] ?? (game.player.z < DEPTH / 2 ? -1 : 1);
  }
  if ((effect === "float" || effect === "flip") && game.effects[effect] === 0) {
    game.player.grounded = null;
    game.player.vy = Math.max(60, game.player.vy);
    game.player.coyote = 0;
  }
  if (effect === "boost") game.jumpOnlyBoost = jumpOnly;
  game.effects[effect] = seconds ?? durations[effect];
  if (effect === "sound") game.soundCue = { kind: "dragon", seconds: game.effects.sound, power, pan };
  if (effect === "directionLock") game.lockedDirection = lockedDirection;
  game.effectPower[effect] = power;
  return true;
}

export function triggerGiftInteraction(game, recipe) {
  if (game.levelComplete) return false;
  if (recipe?.kind === "effect") return trigger(game, recipe.effect, recipe);
  if (recipe?.kind !== "impulse") return false;
  const { player } = game;
  player.vx = clamp(player.vx + recipe.x, -560, 560);
  player.vz = clamp(player.vz + recipe.z, -560, 560);
  if (recipe.y > 0) {
    player.vy = clamp(Math.max(0, player.vy) + recipe.y, 0, 830);
    player.grounded = null;
    player.coyote = 0;
  }
  return true;
}

function updateDragon(game, dt) {
  const dragon = game.dragon;
  if (!dragon) return;

  dragon.elapsed += dt;
  if (dragon.elapsed < dragon.warning) return;

  dragon.phase = "swoop";
  const oldX = dragon.x;
  dragon.x += dragon.direction * dragon.speed * dt;
  const { player } = game;
  const overlapsX = player.x >= Math.min(oldX, dragon.x) - 45 && player.x <= Math.max(oldX, dragon.x) + 45;
  const overlapsZ = Math.abs(player.z - dragon.z) < 33;
  if (!dragon.hit && overlapsX && overlapsZ && player.y < dragon.y + 20 && player.y + PLAYER_HEIGHT > dragon.y - 20) {
    dragon.hit = true;
    player.grounded = null;
    player.coyote = 0;
    player.vx = dragon.direction * 420;
    player.vy = 235;
    game.notice = "The dragon clipped you";
    game.noticeUntil = game.time + 2;
  }

  if (dragon.direction * (dragon.x - dragon.endX) > 0) game.dragon = null;
}

function land(game, platform, height) {
  const { player } = game;
  player.y = height;
  player.vy = 0;
  player.grounded = platform;
  game.lastPlatform = platform;
}

const axes = ["x", "y", "z"];
const rampAxes = [...axes, "slope"];
const epsilon = 1e-7;
const maxStep = 20;
const noMovement = { x: 0, y: 0, z: 0 };
const levelSolids = new WeakMap();

function footprintSlabs({ x, z, w, d, footprint }) {
  const points = footprint.map(([dx, dz]) => [x + (.5 + dx) * w, z + (.5 + dz) * d]);
  // The player box adds its extent along each footprint normal.
  const sides = [];
  for (const [index, [ax, az]] of points.entries()) {
    const [bx, bz] = points[(index + 1) % points.length];
    if (ax === bx || az === bz) continue;
    const length = Math.hypot(bz - az, bx - ax);
    const nx = (bz - az) / length;
    const nz = (ax - bx) / length;
    const distances = points.map(([px, pz]) => nx * px + nz * pz);
    const reach = Math.abs(nx) * halfWidth + Math.abs(nz) * halfDepth;
    sides.push({ x: nx, z: nz, low: Math.min(...distances) - reach, high: Math.max(...distances) + reach });
  }
  return {
    sides,
    minX: Math.min(...points.map(([px]) => px)) - halfWidth,
    maxX: Math.max(...points.map(([px]) => px)) + halfWidth,
    minZ: Math.min(...points.map(([, pz]) => pz)) - halfDepth,
    maxZ: Math.max(...points.map(([, pz]) => pz)) + halfDepth,
  };
}

function solidShape(shape) {
  const { x, y, z, w, d, thickness, slope, footprint } = shape;
  const gradient = slope && slope.rise / (slope.axis === "x" ? w : d);
  const intercept = slope && platformTop(shape, x, z) - gradient * shape[slope.axis];
  const reach = slope && (slope.axis === "x" ? halfWidth : halfDepth) * Math.abs(gradient);
  const hull = !slope && footprint?.length >= 3 ? footprintSlabs(shape) : null;
  const contactAxes = hull?.sides.length ? [...axes, ...hull.sides] : axes;
  return {
    shape,
    min: {
      x: hull?.minX ?? (x - halfWidth),
      y: y - thickness - PLAYER_HEIGHT,
      z: hull?.minZ ?? (z - halfDepth),
      slope: intercept - thickness - PLAYER_HEIGHT - reach,
    },
    max: {
      x: hull?.maxX ?? (x + w + halfWidth),
      y: y + Math.abs(slope?.rise ?? 0),
      z: hull?.maxZ ?? (z + d + halfDepth),
      slope: intercept + reach,
    },
    sides: hull?.sides,
    contactAxes: slope ? rampAxes : contactAxes,
    slope,
    gradient,
  };
}

const terrainMeshes = new Map();
const prismFaces = Uint16Array.of(0, 1, 2, 0, 2, 3, 7, 6, 5, 7, 5, 4,
  4, 5, 1, 4, 1, 0, 5, 6, 2, 5, 2, 1, 6, 7, 3, 6, 3, 2, 7, 4, 0, 7, 0, 3);

export function terrainCollisionShape(platform) {
  if (platform.mesh || platform.designSeed === undefined || platform.footprint) return platform;
  const { thickness, slope } = platform;
  const rise = Math.abs(slope?.rise ?? 0);
  const key = slope ? `${slope.axis}:${slope.rise}:${thickness}` : "deck";
  if (!terrainMeshes.has(key)) {
    const vertices = [[0, 0], [0, 1], [1, 1], [1, 0]];
    const total = thickness + rise;
    const top = vertices.map(([x, z]) => {
      const t = slope?.axis === "x" ? x : z;
      return (thickness + (slope?.rise < 0 ? 1 - t : t) * rise) / total;
    });
    const positions = [top, top.map((height) => height - thickness / total)].flatMap((heights) =>
      vertices.flatMap(([x, z], index) => [x, heights[index], z]));
    terrainMeshes.set(key, { positions: Float32Array.from(positions), indices: prismFaces });
  }
  return { ...platform, y: platform.y + rise, thickness: thickness + rise, mesh: terrainMeshes.get(key) };
}

function solidPlatform(platform) {
  const collisionShape = terrainCollisionShape(platform);
  return {
    ...solidShape(platform),
    platform,
    mesh: colliderFor(collisionShape),
    meshTopOffset: collisionShape.y - platform.y,
    posed: platform.designSeed !== undefined,
    end: platform,
    offset: noMovement,
    delta: noMovement,
  };
}

function solidsForStep(level, from, to) {
  if (!levelSolids.has(level)) levelSolids.set(level, level.platforms.map(solidPlatform));
  return levelSolids.get(level).map((solid) => {
    const { platform } = solid;
    if (platform.kind !== "moving" && platform.kind !== "wobble") return solid;
    const start = platformPosition(platform, from);
    const end = platformPosition(platform, to);
    const offset = Object.fromEntries(axes.map((axis) => [axis, start[axis] - platform[axis]]));
    const delta = Object.fromEntries(axes.map((axis) => [axis, end[axis] - start[axis]]));
    return { ...solid, end, offset, delta };
  });
}

function contactWithClimber(normal, segment) {
  return segment.boot || normal.y <= .18;
}

function firstContact(player, motion, groups, elapsed, tread) {
  let hit;
  const remaining = 1 - elapsed;
  for (const group of groups) {
    if (group === tread) continue;
    const { offset, delta } = group;
    const startX = player.x - offset.x - delta.x * elapsed;
    const startY = player.y - offset.y - delta.y * elapsed;
    const startZ = player.z - offset.z - delta.z * elapsed;
    const dx = motion.x - delta.x * remaining;
    const dy = motion.y - delta.y * remaining;
    const dz = motion.z - delta.z * remaining;
    const extraReach = group.posed ? 12 : 0;
    if (Math.max(startY, startY + dy) < group.min.y - extraReach || Math.min(startY, startY + dy) > group.max.y + extraReach ||
      Math.max(startX, startX + dx) < group.min.x - extraReach || Math.min(startX, startX + dx) > group.max.x + extraReach ||
      Math.max(startZ, startZ + dz) < group.min.z - extraReach || Math.min(startZ, startZ + dz) > group.max.z + extraReach) continue;

    const start = { x: startX, y: startY, z: startZ };
    const travel = { x: dx, y: dy, z: dz };
    if (group.mesh) {
      const contact = sweepMesh(group.mesh, {
        x: startX - group.platform.x, y: startY - group.platform.y - group.meshTopOffset, z: startZ - group.platform.z,
      }, travel, hit?.time ?? 1, group.posed ? player.pose.segments : undefined, group.posed ? contactWithClimber : undefined);
      if (contact && (!hit || contact.time < hit.time)) hit = { ...contact, group };
      continue;
    }
    const solid = group;
    let entry = -Infinity;
    let exit = Infinity;
    let face;
    for (const axis of solid.contactAxes) {
      const tilted = axis === "slope";
      let low, high, origin, relative;
      if (typeof axis === "object") {
        low = axis.low;
        high = axis.high;
        origin = axis.x * startX + axis.z * startZ;
        relative = axis.x * dx + axis.z * dz;
      } else {
        low = solid.min[axis];
        high = solid.max[axis];
        origin = tilted ? start.y - solid.gradient * start[solid.slope.axis] : start[axis];
        relative = tilted ? travel.y - solid.gradient * travel[solid.slope.axis] : travel[axis];
      }
      if (Math.abs(relative) < epsilon) {
        if (origin <= low + epsilon || origin >= high - epsilon) {
          entry = Infinity;
          break;
        }
        continue;
      }
      const a = (low - origin) / relative;
      const b = (high - origin) / relative;
      if (Math.min(a, b) > entry || (tilted && Math.min(a, b) >= entry - epsilon)) {
        entry = Math.min(a, b);
        face = axis;
      }
      exit = Math.min(exit, Math.max(a, b));
      if (entry > 1 || entry >= exit - epsilon) break;
    }
    if (entry >= -epsilon && entry <= 1 && entry < exit - epsilon && (!hit || entry < hit.time)) {
      hit = { group, solid, axis: face, time: Math.max(0, entry) };
    }
  }
  return hit;
}

function isWalkway(platform) {
  return platform.slope || platform.kind === "stair" || platform.kind === "bridge";
}

function stepOntoMesh(player, motion, group, solids, elapsed) {
  if (!player.grounded || Math.hypot(motion.x, motion.z) < epsilon) return false;
  if (player.grounded !== group.platform && !isWalkway(player.grounded) && !isWalkway(group.platform)) return false;

  const { platform, offset, delta } = group;
  const current = {
    x: platform.x + offset.x + delta.x * elapsed,
    y: platform.y + group.meshTopOffset + offset.y + delta.y * elapsed,
    z: platform.z + offset.z + delta.z * elapsed,
  };
  const lookAhead = group.posed ? Math.max(1, 6 / Math.hypot(motion.x, motion.z)) : 1;
  const rise = meshSupport(group.mesh, {
    x: player.x + motion.x * lookAhead - group.end.x,
    y: player.y + maxStep - current.y,
    z: player.z + motion.z * lookAhead - group.end.z,
  }, maxStep, group.posed ? player.pose.boots : undefined);
  const height = rise === null ? 0 : rise + current.y - player.y;
  if (height <= epsilon || height > maxStep) return false;
  // Clear the side we just touched before tracing the short upward step.
  const retreat = .08 / Math.hypot(motion.x, motion.z);
  const feet = { ...player, x: player.x - motion.x * retreat, z: player.z - motion.z * retreat };
  if (firstContact(feet, { ...noMovement, y: height }, solids, elapsed, group)) return false;

  player.x = feet.x;
  player.y += height;
  player.z = feet.z;
  return true;
}

function movePlayer(player, motion, solids) {
  // Expand each solid by the player's size, then sweep their feet through it.
  let elapsed = 0;
  for (let contact = 0; contact < 4 && elapsed < 1; contact += 1) {
    const hit = firstContact(player, motion, solids, elapsed);
    const fraction = hit ? hit.time : 1;
    for (const axis of axes) {
      player[axis] += motion[axis] * fraction;
      motion[axis] *= 1 - fraction;
    }
    elapsed += (1 - elapsed) * fraction;
    if (!hit) break;
    const { axis, group, solid, normal } = hit;
    if (normal) {
      if (normal.y > -.5 && normal.y < .82 && stepOntoMesh(player, motion, group, solids, elapsed)) continue;
      const remaining = 1 - elapsed;
      // Falling into the very edge of a sole is a landing, not a sideways kick.
      const verticalCarry = group.delta.y * remaining;
      if ((normal.y >= .45 && motion.y < verticalCarry) || (normal.y <= -.45 && motion.y > verticalCarry)) motion.y = verticalCarry;
      const horizontalLength = Math.hypot(normal.x, normal.z);
      // A near-vertical face should slide sideways without injecting a fall into the floor.
      const slide = player.grounded && Math.abs(normal.y) < .12
        ? { x: normal.x / horizontalLength, y: 0, z: normal.z / horizontalLength }
        : normal;
      const alongNormal = axes.reduce((sum, key) => sum + slide[key] * (motion[key] - group.delta[key] * remaining), 0);
      for (const key of axes) motion[key] -= slide[key] * Math.min(0, alongNormal);
      if (normal.y >= .45 && player.vy <= 0) {
        player.vy = 0;
      } else if (normal.y <= -.45 && player.vy > 0) {
        player.vy = 0;
      } else {
        const acrossNormal = normal.x * player.vx + normal.z * player.vz;
        const horizontal = normal.x ** 2 + normal.z ** 2;
        if (acrossNormal < 0 && horizontal > epsilon) {
          player.vx -= normal.x * acrossNormal / horizontal;
          player.vz -= normal.z * acrossNormal / horizontal;
        }
      }
      continue;
    }
    const top = solid.slope ? supportHeight(group.end, player) : solid.shape.y + group.end.y - group.platform.y;
    const height = top - player.y;
    if (axis === "slope") {
      motion.y = solid.gradient * motion[solid.slope.axis];
      player.vy = 0;
    } else if (axis !== "y" && player.grounded && elapsed < 1 &&
      (isWalkway(player.grounded) || isWalkway(group.platform)) &&
      height > epsilon && height <= maxStep &&
      !firstContact(player, { ...noMovement, y: height }, solids, elapsed)) {
      player.y += height;
    } else if (typeof axis === "object") {
      const { x, z } = axis;
      const normalMotion = x * (motion.x - group.delta.x * (1 - elapsed)) + z * (motion.z - group.delta.z * (1 - elapsed));
      const normalSpeed = x * player.vx + z * player.vz;
      motion.x -= x * normalMotion;
      motion.z -= z * normalMotion;
      player.vx -= x * normalSpeed;
      player.vz -= z * normalSpeed;
    } else {
      motion[axis] = group.delta[axis] * (1 - elapsed);
      player[`v${axis}`] = 0;
    }
  }
}

function groundedStepHeight(player, motion, solids) {
  if (!player.grounded || Math.hypot(motion.x, motion.z) < .05) return 0;
  const x = player.x + motion.x, z = player.z + motion.z;
  const y = player.y + motion.y;
  let rise = 0, tread;
  for (const group of solids) {
    if (!group.posed || !group.mesh ||
      (player.grounded !== group.platform && !isWalkway(player.grounded) && !isWalkway(group.platform))) continue;
    const { end, meshTopOffset } = group;
    if (x < end.x - 24 || x > end.x + end.w + 24 || z < end.z - 24 || z > end.z + end.d + 24) continue;
    const meshY = end.y + meshTopOffset;
    if (y > meshY + maxStep || y < end.y - end.thickness - maxStep) continue;
    const top = meshSupport(group.mesh, { x: x - end.x, y: y - meshY, z: z - end.z }, 0, player.pose.boots, maxStep);
    if (top !== null && top + meshY - y > rise) {
      rise = top + meshY - y;
      tread = group;
    }
  }
  if (rise <= epsilon || rise > maxStep) return 0;
  const ceiling = firstContact(player, { ...noMovement, y: rise }, solids, 0, tread);
  return ceiling ? 0 : rise;
}

function updateClimberContact(player, dt, solids, jumped) {
  const previous = { ...player.pose };
  advanceClimberPose(player, dt, false, jumped);
  const proposed = player.pose;
  if (proposed.segments === previous.segments) return;

  const nearby = [];
  for (const group of solids) {
    if (!group.posed || !group.mesh) continue;
    const { platform, offset, meshTopOffset, mesh } = group;
    const x = player.x - offset.x, y = player.y - offset.y, z = player.z - offset.z;
    if (x < group.min.x - 8 || x > group.max.x + 8 || z < group.min.z - 8 || z > group.max.z + 8 ||
      y < group.min.y - 8 || y > group.max.y + maxStep) continue;
    nearby.push({ group, mesh, point: { x: x - platform.x, y: y - platform.y - meshTopOffset, z: z - platform.z } });
  }
  const intersects = ({ mesh, point }, rise = 0) =>
    meshIntersectsBody(mesh, { ...point, y: point.y + rise }, .0002, proposed.boots);
  const conflict = nearby.find((entry) => intersects(entry));
  if (!conflict) return;

  player.pose = previous;
  if (!player.grounded) return;
  const { group, mesh, point } = conflict;
  const top = meshSupport(mesh, point, 0, proposed.boots, maxStep);
  const rise = top === null ? 0 : top - point.y;
  if (rise <= epsilon || rise > maxStep ||
    firstContact(player, { ...noMovement, y: rise }, solids, 0, group) ||
    nearby.some((entry) => intersects(entry, rise))) return;
  player.pose = proposed;
  player.y += rise;
}

export function step(game, input, dt) {
  if (dt <= 0) return;
  if (game.levelComplete) {
    if (game.won) advanceClimberPose(game.player, dt, true);
    return;
  }
  const { player, effects, effectPower, level } = game;
  const { goal: flag } = level;
  const previousTime = game.time;
  game.time += dt;
  if (game.time >= game.noticeUntil) game.notice = "";

  for (const effect of Object.keys(effects)) effects[effect] = Math.max(0, effects[effect] - dt);
  const frameSolids = solidsForStep(level, previousTime, game.time);
  const carrier = player.grounded && frameSolids.find(({ platform }) => platform === player.grounded);
  const carry = carrier?.delta ?? noMovement;

  const floating = effects.float > 0 || effects.flip > 0;
  const grounded = Boolean(player.grounded);
  const slippery = effects.slippery > 0;
  const boost = effects.boost > 0;
  if (!effects.directionLock) game.lockedDirection = null;
  const locked = game.lockedDirection;
  const across = Number(Boolean(input.right) && locked !== "right") - Number(Boolean(input.left) && locked !== "left");
  const depth = Number(Boolean(input.front) && locked !== "front") - Number(Boolean(input.back) && locked !== "back");
  const direction = effects.flip ? -1 : 1;
  const sprint = effects.sprint ? effectPower.sprint : 1;
  const rhythm = effects.stutter ? .62 + .36 * Math.sin(game.time * (6 + effectPower.stutter * 5)) : 1;
  const speed = (265 + (boost && !game.jumpOnlyBoost ? 77 * effectPower.boost : 0))
    * sprint * rhythm / (across && depth ? Math.SQRT2 : 1);
  const yaw = input.yaw || 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const moveX = across * cos + depth * sin;
  const moveZ = depth * cos - across * sin;
  const traction = grounded ? 3100 * (effects.grip ? effectPower.grip : 1)
    : 1750 * (effects.airControl ? effectPower.airControl : 1);
  const tractionX = slippery ? (Math.abs(moveX) > 0.001 ? 580 : 118) / effectPower.slippery : traction;
  const tractionZ = slippery ? (Math.abs(moveZ) > 0.001 ? 580 : 118) / effectPower.slippery : traction;
  const cyclone = effects.cyclone ? 115 * effectPower.cyclone : 0;
  const turn = game.time * 3.7;
  const gustX = (effects.gust ? game.gustDirection * 110 * effectPower.gust : 0) + cyclone * Math.cos(turn);
  const gustZ = (effects.gust ? game.gustDepth * 55 * effectPower.gust : 0) + cyclone * Math.sin(turn);
  const drag = effects.brake ? Math.exp(-effectPower.brake * dt) : 1;
  player.vx = approach(player.vx * drag, moveX * direction * speed + gustX, tractionX * dt);
  player.vz = approach(player.vz * drag, moveZ * direction * speed + gustZ, tractionZ * dt);

  const grace = effects.lateJump ? effectPower.lateJump : .095;
  player.coyote = grounded ? grace : Math.max(0, Math.min(grace, player.coyote - dt));
  player.jumpBuffer = effects.quiet ? 0 : input.jump && !player.jumpHeld ? .12 : Math.max(0, player.jumpBuffer - dt);
  player.jumpHeld = Boolean(input.jump);
  const jumped = !floating && ((player.coyote && player.jumpBuffer) || (grounded && effects.bounce));
  if (jumped) {
    const jumpPower = 588 + (boost ? 166 * effectPower.boost : 0);
    player.vy = jumpPower * (effects.bounce ? Math.sqrt(effectPower.bounce) : 1);
    player.grounded = null;
    player.coyote = 0;
    player.jumpBuffer = 0;
  }

  if (!player.grounded) {
    player.vy = floating
      ? approach(player.vy, effects.flip ? 145 * effectPower.flip : 88 * effectPower.float, 820 * dt)
      : Math.max(-940, player.vy - 1270 * dt * (effects.heavy ? effectPower.heavy : 1)
        * (player.vy < 0 && effects.feather ? effectPower.feather : 1));
    if (!floating && effects.dive && player.vy < 0) player.vy = Math.min(player.vy, -effectPower.dive);
    if (!floating && effects.glide) player.vy = Math.max(player.vy, -effectPower.glide);
  }

  updateClimberContact(player, dt, frameSolids, jumped);
  const motion = { x: player.vx * dt + carry.x, y: player.vy * dt + carry.y, z: player.vz * dt + carry.z };
  if (player.grounded?.slope && !carrier.mesh) {
    motion.y += supportHeight(carrier.end, { x: player.x + motion.x, z: player.z + motion.z }) - player.y;
  }
  player.y += groundedStepHeight(player, motion, frameSolids);
  movePlayer(player, motion, frameSolids);

  if (player.x < halfWidth || player.x > WIDTH - halfWidth) {
    player.x = clamp(player.x, halfWidth, WIDTH - halfWidth);
    player.vx = 0;
  }
  if (player.z < halfDepth || player.z > DEPTH - halfDepth) {
    player.z = clamp(player.z, halfDepth, DEPTH - halfDepth);
    player.vz = 0;
  }
  if (player.y > flag.y + 270) {
    player.y = flag.y + 270;
    player.vy = Math.min(0, player.vy);
  }

  let support;
  let top = -Infinity;
  if (!floating && player.vy <= 0) {
    for (const group of frameSolids) {
      const offsetY = group.end.y - group.platform.y;
      if (player.y < group.min.y + offsetY - epsilon || player.y > group.max.y + offsetY + maxStep) continue;
      const x = player.x - group.end.x + group.platform.x;
      const z = player.z - group.end.z + group.platform.z;
      if (!group.posed && !overPlatform(x, z, group)) continue;
      if (group.posed && (x < group.min.x - 12 || x > group.max.x + 12 || z < group.min.z - 12 || z > group.max.z + 12)) continue;
      const walkingDown = player.grounded && carrier && (isWalkway(carrier.platform) || isWalkway(group.platform) || (carrier === group && group.mesh));
      if (group.mesh) {
        const meshY = group.end.y + group.meshTopOffset;
        const poseLift = group.posed && player.grounded ? 1.5 : 0;
        const height = meshSupport(group.mesh, {
          x: x - group.platform.x, y: player.y + poseLift - meshY, z: z - group.platform.z,
        }, (walkingDown ? maxStep : .002) + poseLift, group.posed ? player.pose.boots : undefined);
        if (height !== null && height + meshY >= top) {
          support = group;
          top = height + meshY;
        }
        continue;
      }
      const height = supportHeight(group.end, player);
      const gap = player.y - height;
      if (height >= top && gap >= -epsilon && gap < (walkingDown ? maxStep : epsilon)) {
        support = group;
        top = height;
      }
    }
  }
  if (support) land(game, support.platform, top);
  else player.grounded = null;

  if (player.y < level.baseY - 130) {
    respawn(game);
    game.notice = "Back at the level start";
    game.noticeUntil = game.time + 2;
  }

  updateDragon(game, dt);
  game.bestY = Math.max(game.bestY, Math.min(flag.y, player.y));
  if (player.grounded === level.platforms.at(-1) && Math.hypot(player.x - flag.x, player.z - flag.z) < 28) {
    game.levelComplete = true;
    game.won = level.index === levels.length - 1;
  }
}

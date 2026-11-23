import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Box3, Vector3 } from '../vendor/three.module.min.js';
import { createClimberPose, fitClimber } from '../climber-poses.mjs';
import { GLTFLoader } from '../vendor/gltf-loader.mjs';

const output = new URL('../hiker-contact.mjs', import.meta.url);
const fps = 30;
const height = 43;
const bodyNames = [
  'torso', 'head', 'thigh_L', 'thigh_R', 'calf_L', 'calf_R',
  'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R',
];
const glb = await readFile(new URL('../assets/climber/hiker.glb', import.meta.url));
assert.equal(glb.toString('ascii', 0, 4), 'glTF');
const jsonLength = glb.readUInt32LE(12);
const content = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
// Animation and skinning need the source rig and geometry. Only textures are browser-only.
for (const { primitives } of content.meshes) for (const primitive of primitives) delete primitive.material;
for (const name of ['materials', 'textures', 'samplers', 'images']) delete content[name];
const json = Buffer.from(JSON.stringify(content));
const paddedLength = (json.length + 3) & ~3;
const binary = glb.subarray(20 + jsonLength);
const geometry = Buffer.alloc(20 + paddedLength + binary.length, ' ');
glb.copy(geometry, 0, 0, 20);
geometry.writeUInt32LE(geometry.length, 8);
geometry.writeUInt32LE(paddedLength, 12);
json.copy(geometry, 20);
binary.copy(geometry, 20 + paddedLength);
const arrayBuffer = geometry.buffer.slice(geometry.byteOffset, geometry.byteOffset + geometry.length);
const { scene: model, animations } = await new GLTFLoader().parseAsync(arrayBuffer, '');
let mesh;
model.traverse((node) => { if (node.isSkinnedMesh) mesh = node; });
assert(mesh, 'The hiker must have a skinned mesh.');
fitClimber(model, height);
const poses = createClimberPose(model, animations);

function groupFor(name) {
  if (/^(foot|toe)_[LR]$/.test(name)) return 'boot' + name.slice(-2);
  if (/^(thigh|calf|upperarm)_[LR]$/.test(name)) return name;
  if (/^(eye_[LR]|jaw|head)$/.test(name)) return 'head';
  if (/^(forearm|hand|index_|middle_|ring_|pinky_|thumb_)/.test(name)) return 'forearm' + name.slice(-2);
  return 'torso';
}

const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
const joints = mesh.skeleton.bones.map(({ name }) => groupFor(name));
const vertexGroups = new Map(['boot_L', 'boot_R', ...bodyNames].map((name) => [name, []]));
for (let i = 0; i < position.count; i++) {
  const groups = new Map();
  for (let component = 0; component < skinWeight.itemSize; component++) {
    const weight = skinWeight.getComponent(i, component);
    if (weight <= 0) continue;
    const group = joints[skinIndex.getComponent(i, component)];
    groups.set(group, (groups.get(group) ?? 0) + weight);
  }
  const [group] = [...groups].reduce((best, item) => item[1] > best[1] ? item : best);
  vertexGroups.get(group).push(i);
}
assert([...vertexGroups.values()].every((indices) => indices.length > 50));

const directions = [
  ...Array.from({ length: 8 }, (_, i) => {
    const angle = Math.PI * i / 4;
    return new Vector3(Math.cos(angle), -.76, Math.sin(angle));
  }),
  new Vector3(1, .76, 0), new Vector3(-1, .76, 0), new Vector3(0, .76, 1), new Vector3(0, .76, -1),
  new Vector3(0, -1, 0), new Vector3(0, 1, 0),
];
const yawDirections = Array.from({ length: 72 }, (_, i) => {
  const angle = Math.PI * i / 36;
  return new Vector3(Math.cos(angle), 0, Math.sin(angle));
});
const a = new Vector3(), b = new Vector3(), normal = new Vector3();
const planeTolerance = 1e-6;

function uniqueDirections(vectors) {
  const different = [];
  for (const vector of vectors) {
    if (!different.some((prior) => Math.abs(prior.dot(vector)) > 1 - 1e-9)) different.push(vector.clone());
  }
  return different.map((vector) => vector.toArray().map(Math.fround));
}

function bootHull(points) {
  // Use actual skinned points at the heel, sole, toe and boot body.
  const extremes = directions.map((direction) => points.reduce((furthest, point) =>
    point.dot(direction) > furthest.dot(direction) ? point : furthest));
  const vertices = [...new Map(extremes.map((vertex) => [vertex.toArray().join(','), vertex])).values()];
  const silhouette = yawDirections.map((direction) => {
    const vertex = points.reduce((furthest, candidate) =>
      candidate.dot(direction) > furthest.dot(direction) ? candidate : furthest);
    return { direction, vertex, limit: vertex.dot(direction) };
  });
  while (vertices.length < 22) {
    const largestGap = silhouette.reduce((worst, { direction, vertex, limit }) => {
      const gap = limit - Math.max(...vertices.map((point) => point.dot(direction)));
      return gap > worst.gap ? { vertex, gap } : worst;
    }, { gap: .075 });
    if (!largestGap.vertex) break;
    vertices.push(largestGap.vertex);
  }
  assert(vertices.length >= 8);
  const planes = [];
  for (let i = 0; i < vertices.length; i++) {
    const first = vertices[i];
    for (let j = i + 1; j < vertices.length; j++) {
      a.subVectors(vertices[j], first);
      for (let k = j + 1; k < vertices.length; k++) {
        b.subVectors(vertices[k], first);
        normal.crossVectors(a, b);
        if (normal.lengthSq() < 1e-12) continue;
        normal.normalize();
        let offset = normal.dot(first);
        const margins = vertices.map((vertex) => normal.dot(vertex) - offset);
        const positive = margins.some((margin) => margin > planeTolerance);
        if (positive && margins.some((margin) => margin < -planeTolerance)) continue;
        if (positive) {
          normal.negate();
          offset = -offset;
        }
        if (planes.some((p) => p.normal.dot(normal) > 1 - 1e-9 && Math.abs(p.offset - offset) < planeTolerance)) continue;
        planes.push({ normal: normal.clone(), offset, members: margins.map((margin) => Math.abs(margin) < planeTolerance) });
      }
    }
  }
  const edges = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      if (planes.filter(({ members }) => members[i] && members[j]).length >= 2) {
        edges.push(new Vector3().subVectors(vertices[i], vertices[j]).normalize());
      }
    }
  }
  assert(planes.length >= 4 && edges.length >= 6);
  return {
    vertices: vertices.map((point) => point.toArray().map(Math.fround)),
    normals: uniqueDirections(planes.map((plane) => plane.normal)),
    edges: uniqueDirections(edges),
  };
}

const point = new Vector3();
const posedPoint = (index) => mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
const bootPoints = (name) => vertexGroups.get(name).map((index) => posedPoint(index).clone());
function posedBox(name) {
  const box = new Box3();
  for (const index of vertexGroups.get(name)) box.expandByPoint(posedPoint(index));
  const { min, max } = box;
  return [(min.x + max.x) / 2, min.y, (min.z + max.z) / 2, (max.x - min.x) / 2, max.y - min.y, (max.z - min.z) / 2];
}

const lines = [
  '// Generated by scripts/generate-hiker-contact.mjs from the original skinned hiker mesh.',
  '// Pose coordinates use the shared renderer fit, before yaw and ground lift are applied.',
  'export const HIKER_HEIGHT = 43;',
  '',
  'function vec3(stream, cursor, count) {',
  '  return Array.from({ length: count }, () => [stream[cursor.index++], stream[cursor.index++], stream[cursor.index++]]);',
  '}',
  '',
  'function clip(duration, frameCount, encoded) {',
  '  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));',
  '  const stream = new Float32Array(bytes.buffer);',
  '  const cursor = { index: 0 };',
  '  const frames = Array.from({ length: frameCount }, () => {',
  '    const time = stream[cursor.index++];',
  '    const lift = stream[cursor.index++];',
  '    const boots = Array.from({ length: 2 }, () => {',
  '      const vertexCount = stream[cursor.index++];',
  '      const normalCount = stream[cursor.index++];',
  '      const edgeCount = stream[cursor.index++];',
  '      return {',
  '        vertices: vec3(stream, cursor, vertexCount),',
  '        normals: vec3(stream, cursor, normalCount),',
  '        edges: vec3(stream, cursor, edgeCount),',
  '      };',
  '    });',
  '    const body = Array.from({ length: 10 }, () => {',
  '      const [x, y, z, halfWidth, height, halfDepth] = stream.subarray(cursor.index, cursor.index + 6);',
  '      cursor.index += 6;',
  '      return { x, y, z, halfWidth, height, halfDepth };',
  '    });',
  '    return { time, lift, boots, body };',
  '  });',
  '  return { duration, fps: 30, frames };',
  '}',
  '',
  'export const hikerClips = {',
];

for (const name of ['idle', 'walk', 'airborne', 'wave']) {
  const { duration } = poses.clips.find((clip) => clip.name === name);
  const frameCount = Math.ceil(duration * fps - 1e-5) + 1;
  const values = [];
  let first;
  for (let frame = 0; frame < frameCount; frame++) {
    const time = Math.fround(Math.min(frame / fps, duration));
    poses.apply(name, time);
    model.updateMatrixWorld(true);
    const left = bootPoints('boot_L'), right = bootPoints('boot_R');
    const boots = [bootHull(left), bootHull(right)];
    const lowest = Math.min(...boots.flatMap(({ vertices }) => vertices.map(([, y]) => y)));
    const realLowest = Math.min(...[...left, ...right].map(({ y }) => y));
    assert(Math.abs(realLowest - lowest) < .00001);
    values.push(time, -lowest);
    if (frame === 0) first = { lowest, boots: boots.map(({ vertices }) => {
      const bounds = new Box3().setFromPoints(vertices.map((p) => new Vector3(...p)));
      return { min: bounds.min.toArray(), max: bounds.max.toArray() };
    }) };
    for (const { vertices, normals, edges } of boots) {
      values.push(vertices.length, normals.length, edges.length, ...vertices.flat(), ...normals.flat(), ...edges.flat());
    }
    for (const part of bodyNames) values.push(...posedBox(part));
  }
  const data = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => data.writeFloatLE(value, index * 4));
  const chunks = data.toString('base64').match(/.{1,112}/g);
  lines.push(`  ${name}: clip(${duration}, ${frameCount},`);
  lines.push(chunks.map((segment) => `    '${segment}'`).join(' +\n') + '),');
  console.log(`${name}: ${frameCount} poses; first boot bounds ${JSON.stringify(first)}`);
}
lines.push('};', '');
const result = lines.join('\n');
if (process.argv.includes('--check')) assert.equal(await readFile(output, 'utf8'), result);
else await writeFile(output, result);

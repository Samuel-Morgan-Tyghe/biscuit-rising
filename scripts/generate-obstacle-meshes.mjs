import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { Box3, Vector3 } from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/gltf-loader.mjs';

const directory = new URL('../assets/obstacles/', import.meta.url);
const output = new URL('../obstacle-meshes.mjs', import.meta.url);

function geometryGlb(source) {
  // Only strip material references. GLTFLoader still applies the original mesh transforms.
  assert.equal(source.toString('ascii', 0, 4), 'glTF');
  const length = source.readUInt32LE(12);
  const json = JSON.parse(source.toString('utf8', 20, 20 + length));
  for (const { primitives } of json.meshes) for (const primitive of primitives) delete primitive.material;
  delete json.materials;
  delete json.textures;
  delete json.samplers;
  delete json.images;
  const text = JSON.stringify(json);
  const newLength = (Buffer.byteLength(text) + 3) & ~3;
  const remaining = source.subarray(20 + length);
  const result = Buffer.alloc(20 + newLength + remaining.length, ' ');
  source.copy(result, 0, 0, 20);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(newLength, 12);
  result.write(text, 20, 'utf8');
  remaining.copy(result, 20 + newLength);
  return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
}

function readTriangles(scene) {
  const bounds = new Box3().setFromObject(scene, true);
  const size = bounds.getSize(new Vector3());
  const vertex = new Vector3();
  const unique = new Map();
  const positions = [];
  const indices = [];
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    assert(!mesh.isSkinnedMesh && !mesh.morphTargetInfluences?.length);
    const { geometry } = mesh;
    const position = geometry.getAttribute('position');
    const count = geometry.index?.count ?? position.count;
    assert.equal(count % 3, 0);
    for (let index = 0; index < count; index++) {
      vertex.fromBufferAttribute(position, geometry.index?.getX(index) ?? index);
      vertex.applyMatrix4(mesh.matrixWorld).sub(bounds.min).divide(size);
      const data = vertex.toArray().map(Math.fround);
      const key = data.join(',');
      if (!unique.has(key)) {
        unique.set(key, positions.length / 3);
        positions.push(...data);
      }
      indices.push(unique.get(key));
    }
  });
  assert(positions.length && indices.length && unique.size <= 65536);
  return { size, positions, indices };
}

const bundled = [
  '// Generated from the rendered GLB triangles by scripts/generate-obstacle-meshes.mjs.',
  '// Model-space vertices are fractional coordinates within the native Three.js bounds.',
  '// The asset transform maps this same mesh to the rendered width, depth and height.',
  'function mesh(nativeWidth, nativeDepth, nativeHeight, positionCount, encoded) {',
  '  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));',
  '  const boundary = positionCount * 4;',
  '  return {',
  '    nativeWidth,',
  '    nativeDepth,',
  '    nativeHeight,',
  '    positions: new Float32Array(bytes.buffer, 0, positionCount),',
  '    indices: new Uint16Array(bytes.buffer, boundary),',
  '  };',
  '}',
  '',
  'export const obstacleMeshes = {',
];

const loader = new GLTFLoader();
const paths = (await readdir(directory)).filter((filename) => filename.endsWith('.glb')).sort();
assert(paths.length > 0);
for (const filename of paths) {
  const { scene } = await loader.parseAsync(geometryGlb(await readFile(new URL(filename, directory))), '');
  const { size, positions, indices } = readTriangles(scene);
  const boundary = positions.length * 4;
  const data = Buffer.alloc(boundary + indices.length * 2);
  positions.forEach((value, index) => data.writeFloatLE(value, index * 4));
  indices.forEach((value, index) => data.writeUInt16LE(value, boundary + index * 2));
  const key = JSON.stringify(filename.slice(0, -4));
  bundled.push(`  ${key}: mesh(${size.x}, ${size.z}, ${size.y}, ${positions.length},`);
  const segments = data.toString('base64').match(/.{1,112}/g);
  bundled.push(segments.map((segment) => `    '${segment}'`).join(' +\n') + '),');
  console.log(`${filename}: ${positions.length / 3} vertices, ${indices.length / 3} authored triangles`);
}
bundled.push('};', '');
const result = bundled.join('\n');
if (process.argv.includes('--check')) assert.equal(await readFile(output, 'utf8'), result);
else await writeFile(output, result);

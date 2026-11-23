const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const EPSILON = 1e-9;
const SURFACE_NUDGE = 1e-5;
const meshIndices = new WeakMap();

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const difference = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function bounds(nodes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of nodes) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], node.min[axis]);
      max[axis] = Math.max(max[axis], node.max[axis]);
    }
  }
  return { min, max };
}

function tree(triangles) {
  const box = bounds(triangles);
  if (triangles.length <= 10) return { ...box, triangles };
  const spread = difference(box.max, box.min);
  const axis = spread.indexOf(Math.max(...spread));
  triangles.sort((a, b) => (a.min[axis] + a.max[axis]) - (b.min[axis] + b.max[axis]));
  const split = Math.floor(triangles.length / 2);
  return { ...box, left: tree(triangles.slice(0, split)), right: tree(triangles.slice(split)) };
}

function sourceIndex(source) {
  if (meshIndices.has(source)) return meshIndices.get(source);
  const { positions, indices } = source;
  const vertex = (index) => {
    const offset = indices[index] * 3;
    return [positions[offset], positions[offset + 1], positions[offset + 2]];
  };
  const triangles = [];
  for (let index = 0; index < indices.length; index += 3) {
    const a = vertex(index);
    const b = vertex(index + 1);
    const c = vertex(index + 2);
    const normal = cross(difference(b, a), difference(c, a));
    if (Math.hypot(...normal) <= EPSILON * EPSILON) continue;
    triangles.push({
      vertices: [a, b, c],
      normal,
      min: a.map((value, axis) => Math.min(value, b[axis], c[axis])),
      max: a.map((value, axis) => Math.max(value, b[axis], c[axis])),
    });
  }
  const index = tree(triangles);
  meshIndices.set(source, index);
  return index;
}

export function buildMeshCollider(platform, [halfWidth, height, halfDepth]) {
  const { x, y, z, w, thickness, d, quarterTurn, mesh } = platform;
  return {
    x, bottom: y - thickness, z, w, h: thickness, d, quarterTurn,
    tree: sourceIndex(mesh),
    shapes: new WeakMap(),
    extent: quarterTurn ? [halfDepth / d, height / thickness, halfWidth / w] :
      [halfWidth / w, height / thickness, halfDepth / d],
  };
}

function toLocal(mesh, { x, y, z }) {
  const u = (x - mesh.x) / mesh.w;
  const v = (y - mesh.bottom) / mesh.h;
  const t = (z - mesh.z) / mesh.d;
  return mesh.quarterTurn ? [1 - t, v, u] : [u, v, t];
}

function toLocalMotion(mesh, { x, y, z }) {
  const u = x / mesh.w;
  const v = y / mesh.h;
  const t = z / mesh.d;
  return mesh.quarterTurn ? [-t, v, u] : [u, v, t];
}

function worldNormal(mesh, normal, sign) {
  const x = sign * normal[mesh.quarterTurn ? 2 : 0] / mesh.w;
  const y = sign * normal[1] / mesh.h;
  const z = sign * (mesh.quarterTurn ? -normal[0] : normal[2]) / mesh.d;
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}

function localNormal(mesh, [x, y, z]) {
  const u = x * mesh.w, v = y * mesh.h, t = z * mesh.d;
  return mesh.quarterTurn ? [-t, v, u] : [u, v, t];
}

function unit(axis) {
  const length = Math.hypot(...axis);
  return length <= EPSILON * EPSILON ? null : axis.map((coordinate) => coordinate / length);
}

function parallel(a, b) {
  return Math.abs(dot(a, b)) >= 1 - 4 * Number.EPSILON;
}

function uniqueUnits(source) {
  const axes = [];
  for (const candidate of source) {
    const axis = unit(candidate);
    if (axis && !axes.some((existing) => parallel(axis, existing))) axes.push(axis);
  }
  return axes;
}

function project(axis, vertices) {
  let low = Infinity, high = -Infinity;
  for (const vertex of vertices) {
    const value = dot(axis, vertex);
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return { axis, low, high };
}

function prism({ halfWidth, halfDepth, height, footprint }) {
  const contour = footprint ?? [[-halfWidth, -halfDepth], [halfWidth, -halfDepth],
    [halfWidth, halfDepth], [-halfWidth, halfDepth]];
  const sides = contour.map(([x, z], index) => {
    const [endX, endZ] = contour[(index + 1) % contour.length];
    return [endX - x, 0, endZ - z];
  });
  return {
    vertices: contour.flatMap(([x, z]) => [[x, 0, z], [x, height, z]]),
    normals: [[0, 1, 0], ...sides.map(([x, , z]) => [z, 0, -x])],
    edges: [[0, 1, 0], ...sides],
  };
}

function compileSegment(mesh, segment) {
  const { yaw = 0, x = 0, y = 0, z = 0 } = segment;
  const cached = mesh.shapes.get(segment);
  if (cached && cached.yaw === yaw && cached.x === x && cached.y === y && cached.z === z) return cached.shape;

  const source = segment.vertices ? segment : prism(segment);
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const rotate = ([u, v, t]) => [u * cos + t * sin, v, t * cos - u * sin];
  const vertices = source.vertices.map((vertex) => {
    const [u, v, t] = rotate([vertex[0] + x, vertex[1] + y, vertex[2] + z]);
    return toLocalMotion(mesh, { x: u, y: v, z: t });
  });
  const normals = uniqueUnits(source.normals.map((normal) => localNormal(mesh, rotate(normal))));
  const edges = uniqueUnits(source.edges.map((edge) => {
    const [u, v, t] = rotate(edge);
    return toLocalMotion(mesh, { x: u, y: v, z: t });
  }));
  const projected = AXES.map((axis) => project(axis, vertices));
  const shape = {
    segment, vertices, normals, edges,
    faces: normals.map((axis) => ({
      ...project(axis, vertices),
      units: mesh.quarterTurn ? Math.hypot(axis[2] / mesh.w, axis[1] / mesh.h, axis[0] / mesh.d) :
        Math.hypot(axis[0] / mesh.w, axis[1] / mesh.h, axis[2] / mesh.d),
    })),
    min: projected.map(({ low }) => low),
    max: projected.map(({ high }) => high),
  };
  mesh.shapes.set(segment, { yaw, x, y, z, shape });
  return shape;
}

function visit(node, min, max, check) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (min[axis] > node.max[axis] + EPSILON || max[axis] < node.min[axis] - EPSILON) return false;
  }
  if (!node.triangles) return visit(node.left, min, max, check) || visit(node.right, min, max, check);
  for (const triangle of node.triangles) {
    let overlaps = true;
    for (let axis = 0; axis < 3; axis += 1) {
      if (min[axis] > triangle.max[axis] + EPSILON || max[axis] < triangle.min[axis] - EPSILON) {
        overlaps = false;
        break;
      }
    }
    if (overlaps && check(triangle)) return true;
  }
  return false;
}

function trianglePlanes(triangle) {
  if (triangle.planes) return triangle.planes;
  const [a, b, c] = triangle.vertices;
  // A box and triangle can also separate along any edge crossed with a box axis.
  const candidates = [...AXES, triangle.normal];
  for (const edge of [difference(b, a), difference(c, b), difference(a, c)]) {
    for (const axis of AXES) candidates.push(cross(edge, axis));
  }
  const planes = [];
  for (const candidate of candidates) {
    const magnitude = Math.hypot(...candidate);
    if (magnitude <= EPSILON * EPSILON) continue;
    const axis = candidate.map((coordinate) => coordinate / magnitude);
    if (planes.some((plane) => Math.abs(dot(plane.axis, axis)) >= 1 - 4 * Number.EPSILON)) continue;
    const aa = dot(axis, a), bb = dot(axis, b), cc = dot(axis, c);
    planes.push({ axis, min: Math.min(aa, bb, cc), max: Math.max(aa, bb, cc) });
  }
  triangle.planes = planes;
  return planes;
}

function triangleContact(triangle, start, change, extent, limit) {
  let entry = -Infinity;
  let exit = Infinity;
  let normal;
  let direction;
  for (const { axis, min, max } of trianglePlanes(triangle)) {
    const origin = dot(start, axis);
    const delta = dot(change, axis);
    const padding = Math.abs(axis[0]) * extent[0] + Math.abs(axis[2]) * extent[2];
    const vertical = axis[1] * extent[1];
    const low = min - padding - Math.max(vertical, 0);
    const high = max + padding - Math.min(vertical, 0);
    if (Math.abs(delta) <= EPSILON) {
      if (origin <= low + EPSILON || origin >= high - EPSILON) return null;
      continue;
    }
    const near = ((delta > 0 ? low : high) - origin) / delta;
    const far = ((delta > 0 ? high : low) - origin) / delta;
    if (near > entry) {
      entry = near;
      normal = axis;
      direction = delta > 0 ? -1 : 1;
    }
    exit = Math.min(exit, far);
    if (entry > limit || entry >= exit - EPSILON) return null;
  }
  return entry < -EPSILON || !normal ? null : { time: Math.max(0, entry), normal, direction };
}

function convexContact(triangle, start, change, shape, limit) {
  let entry = -Infinity;
  let exit = Infinity;
  let normal;
  let direction;
  const clip = ({ axis, low, high }) => {
    const support = project(axis, triangle.vertices);
    const min = support.low - high;
    const max = support.high - low;
    const origin = dot(start, axis);
    const delta = dot(change, axis);
    if (Math.abs(delta) <= EPSILON) return origin > min + EPSILON && origin < max - EPSILON;
    const near = ((delta > 0 ? min : max) - origin) / delta;
    const far = ((delta > 0 ? max : min) - origin) / delta;
    if (near > entry) {
      entry = near;
      normal = axis;
      direction = delta > 0 ? -1 : 1;
    }
    exit = Math.min(exit, far);
    return entry <= limit && entry < exit - EPSILON;
  };

  if (!triangle.face) {
    const [a, b, c] = triangle.vertices;
    triangle.face = unit(triangle.normal);
    triangle.edges = uniqueUnits([difference(b, a), difference(c, b), difference(a, c)]);
  }
  const { face, edges } = triangle;
  if (!clip(project(face, shape.vertices))) return null;
  if (!shape.faces.every(clip)) return null;
  // Unlike an axis-aligned box, a rotated/skinned convex has its own edge directions.
  const tested = [...shape.normals, face];
  for (const triangleEdge of edges) {
    for (const bodyEdge of shape.edges) {
      const axis = unit(cross(triangleEdge, bodyEdge));
      if (!axis || tested.some((existing) => parallel(axis, existing))) continue;
      if (!clip(project(axis, shape.vertices))) return null;
      tested.push(axis);
    }
  }
  return entry < -EPSILON || !normal ? null : { time: Math.max(0, entry), normal, direction };
}

function sweptBounds(shape, start, change, limit) {
  return {
    shape,
    min: start.map((coordinate, axis) => Math.min(coordinate, coordinate + change[axis] * limit) + shape.min[axis]),
    max: start.map((coordinate, axis) => Math.max(coordinate, coordinate + change[axis] * limit) + shape.max[axis]),
  };
}

function intersectsBounds(triangle, min, max) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (min[axis] > triangle.max[axis] + EPSILON || max[axis] < triangle.min[axis] - EPSILON) return false;
  }
  return true;
}

function cast(mesh, point, motion, limit, accept, segments, walkableFaces = false) {
  const start = toLocal(mesh, point);
  const change = toLocalMotion(mesh, motion);
  const { extent } = mesh;
  const shapes = segments?.map((segment) => sweptBounds(compileSegment(mesh, segment), start, change, limit));
  const envelope = shapes ? bounds(shapes) : sweptBounds({
    min: [-extent[0], 0, -extent[2]], max: extent,
  }, start, change, limit);
  let hit = null;

  const consider = (next, segment) => {
    if (!next) return;
    const normal = worldNormal(mesh, next.normal, next.direction);
    if (accept && !accept(normal, segment)) return;
    if (!hit || next.time < hit.time || (next.time === hit.time && normal.y > hit.normal.y)) {
      hit = segment ? { time: next.time, normal, segment } : { time: next.time, normal };
    }
  };
  visit(mesh.tree, envelope.min, envelope.max, (triangle) => {
    if (walkableFaces && triangle.normal[1] <= EPSILON) return false;
    if (shapes) {
      for (const { shape, min, max } of shapes) {
        if (!intersectsBounds(triangle, min, max)) continue;
        consider(convexContact(triangle, start, change, shape, hit?.time ?? limit), shape.segment);
      }
    } else {
      consider(triangleContact(triangle, start, change, extent, hit?.time ?? limit));
    }
    return false;
  });
  return hit;
}

export function sweepMesh(mesh, point, motion, limit = 1, segments, accept) {
  return cast(mesh, point, motion, limit, accept, segments);
}

export function meshSupport(mesh, player, maxDrop = 1e-6, segments, maxRise = 0) {
  const rise = Math.max(maxRise, 0);
  const point = { x: player.x, y: player.y + rise + SURFACE_NUDGE, z: player.z };
  const motion = { x: 0, y: -Math.max(maxDrop, 0) - rise - 2 * SURFACE_NUDGE, z: 0 };
  const hit = cast(mesh, point, motion, 1, (normal) => normal.y > EPSILON, segments, Boolean(segments));
  return hit ? point.y + motion.y * hit.time : null;
}

export function meshSurface(mesh, x, z, ceiling = Infinity) {
  const [u, cap, t] = toLocal(mesh, { x, y: ceiling, z });
  let top = -Infinity;
  visit(mesh.tree, [u, -Infinity, t], [u, cap, t], ({ vertices, normal, min, max }) => {
    if (Math.abs(normal[1]) <= EPSILON * EPSILON || max[1] <= top || min[1] > cap) return false;
    const [a, b, c] = vertices;
    const px = u - a[0], pz = t - a[2];
    const abx = b[0] - a[0], abz = b[2] - a[2];
    const acx = c[0] - a[0], acz = c[2] - a[2];
    const determinant = -normal[1];
    const v = (px * acz - acx * pz) / determinant;
    const w = (abx * pz - px * abz) / determinant;
    if (v < -EPSILON || w < -EPSILON || v + w > 1 + EPSILON) return false;
    const height = a[1] + v * (b[1] - a[1]) + w * (c[1] - a[1]);
    if (height <= cap + EPSILON) top = Math.max(top, height);
    return false;
  });
  return top === -Infinity ? null : mesh.bottom + top * mesh.h;
}

function clipsPlanes(triangle, planes) {
  let polygon = triangle.vertices;
  for (const { axis, low, high } of planes) {
    for (const [boundary, side] of [[low, 1], [high, -1]]) {
      const clipped = [];
      let previous = polygon.at(-1);
      for (const point of polygon) {
        const from = (dot(previous, axis) - boundary) * side;
        const to = (dot(point, axis) - boundary) * side;
        if ((from < 0) !== (to < 0)) {
          const fraction = from / (from - to);
          clipped.push(previous.map((coordinate, dimension) => coordinate + (point[dimension] - coordinate) * fraction));
        }
        if (to >= 0) clipped.push(point);
        previous = point;
      }
      polygon = clipped;
      if (polygon.length < 3) return false;
    }
  }
  return polygon.slice(2).some((point, index) =>
    Math.hypot(...cross(difference(polygon[index + 1], polygon[0]), difference(point, polygon[0]))) > EPSILON * EPSILON);
}

export function meshIntersectsBody(mesh, player, inset = .001, segments) {
  const point = toLocal(mesh, player);
  if (segments) {
    const shapes = segments.map((segment) => sweptBounds(compileSegment(mesh, segment), point, [0, 0, 0], 0));
    const envelope = bounds(shapes);
    return visit(mesh.tree, envelope.min, envelope.max, (triangle) => shapes.some((entry) => {
      if (!intersectsBounds(triangle, entry.min, entry.max)) return false;
      entry.planes ??= entry.shape.faces.map(({ axis, low, high, units }) => {
        const offset = dot(point, axis);
        return { axis, low: low + offset + inset * units, high: high + offset - inset * units };
      });
      return clipsPlanes(triangle, entry.planes);
    }));
  }
  const { extent } = mesh;
  const safety = mesh.quarterTurn ? [inset / mesh.d, inset / mesh.h, inset / mesh.w] :
    [inset / mesh.w, inset / mesh.h, inset / mesh.d];
  const min = point.map((coordinate, axis) => coordinate - (axis === 1 ? 0 : extent[axis]) + safety[axis]);
  const max = point.map((coordinate, axis) => coordinate + extent[axis] - safety[axis]);
  const planes = AXES.map((axis, slot) => ({ axis, low: min[slot], high: max[slot] }));
  return visit(mesh.tree, min, max, (triangle) => clipsPlanes(triangle, planes));
}

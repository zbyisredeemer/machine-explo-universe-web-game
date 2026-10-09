import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { robotMaterials } from './robot-materials.js';

export function mechanicalParts(world, root, color, prefix) {
  const materials = robotMaterials(world, color);
  let serial = 0;
  const node = (parent, p, name) => {
    const g = new T.Group();
    g.name = prefix + '-' + name + '-' + serial++;
    g.position.set(...p);
    parent.add(g);
    return g;
  };
  const mesh = (geometry, material, p, parent = root) => {
    const m = new T.Mesh(geometry, material);
    m.position.set(...p);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (s, p, m = materials.paint, parent = root) =>
    mesh(
      world.geo('RoundedBoxGeometry', [...s, 2, Math.min(0.04, Math.min(...s) * 0.14)]),
      m,
      p,
      parent,
    );
  const cylinder = (r, h, p, m = materials.steel, parent = root, axis = 'y', segments = 16) => {
    const a = mesh(world.geo('CylinderGeometry', [r, r, h, segments]), m, p, parent);
    if (axis === 'x') a.rotation.z = Math.PI / 2;
    if (axis === 'z') a.rotation.x = Math.PI / 2;
    return a;
  };
  const ring = (r, t, p, m = materials.edge, parent = root, axis = 'z') => {
    const a = mesh(world.geo('TorusGeometry', [r, t, 6, 32]), m, p, parent);
    if (axis === 'y') a.rotation.x = Math.PI / 2;
    if (axis === 'x') a.rotation.y = Math.PI / 2;
    return a;
  };
  const rod = (a, b, r, m = materials.steel, parent = root) => {
    const from = new T.Vector3(...a),
      to = new T.Vector3(...b),
      delta = to.clone().sub(from);
    const part = cylinder(r, delta.length(), from.add(to).multiplyScalar(0.5).toArray(), m, parent);
    part.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return part;
  };
  const bolt = (p, parent = root, r = 0.045, axis = 'z') =>
    cylinder(r, 0.04, p, materials.black, parent, axis, 6);
  const joint = (p, r, h, parent) => {
    cylinder(r, h, p, materials.black, parent, 'x');
    for (const s of [-1, 1]) {
      const x = p[0] + s * (h / 2 + 0.02);
      cylinder(r * 0.83, 0.05, [x, p[1], p[2]], materials.edge, parent, 'x');
      cylinder(r * 0.4, 0.07, [x + s * 0.035, p[1], p[2]], materials.steel, parent, 'x');
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        bolt(
          [x + s * 0.025, p[1] + Math.cos(a) * r * 0.62, p[2] + Math.sin(a) * r * 0.62],
          parent,
          r * 0.12,
          'x',
        );
      }
    }
  };
  const cable = (points, r, parent) => {
    const key = 'mech-wire-' + JSON.stringify(points) + '-' + r;
    if (!world.geometries.has(key))
      world.geometries.set(
        key,
        new T.TubeGeometry(
          new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
          14,
          r,
          6,
          false,
        ),
      );
    return mesh(world.geometries.get(key), materials.rubber, [0, 0, 0], parent);
  };
  const plate = (w, h, d, p, m = materials.paint, parent = root) => {
    const b = box([w, h, d], p, m, parent);
    return b;
  };
  const vents = (p, width, height, count, parent) => {
    box([width, height, 0.08], p, materials.black, parent);
    for (let i = 0; i < count; i++)
      box(
        [width * 0.9, 0.035, 0.055],
        [p[0], p[1] - height * 0.4 + (i * height * 0.8) / (count - 1), p[2] - 0.055],
        materials.steel,
        parent,
      );
  };
  const bake = (parent = root) => {
    for (const child of [...parent.children]) if (child.isGroup) bake(child);
    const groups = new Map();
    for (const child of [...parent.children])
      if (child.isMesh && !child.userData.dynamic) {
        const key = child.material.uuid;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(child);
      }
    for (const [material, children] of groups) {
      if (children.length < 2) continue;
      const key = 'mech-baked-' + (parent.name || prefix) + '-' + material;
      if (!world.geometries.has(key)) {
        const pieces = children.map((child) => {
          child.updateMatrix();
          const geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
          geo.applyMatrix4(child.matrix);
          return geo;
        });
        world.geometries.set(key, mergeGeometries(pieces));
        pieces.forEach((g) => g.dispose());
      }
      const merged = new T.Mesh(world.geometries.get(key), children[0].material);
      merged.castShadow = true;
      merged.receiveShadow = true;
      children.forEach((c) => parent.remove(c));
      parent.add(merged);
    }
  };
  return {
    m: materials,
    node,
    mesh,
    box,
    cylinder,
    ring,
    rod,
    bolt,
    joint,
    cable,
    plate,
    vents,
    bake,
  };
}

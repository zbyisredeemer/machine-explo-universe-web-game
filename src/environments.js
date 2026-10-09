import * as T from 'three';
import { deckTexture, surfaceTexture } from './visuals.js';

// Static architecture is instanced by geometry/material. Actors, doors and story
// objects stay separate so that saved world changes remain independently visible.
export function buildEnvironment(w, index, c) {
  const group = new T.Group();
  if (!w.textures.has('deck')) w.textures.set('deck', deckTexture());
  const deckKey = 'environment-deck-' + index;
  if (!w.materials.has(deckKey))
    w.materials.set(
      deckKey,
      new T.MeshStandardMaterial({
        color: c.theme.deck,
        map: w.textures.get('deck'),
        bumpMap: w.textures.get('deck'),
        bumpScale: 0.055,
        roughness: 0.74,
        metalness: 0.35,
      }),
    );
  const dark = c.theme.deep,
    steel = c.theme.metal,
    ivory = '#d7dfeb';
  if (!w.textures.has('structural-surface')) w.textures.set('structural-surface', surfaceTexture());
  const structural = (color) => {
    const key = 'structure-' + color;
    if (!w.materials.has(key))
      w.materials.set(
        key,
        new T.MeshStandardMaterial({
          color,
          roughness: 0.72,
          metalness: 0.48,
          bumpMap: w.textures.get('structural-surface'),
          bumpScale: 0.035,
          roughnessMap: w.textures.get('structural-surface'),
        }),
      );
    return w.materials.get(key);
  };
  const box = (size, p, color = steel, glow = 0, rotation = 0) => {
    const m = w.mesh('BoxGeometry', [1, 1, 1], color, p, group, glow);
    if (!glow) m.material = structural(color);
    m.scale.set(...size);
    m.rotation.y = rotation;
    if (!glow && Math.min(...size) >= 0.3 && size[0] * size[1] * size[2] >= 3)
      m.userData.shotObstacle = true;
    return m;
  };
  const cylinder = (r, h, p, color, top = r, glow = 0) => {
    const m = w.mesh('CylinderGeometry', [top / r, 1, 1, 16], color, p, group, glow);
    if (!glow) m.material = structural(color);
    m.scale.set(r, h, r);
    return m;
  };
  const rod = (a, b, r, color, glow = 0) => {
    const from = new T.Vector3(...a),
      to = new T.Vector3(...b),
      delta = to.clone().sub(from);
    const m = cylinder(
      r,
      delta.length(),
      from.add(to).multiplyScalar(0.5).toArray(),
      color,
      r,
      glow,
    );
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return m;
  };
  const ring = (r, tube, p, color, rotation = [0, 0, 0], glow = 0) => {
    const m = w.ring(r, tube, color, p, group, glow);
    m.rotation.set(...rotation);
    return m;
  };
  const label = (text, x, y, z, width = 14, color = c.color) => {
    const key = `sign-${text}-${color}`;
    if (!w.textures.has(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#10242b';
      ctx.fillRect(0, 0, 1024, 128);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 7, 128);
      ctx.font = 'bold 48px monospace';
      ctx.fillText(text, 35, 79);
      const texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      w.textures.set(key, texture);
      w.materials.set(key, new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }));
    }
    const mesh = new T.Mesh(w.geo('PlaneGeometry', [1, 1]), w.materials.get(key));
    mesh.position.set(x, y, z);
    mesh.scale.set(width, width / 8, 1);
    group.add(mesh);
  };
  // Lower structural layers, inset seams and a readable lit route give the deck
  // scale without the old repeated monolithic pillars.
  for (const [z, length] of [
    [-10, 106],
    [-121, 90],
  ]) {
    box([78, 2.8, length], [0, -1.5, z], index === 1 ? '#344b40' : dark);
    box([80, 0.5, length + 1], [0, -3, z], '#101e28');
    for (let x = -36; x <= 36; x += 12) {
      for (let offset = -length / 2; offset < length / 2; offset += 8) {
        const depth = Math.min(7.85, length / 2 - offset - 0.1);
        if (depth > 0)
          box([11.82, 0.12, depth], [x, -0.04, z + offset + depth / 2]).material =
            w.materials.get(deckKey);
      }
      for (let dz = -length / 2 + 2; dz < length / 2; dz += 8) {
        box([11.65, 0.025, 0.055], [x, 0.027, z + dz], dark);
        if (index === 0)
          for (const side of [-1, 1])
            box([0.12, 0.026, 0.4], [x + side * 5.3, 0.03, z + dz + 0.5], '#b6b5a0');
      }
    }
    for (const side of [-1, 1]) {
      box([0.2, 0.18, length], [side * 37, 0.08, z], c.color, 0.9);
      box([0.6, 1.1, length], [side * 39, 0.2, z], dark);
      for (let dz = -length / 2 + 4; dz < length / 2; dz += 8) {
        box([0.3, 2, 0.3], [side * 38.4, 0.5, z + dz], steel);
        box([0.22, 0.3, 1.1], [side * 38.2, 1.2, z + dz], c.color, 1.5);
      }
    }
  }
  for (let z = 30; z > -158; z -= 8)
    if (z > -62 || z < -78) {
      for (const x of [-5, 5]) box([0.08, 0.035, 3.5], [x, 0.04, z], c.color, 0.4);
      if (z > -60) box([1.4, 0.035, 0.2], [0, 0.04, z], '#b5c3b6');
    }
  // Large circular inlays form an arena that reads as a destination.
  for (const radius of [17, 23, 25])
    ring(radius, 0.07, [0, 0.07, -103], c.color, [Math.PI / 2, 0, 0], 0.6);
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    box([0.2, 0.06, 1.3], [Math.sin(a) * 24, 0.03, -103 + Math.cos(a) * 24], ivory, 0, a);
  }

  if (index === 0) {
    // Dock, service galleries and a suspended reactor define an industrial ship.
    for (const [x, z, width, length] of [
      [-44, 8, 12, 20],
      [44, -21, 12, 30],
      [-44, -91, 12, 35],
      [44, -146, 12, 28],
    ]) {
      box([width, 11, length], [x, 5.4, z], dark);
      box([width + 0.7, 0.6, length + 0.6], [x, 11, z], steel);
      for (let dz = -length / 2 + 2; dz < length / 2; dz += 3.8) {
        box([0.15, 5, 2.5], [x - Math.sign(x) * (width / 2 + 0.1), 5, z + dz], '#b9e3d2', 0.8);
        box([width + 0.1, 0.14, 0.2], [x, 9, z + dz], '#87978f');
      }
      // These rooms are outside the main path; matching collision prevents walking through walls.
      w.obstacles.push({ x, z, r: width / 2 + 1 });
    }
    for (const z of [24, -9, -42, -86, -123, -160]) {
      for (const s of [-1, 1]) {
        box([2, 18, 2], [s * 39, 8, z], steel);
        rod([s * 39, 17, z], [s * 24, 26, z], 0.8, steel);
        box([7, 0.4, 1], [s * 24, 24, z], '#f8bd82', 1.5);
        rod([s * 40, 13, z], [s * 40, 13, z - 22], 0.55, '#ac815c');
      }
      box([49, 1.2, 2], [0, 26, z], dark);
      box([42, 0.15, 0.3], [0, 25.3, z], c.color, 1.2);
    }
    for (let i = 0; i < 5; i++) {
      const x = -23 + i * 3;
      box([2.6, 2.8, 3.7], [x, 1.4, 28], '#a67e56');
      box([2.75, 0.2, 3.85], [x, 2.5, 28], dark);
      box([0.9, 0.7, 0.05], [x, 1.6, 30], ivory);
    }
    for (const z of [-11, -38])
      for (const s of [-1, 1]) {
        const x = s * 34;
        rod([x, 0, z], [x, 18, z], 0.9, '#9b795c');
        for (let y = 2; y < 18; y += 3) ring(1.1, 0.1, [x, y, z], steel, [Math.PI / 2, 0, 0]);
      }
    for (let i = 0; i < 4; i++)
      ring(17 - i * 0.8, 1.05, [-51, 23, -81 - i * 3], i % 2 ? dark : steel, [0, 0.25, 0]);
    ring(13, 0.28, [-51, 23, -78], c.color, [0, 0.25, 0], 2);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      rod(
        [-51 + Math.cos(a) * 12, 23 + Math.sin(a) * 12, -79],
        [-51 + Math.cos(a) * 17, 23 + Math.sin(a) * 17, -80],
        0.55,
        '#b29b78',
      );
    }
    cylinder(7, 25, [-52, 12, -85], dark);
    for (const [x, z] of [
      [-23, -4],
      [24, -27],
      [-22, -133],
      [24, -153],
    ]) {
      box([4, 1.6, 3], [x, 0.8, z], '#6e7e7b');
      box([4.2, 0.2, 3.2], [x, 1.7, z], dark);
      for (const dx of [-1.5, 1.5]) box([0.18, 1.6, 3.1], [x + dx, 0.8, z], '#b09b7f');
      for (let j = 0; j < 3; j++)
        box([1.3, 0.03, 0.16], [x - 3, 0.05, z + j * 0.4], '#caac70', 0, 0.6);
    }
    label('07 / MAINTENANCE', 0, 22.5, 24, 23);
    label('LIFE SUPPORT / 031', 0, 22.5, -86, 25);
    // Hazard stripes sit below the floating bridge.
    for (let x = -30; x < 32; x += 3) box([1.5, 0.05, 1], [x, 0.08, -61], '#dca568', 0, 0.4);
  } else if (index === 1) {
    // Glasshouse ribs, flowering trunks, climbing root arches and seed pools.
    for (const [x, z, r] of [
      [-31, -5, 12],
      [32, -35, 14],
      [-34, -112, 16],
      [33, -153, 13],
    ]) {
      cylinder(r, 0.65, [x, 0.1, z], '#344e42');
      for (let i = 0; i < 6; i++) {
        const arch = ring(r, 0.18, [x, 2, z], '#94af98', [0, (i * Math.PI) / 6, 0]);
        arch.scale.y = 1.5;
      }
      ring(r, 0.2, [x, 0.45, z], c.color, [Math.PI / 2, 0, 0], 0.6);
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4;
        const tx = x + Math.cos(a) * r * 0.6,
          tz = z + Math.sin(a) * r * 0.6;
        organicTree(tx, tz, 8 + i * 2);
      }
    }
    function organicTree(x, z, h) {
      rod([x, 0, z], [x + 1, h * 0.7, z], 0.6, '#6c7562');
      rod([x + 1, h * 0.7, z], [x - 1, h, z + 1], 0.32, '#829476');
      for (let i = 0; i < 4; i++) {
        const a = i * 2.4,
          y = h * 0.6 + i * 0.8;
        const tx = x + Math.cos(a) * 4,
          tz = z + Math.sin(a) * 4;
        rod([x, y - 2, z], [tx, y, tz], 0.18, '#9fa880');
        const leaf = w.mesh(
          'SphereGeometry',
          [1, 12, 6],
          i % 2 ? '#86aa7c' : '#557d6a',
          [tx, y, tz],
          group,
        );
        leaf.scale.set(3.2, 0.35, 1.8);
        leaf.rotation.set(0.2, a, 0.2);
        cylinder(0.35, 0.8, [tx, y + 0.6, tz], '#e4e7a9', 0.1, 1);
      }
    }
    for (const z of [16, -36, -88, -144]) {
      const arch = ring(26, 0.7, [0, -3, z], '#819078');
      arch.scale.y = 0.75;
      const light = ring(25.2, 0.07, [0, -3, z], c.color, [0, 0, 0], 0.7);
      light.scale.y = 0.75;
    }
    for (let i = 0; i < 26; i++) {
      const x = (i % 2 ? -1 : 1) * (28 + (i % 3) * 3),
        z = 28 - i * 7;
      for (let j = 0; j < 5; j++) {
        const leaf = w.mesh(
          'SphereGeometry',
          [1, 8, 4],
          j % 2 ? '#718f68' : '#add399',
          [x + Math.cos(j) * 1.2, 0.3, z + Math.sin(j) * 1.2],
          group,
        );
        leaf.scale.set(0.3, 1.4, 0.1);
        leaf.rotation.z = Math.sin(j) * 0.7;
      }
      cylinder(0.4, 0.4, [x, 0.25, z], '#eef3ab', 0.15, 1.2);
    }
    label('BIOSPHERE / SEED ARCHIVE', 0, 14, 16, 23);
  } else if (index === 2) {
    // A clockwork city: arcades, suspended houses, pendulums, engraved dials.
    for (const s of [-1, 1])
      for (let i = 0; i < 7; i++) {
        const x = s * 40,
          z = 20 - i * 29,
          h = 20 + (i % 3) * 8;
        box([12, h, 12], [x, h / 2, z], '#556a7c');
        box([14, 1, 14], [x, h, z], '#a6b8bf');
        cylinder(5, 3, [x, h + 2, z], '#536879', 1);
        for (let j = 0; j < 5; j++)
          for (const dx of [-3, 0, 3])
            box([1.1, 2, 0.1], [x + dx, 3 + j * 4, z + 6.1], j % 2 ? '#8ccce4' : '#c8dfe4', 0.5);
        rod([x, 0, z], [x, h + 6, z], 0.08, c.color, 1);
        ring(9, 0.4, [s * 32, 12, z + 12], '#a9b8bb', [0, Math.PI / 2, 0]);
      }
    for (const z of [8, -32, -87, -145])
      for (const s of [-1, 1]) {
        box([2, 15, 2], [s * 28, 7.5, z], '#879ba7');
        box([6, 1, 4], [s * 28, 15, z], '#b8c5c6');
        const arc = ring(28, 0.65, [0, 14, z], '#879ba7');
        arc.scale.y = 0.3;
        rod([s * 16, 20, z], [s * 16, 9, z], 0.09, '#dbc69e');
        const pendulum = w.mesh('OctahedronGeometry', [1, 0], '#d3bf9a', [s * 16, 8, z], group);
        pendulum.scale.set(1, 2, 1);
      }
    for (const z of [-18, -48, -135]) {
      ring(7, 0.12, [0, 0.09, z], '#c8cbad', [Math.PI / 2, 0, 0], 0.2);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        box([0.2, 0.05, 1.4], [Math.sin(a) * 6, 0.09, z + Math.cos(a) * 6], '#c8cbad', 0, a);
      }
    }
    for (let i = 0; i < 3; i++)
      ring(
        28 + i * 3,
        0.45,
        [0, 23, -169],
        i % 2 ? c.color : '#bbbfaf',
        [0, 0.15 * i, 0],
        i % 2 ? 0.7 : 0,
      );
    label('MERIDIAN / 00:00:01', 0, 19, 8, 22);
  } else {
    // A broken observatory, with monoliths and an immense celestial orrery.
    for (const s of [-1, 1])
      for (let i = 0; i < 8; i++) {
        const x = s * (33 + (i % 2) * 8),
          z = 24 - i * 25,
          h = 12 + (i % 3) * 7;
        box([4, h, 4], [x, h / 2, z], '#5a576b', 0, 0.25);
        box([4.2, 0.25, 4.2], [x, h * 0.72, z], '#f6cf98', 1, 0.25);
        const top = w.mesh('OctahedronGeometry', [1, 0], '#d3c4ad', [x, h + 2, z], group);
        top.scale.set(2, 3, 2);
        rod([x, 1, z], [x, h - 1, z], 0.08, c.color, 1);
        for (let j = 0; j < 3; j++)
          box([7 - j, 1.4, 7 - j], [x, -2 - j * 3, z], '#403e53', 0, j * 0.4);
      }
    for (const z of [16, -40, -94, -151]) {
      const arch = ring(29, 0.35, [0, 1, z], '#bbaa8f');
      arch.scale.y = 0.85;
      for (let i = 0; i < 5; i++) {
        const a = ((i + 1) * Math.PI) / 6;
        const p = [Math.cos(a) * 29, 1 + Math.sin(a) * 24.65, z];
        cylinder(0.6, 1, p, c.color, 0.6, 1.5);
      }
    }
    for (let i = 0; i < 5; i++)
      ring(
        34 + i * 3,
        0.28,
        [0, 31, -182],
        i % 2 ? '#ab968d' : c.color,
        [i * 0.23, i * 0.4, 0.35 * i],
        i % 2 ? 0 : 0.9,
      );
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4;
      rod(
        [Math.cos(a) * 30, 20 + Math.sin(a) * 15, -180],
        [Math.cos(a + 2.4) * 30, 20 + Math.sin(a + 2.4) * 15, -180],
        0.045,
        c.color,
        0.6,
      );
    }
    label('WITNESS / ORIGIN UNKNOWN', 0, 20, 16, 24);
  }
  group.updateMatrixWorld(true);
  const batches = new Map();
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (mesh.userData.shotObstacle) w.shotObstacles.push(mesh);
    const key = mesh.geometry.uuid + '/' + mesh.material.uuid;
    if (!batches.has(key))
      batches.set(key, { geometry: mesh.geometry, material: mesh.material, matrices: [] });
    batches.get(key).matrices.push(mesh.matrixWorld.clone());
  });
  for (const batch of batches.values()) {
    const mesh = new T.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    w.root.add(mesh);
  }
  w.environmentStats = {
    instances: [...batches.values()].reduce((n, b) => n + b.matrices.length, 0),
    batches: batches.size,
  };
}

import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { robotMaterials } from './robot-materials.js';

const UP = new T.Vector3(0, 1, 0);
export function makeRobot(world, color = '#c1c4b8', scale = 1) {
  const root = new T.Group();
  root.name = 'WITNESS-07';
  root.scale.setScalar(scale);
  const r = {
    arms: [],
    elbows: [],
    hands: [],
    legs: [],
    knees: [],
    feet: [],
    thrusters: [],
    actuators: [],
    footState: [],
    lastTime: null,
  };
  root.userData.rig = r;
  const mat = robotMaterials(world, color);
  root.userData.skinMaterials = mat;
  root.userData.skinId = typeof color === 'object' ? color.id : null;
  let serial = 0;
  const node = (parent, x = 0, y = 0, z = 0, name = 'joint') => {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.name = name + '-' + serial++;
    parent.add(g);
    return g;
  };
  const mesh = (geometry, material, parent, p) => {
    const m = new T.Mesh(geometry, material);
    m.position.set(...p);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const block = (size, p, material, parent, bevel = 0.018) =>
    mesh(
      world.geo('RoundedBoxGeometry', [...size, 2, Math.min(bevel, Math.min(...size) / 4)]),
      material,
      parent,
      p,
    );
  const cylinder = (radius, length, p, material, parent, axis = 'y', segments = 16) => {
    const m = mesh(
      world.geo('CylinderGeometry', [radius, radius, length, segments]),
      material,
      parent,
      p,
    );
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    return m;
  };
  const ring = (radius, tube, p, material, parent, axis = 'z') => {
    const m = mesh(world.geo('TorusGeometry', [radius, tube, 6, 24]), material, parent, p);
    if (axis === 'x') m.rotation.y = Math.PI / 2;
    if (axis === 'y') m.rotation.x = Math.PI / 2;
    return m;
  };
  const cable = (points, radius, parent) => {
    const key = 'robot-cable-' + JSON.stringify(points) + '-' + radius;
    if (!world.geometries.has(key)) {
      const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
      world.geometries.set(key, new T.TubeGeometry(curve, 12, radius, 5, false));
    }
    return mesh(world.geometries.get(key), mat.rubber, parent, [0, 0, 0]);
  };
  const bolt = (x, y, z, parent, axis = 'z') =>
    cylinder(0.027, 0.025, [x, y, z], mat.steel, parent, axis, 6);
  const bearing = (parent, p, radius = 0.13, length = 0.24) => {
    cylinder(radius, length, p, mat.black, parent, 'x');
    for (const s of [-1, 1]) {
      const x = p[0] + s * (length / 2 + 0.01);
      cylinder(radius * 0.83, 0.028, [x, p[1], p[2]], mat.edge, parent, 'x');
      cylinder(radius * 0.45, 0.034, [x + s * 0.02, p[1], p[2]], mat.steel, parent, 'x', 12);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        bolt(
          x + s * 0.02,
          p[1] + Math.sin(a) * radius * 0.64,
          p[2] + Math.cos(a) * radius * 0.64,
          parent,
          'x',
        );
      }
    }
  };
  const plate = (width, height, depth, p, material, parent, taper = 0.12) => {
    const key = `robot-plate-${width}-${height}-${depth}-${taper}`;
    if (!world.geometries.has(key)) {
      const shape = new T.Shape();
      shape.moveTo(-width / 2 + taper, -height / 2);
      shape.lineTo(width / 2 - taper, -height / 2);
      shape.lineTo(width / 2, -height / 2 + taper);
      shape.lineTo(width / 2, height / 2 - taper);
      shape.lineTo(width / 2 - taper, height / 2);
      shape.lineTo(-width / 2 + taper, height / 2);
      shape.lineTo(-width / 2, height / 2 - taper);
      shape.lineTo(-width / 2, -height / 2 + taper);
      shape.closePath();
      const geo = new T.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.012,
        bevelSegments: 1,
        steps: 1,
      });
      geo.translate(0, 0, -depth / 2);
      world.geometries.set(key, geo);
    }
    return mesh(world.geometries.get(key), material, parent, p);
  };
  r.body = node(root, 0, 0, 0, 'torso');
  r.hips = node(root, 0, 1.45, 0, 'pelvis');
  // Structural spine, floating chest plates and a serviceable waist.
  block([0.54, 0.2, 0.36], [0, 0, 0], mat.black, r.hips);
  bearing(r.hips, [0, 0, 0], 0.16, 0.66);
  cylinder(0.15, 0.52, [0, 1.69, 0.025], mat.steel, r.body);
  for (let y = 1.51; y < 1.94; y += 0.065)
    ring(0.158, 0.018, [0, y, 0.025], mat.rubber, r.body, 'y');
  for (const s of [-1, 1]) {
    cylinder(0.045, 0.42, [s * 0.22, 1.74, 0.08], mat.edge, r.body);
    cylinder(0.065, 0.22, [s * 0.22, 1.63, 0.08], mat.black, r.body);
    const flank = plate(0.19, 0.43, 0.06, [s * 0.26, 1.76, -0.05], mat.paint, r.body, 0.05);
    flank.rotation.y = s * 0.35;
  }
  block([0.7, 0.57, 0.42], [0, 2.14, 0.035], mat.black, r.body);
  const chest = plate(0.83, 0.56, 0.12, [0, 2.18, -0.23], mat.paint, r.body, 0.12);
  chest.rotation.x = -0.09;
  plate(0.53, 0.19, 0.045, [0, 1.91, -0.2], mat.steel, r.body, 0.05);
  for (const s of [-1, 1]) {
    const collar = plate(0.38, 0.13, 0.08, [s * 0.24, 2.47, -0.14], mat.paint, r.body, 0.045);
    collar.rotation.z = s * -0.15;
    for (const y of [2, 2.36]) bolt(s * 0.29, y, -0.307, r.body);
    for (let j = 0; j < 4; j++)
      block([0.17, 0.023, 0.028], [s * 0.25, 2.1 + j * 0.05, -0.304], mat.black, r.body, 0.005);
  }
  plate(0.19, 0.25, 0.025, [0, 2.21, -0.308], mat.black, r.body, 0.03);
  cylinder(0.06, 0.04, [0, 2.25, -0.337], mat.glass, r.body, 'z');
  ring(0.065, 0.012, [0, 2.25, -0.365], mat.edge, r.body);
  block([0.08, 0.014, 0.02], [0, 2.09, -0.339], mat.led, r.body, 0.004);
  for (const s of [-1, 1])
    block([0.065, 0.28, 0.025], [s * 0.35, 2.2, -0.31], mat.accent, r.body, 0.005);
  // Backpack carries batteries, radiator and two vectoring micro-thrusters.
  plate(0.59, 0.65, 0.18, [0, 2.1, 0.36], mat.steel, r.body, 0.065);
  for (let j = 0; j < 8; j++)
    block([0.43, 0.026, 0.035], [0, 1.85 + j * 0.06, 0.474], mat.black, r.body, 0.004);
  for (const s of [-1, 1]) {
    cylinder(0.09, 0.48, [s * 0.36, 2.1, 0.29], mat.black, r.body);
    cylinder(0.094, 0.065, [s * 0.36, 2.35, 0.29], mat.copper, r.body);
    cable(
      [
        [s * 0.35, 2.3, 0.28],
        [s * 0.5, 2.42, 0.15],
        [s * 0.6, 2.3, 0],
      ],
      0.021,
      r.body,
    );
    const jet = node(r.body, s * 0.27, 1.75, 0.38, 'thruster');
    cylinder(0.082, 0.16, [0, 0, 0], mat.black, jet);
    ring(0.071, 0.014, [0, -0.09, 0], mat.edge, jet, 'y');
    const flame = mesh(world.geo('ConeGeometry', [0.045, 0.2, 12]), mat.led, jet, [0, -0.18, 0]);
    flame.rotation.z = Math.PI;
    flame.userData.dynamic = true;
    r.thrusters.push(flame);
  }
  for (const s of [-1, 1]) {
    block([0.12, 0.48, 0.06], [s * 0.28, 2.1, 0.48], mat.paint, r.body);
    block([0.125, 0.07, 0.065], [s * 0.28, 2.25, 0.49], mat.accent, r.body);
  }
  // A compact optical head has lenses, a thermal strip and a gimbal neck.
  cylinder(0.09, 0.16, [0, 2.55, 0], mat.steel, r.body);
  bearing(r.body, [0, 2.61, 0], 0.095, 0.23);
  r.head = node(r.body, 0, 2.75, -0.015, 'sensor-head');
  plate(0.48, 0.35, 0.37, [0, 0, 0.015], mat.paint, r.head, 0.065);
  plate(0.42, 0.18, 0.048, [0, -0.01, -0.213], mat.black, r.head, 0.035);
  block([0.32, 0.11, 0.028], [0, -0.015, -0.247], mat.glass, r.head, 0.02);
  for (const [x, radius] of [
    [-0.103, 0.052],
    [0.043, 0.031],
    [0.13, 0.022],
  ]) {
    cylinder(radius, 0.028, [x, -0.013, -0.275], mat.glass, r.head, 'z');
    ring(radius, 0.009, [x, -0.013, -0.291], mat.edge, r.head);
    cylinder(radius * 0.3, 0.007, [x, -0.013, -0.294], mat.led, r.head, 'z');
  }
  block([0.2, 0.013, 0.01], [0, 0.104, -0.198], mat.amber, r.head, 0.003);
  for (const s of [-1, 1]) {
    cylinder(0.075, 0.05, [s * 0.266, 0, 0], mat.black, r.head, 'x');
    cylinder(0.055, 0.054, [s * 0.272, 0, 0], mat.steel, r.head, 'x');
    bolt(s * 0.16, 0.11, -0.189, r.head);
  }
  cylinder(0.035, 0.035, [0.12, 0.21, 0.035], mat.black, r.head);
  cylinder(0.022, 0.035, [0.12, 0.24, 0.035], mat.glass, r.head);
  // Each arm exposes the reduction drive, elbow spindle, wrist and gripper.
  for (const s of [-1, 1]) {
    const arm = node(r.body, s * 0.57, 2.32, 0.02, 'shoulder');
    r.arms.push(arm);
    bearing(arm, [0, 0, 0], 0.155, 0.25);
    plate(0.28, 0.24, 0.3, [s * 0.035, 0.045, 0.01], mat.accent, arm, 0.055);
    cylinder(0.06, 0.42, [0, -0.28, 0], mat.steel, arm);
    plate(0.19, 0.36, 0.08, [0, -0.27, -0.11], mat.paint, arm, 0.04);
    cable(
      [
        [s * 0.07, -0.08, 0.11],
        [s * 0.14, -0.33, 0.12],
        [s * 0.08, -0.53, 0.05],
      ],
      0.018,
      arm,
    );
    const elbow = node(arm, 0, -0.53, 0, 'elbow');
    r.elbows.push(elbow);
    bearing(elbow, [0, 0, 0], 0.115, 0.26);
    block([0.17, 0.37, 0.18], [0, -0.27, 0.025], mat.black, elbow);
    plate(0.22, 0.33, 0.06, [0, -0.25, -0.09], mat.paint, elbow, 0.045);
    cylinder(0.027, 0.32, [s * 0.095, -0.23, 0.02], mat.edge, elbow);
    cylinder(0.044, 0.15, [s * 0.095, -0.33, 0.02], mat.steel, elbow);
    cylinder(0.07, 0.1, [0, -0.49, 0], mat.steel, elbow);
    const hand = node(elbow, 0, -0.57, 0, 'wrist');
    r.hands.push(hand);
    block([0.18, 0.2, 0.12], [0, -0.05, 0], mat.black, hand);
    for (let finger = 0; finger < 3; finger++) {
      const x = -0.06 + finger * 0.06;
      cylinder(0.026, 0.034, [x, -0.16, 0], mat.steel, hand, 'x');
      block([0.038, 0.11, 0.046], [x, -0.21, -0.009], mat.edge, hand, 0.007);
      block([0.038, 0.07, 0.045], [x, -0.29, -0.028], mat.rubber, hand, 0.006);
    }
    block([0.045, 0.15, 0.045], [s * 0.12, -0.08, -0.02], mat.steel, hand).rotation.z = s * -0.4;
    // Full leg chain: yaw bearing, thigh, knee, shin, ankle and articulated foot.
    const thigh = node(r.hips, s * 0.235, 0, 0, 'hip');
    r.legs.push(thigh);
    bearing(thigh, [0, 0, 0], 0.13, 0.24);
    cylinder(0.065, 0.48, [0, -0.31, 0], mat.black, thigh);
    plate(0.25, 0.46, 0.12, [0, -0.3, -0.09], mat.paint, thigh, 0.055);
    for (const side of [-1, 1]) cylinder(0.028, 0.41, [side * 0.1, -0.3, 0.05], mat.edge, thigh);
    const knee = node(thigh, 0, -0.65, 0, 'knee');
    r.knees.push(knee);
    bearing(knee, [0, 0, 0], 0.135, 0.3);
    plate(0.24, 0.19, 0.08, [0, 0.015, -0.15], mat.accent, knee, 0.05);
    block([0.14, 0.48, 0.14], [0, -0.31, 0.055], mat.black, knee);
    plate(0.21, 0.43, 0.065, [0, -0.32, -0.063], mat.paint, knee, 0.04);
    cylinder(0.033, 0.43, [s * 0.1, -0.28, 0.065], mat.edge, knee);
    cylinder(0.047, 0.23, [s * 0.1, -0.41, 0.065], mat.steel, knee);
    cable(
      [
        [0, -0.08, 0.15],
        [0, -0.3, 0.18],
        [0, -0.56, 0.08],
      ],
      0.021,
      knee,
    );
    const foot = node(knee, 0, -0.65, 0, 'ankle');
    r.feet.push(foot);
    bearing(foot, [0, 0, 0], 0.084, 0.19);
    block([0.25, 0.1, 0.43], [0, -0.073, -0.065], mat.black, foot, 0.022);
    plate(0.25, 0.105, 0.27, [0, -0.045, -0.1], mat.paint, foot, 0.025).rotation.x = Math.PI / 2;
    block([0.28, 0.045, 0.46], [0, -0.132, -0.07], mat.rubber, foot, 0.014);
    for (let j = 0; j < 5; j++)
      block([0.275, 0.017, 0.024], [0, -0.156, -0.24 + j * 0.08], mat.black, foot, 0.003);
    r.footState.push({
      anchor: new T.Vector3(),
      start: new T.Vector3(),
      target: new T.Vector3(),
      phase: s < 0 ? 0 : 0.5,
      planted: true,
    });
    // A knee actuator bridges two moving bones, so it is updated after posing.
    const casing = mesh(
      world.geo('CylinderGeometry', [0.035, 0.035, 1, 12]),
      mat.black,
      root,
      [0, 0, 0],
    );
    casing.userData.dynamic = true;
    const rod = mesh(
      world.geo('CylinderGeometry', [0.019, 0.019, 1, 12]),
      mat.edge,
      root,
      [0, 0, 0],
    );
    rod.userData.dynamic = true;
    r.actuators.push({
      a: thigh,
      b: knee,
      from: new T.Vector3(s * 0.12, -0.19, 0.1),
      to: new T.Vector3(s * 0.12, -0.29, 0.12),
      casing,
      rod,
    });
  }
  r.gun = node(r.elbows[1], 0.02, -0.26, -0.16, 'pulse-tool');
  r.gun.rotation.x = -Math.PI / 2;
  block([0.16, 0.15, 0.44], [0, 0, -0.08], mat.black, r.gun);
  plate(0.18, 0.13, 0.24, [0, 0.04, -0.03], mat.paint, r.gun, 0.025);
  cylinder(0.047, 0.31, [0, 0, -0.34], mat.steel, r.gun, 'z');
  ring(0.05, 0.012, [0, 0, -0.5], mat.copper, r.gun);
  r.muzzle = node(r.gun, 0, 0, -0.55, 'muzzle');
  mesh(world.geo('SphereGeometry', [0.09, 8, 6]), mat.led, r.muzzle, [0, 0, 0]);
  r.muzzle.visible = false;
  r.blade = node(r.elbows[0], 0, -0.3, -0.18, 'cutting-blade');
  r.blade.rotation.x = -Math.PI / 2;
  const blade = plate(0.08, 1.15, 0.025, [0, 0, -0.5], mat.edge, r.blade, 0.02);
  blade.rotation.x = Math.PI / 2;
  block([0.008, 0.02, 1.05], [-0.046, 0, -0.5], mat.led, r.blade, 0.003);
  r.blade.visible = false;
  // Identification is a real texture on the chest, not a HUD label.
  const labelKey = 'robot-identification';
  if (!world.materials.has(labelKey)) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c5c5b5';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#253238';
    ctx.font = 'bold 66px monospace';
    ctx.fillText('07', 15, 69);
    ctx.font = '14px monospace';
    ctx.fillText('WITNESS / EVA', 13, 98);
    for (let x = 153; x < 242; x += 5) ctx.fillRect(x, 24, 2, 65);
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace;
    world.textures.set(labelKey, tex);
    world.materials.set(
      labelKey,
      new T.MeshStandardMaterial({ map: tex, roughness: 0.65, metalness: 0.25 }),
    );
  }
  mesh(
    world.geo('PlaneGeometry', [0.18, 0.09]),
    world.materials.get(labelKey),
    r.body,
    [-0.225, 2.3, -0.32],
  ).rotation.y = Math.PI;
  // Merge rigid pieces within each bone. Kinematic bones and toggled effects
  // remain separate; repeated robots share the cached merged geometries.
  function bake(parent) {
    for (const child of [...parent.children]) if (child.isGroup) bake(child);
    const groups = new Map();
    for (const child of [...parent.children])
      if (child.isMesh && !child.userData.dynamic) {
        const key = child.material.uuid;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(child);
      }
    for (const [materialKey, children] of groups) {
      if (children.length < 2) continue;
      const key = `robot-rigid-v3-${parent.name}-${materialKey}`;
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
      children.forEach((child) => parent.remove(child));
      parent.add(merged);
    }
  }
  bake(root);
  r.lastPosition = root.position.clone();
  r.velocity = new T.Vector3();
  r.initialized = false;
  r.stepEvents = 0;
  return root;
}

export function updateActuators(robot) {
  robot.updateMatrixWorld(true);
  const rootInverse = new T.Matrix4().copy(robot.matrixWorld).invert();
  for (const link of robot.userData.rig.actuators) {
    const a = link.from.clone().applyMatrix4(link.a.matrixWorld).applyMatrix4(rootInverse),
      b = link.to.clone().applyMatrix4(link.b.matrixWorld).applyMatrix4(rootInverse);
    const delta = b.clone().sub(a),
      length = delta.length(),
      direction = delta.normalize();
    for (const [mesh, start, fraction] of [
      [link.casing, 0, 0.58],
      [link.rod, 0.38, 0.62],
    ]) {
      mesh.position.copy(a).addScaledVector(direction, length * (start + fraction / 2));
      mesh.scale.y = length * fraction;
      mesh.quaternion.setFromUnitVectors(UP, direction);
    }
  }
}

// Swap references on this robot only: shared NPC/enemy materials stay untouched.
export function applyRobotSkin(world, robot, skin) {
  const previous = robot.userData.skinMaterials,
    next = robotMaterials(world, skin);
  robot.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const channel of ['paint', 'accent', 'led'])
      if (mesh.material === previous[channel]) {
        mesh.material = next[channel];
        break;
      }
  });
  robot.userData.skinMaterials = next;
  robot.userData.skinId = skin.id;
}

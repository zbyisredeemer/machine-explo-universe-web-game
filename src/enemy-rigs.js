import * as T from 'three';
import { mechanicalParts } from './mechanical-parts.js';
import { enemyPalette, decorateEnemy } from './enemy-styles.js';
import { solveLeg } from './robot-motion.js';
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const UP = V(0, 1, 0);

export function createMechanicalEnemy(w, type, x, z, index, boss, c) {
  const root = new T.Group();
  root.name = `enemy-${type}-${index}`;
  root.position.set(x, 0, z);
  const palette = enemyPalette(index, type, boss),
    p = mechanicalParts(w, root, palette, root.name),
    { m } = p;
  const r = root.userData;
  r.arms = [];
  r.legs = [];
  r.limbs = [];
  r.vents = [];
  r.tools = [];
  r.recoils = [];
  r.muzzles = [];
  r.pistons = [];
  r.initialized = false;
  const hot = w.mat('#ff966e', 1.1),
    tint = w.mat(palette.light, 0.65);
  function leg(x, z, scale, phase) {
    const hip = p.node(root, [x, scale * 1.95, z], 'hip');
    p.joint([0, 0, 0], scale * 0.18, scale * 0.42, hip);
    const L = scale * 1.07;
    p.box([scale * 0.3, L * 0.7, scale * 0.3], [0, -L * 0.5, 0], m.black, hip);
    p.box([scale * 0.47, L * 0.64, scale * 0.18], [0, -L * 0.45, -scale * 0.18], m.paint, hip);
    for (const s of [-1, 1])
      p.rod(
        [s * scale * 0.15, -scale * 0.13, scale * 0.1],
        [s * scale * 0.15, -L * 0.9, scale * 0.1],
        scale * 0.035,
        m.edge,
        hip,
      );
    const knee = p.node(hip, [0, -L, 0], 'knee');
    p.joint([0, 0, 0], scale * 0.16, scale * 0.46, knee);
    p.box([scale * 0.28, L * 0.8, scale * 0.24], [0, -L * 0.5, 0], m.black, knee);
    const shin = p.box(
      [scale * 0.4, L * 0.62, scale * 0.16],
      [0, -L * 0.47, -scale * 0.16],
      m.paint,
      knee,
    );
    shin.rotation.x = -0.06;
    p.cable(
      [
        [0, -scale * 0.2, scale * 0.18],
        [0, -L * 0.5, scale * 0.24],
        [0, -L * 0.8, scale * 0.13],
      ],
      scale * 0.03,
      knee,
    );
    const foot = p.node(knee, [0, -L, 0], 'foot');
    p.joint([0, 0, 0], scale * 0.105, scale * 0.32, foot);
    p.box(
      [scale * 0.57, scale * 0.16, scale * 0.82],
      [0, -scale * 0.07, -scale * 0.14],
      m.steel,
      foot,
    );
    p.box(
      [scale * 0.59, scale * 0.055, scale * 0.86],
      [0, -scale * 0.174, -scale * 0.14],
      m.rubber,
      foot,
    );
    for (let i = 0; i < 4; i++)
      p.box(
        [scale * 0.58, scale * 0.025, scale * 0.05],
        [0, -scale * 0.212, -scale * 0.43 + i * scale * 0.18],
        m.black,
        foot,
      );
    const casing = p.cylinder(0.04 * scale, 1, [0, 0, 0], m.black, root),
      rod = p.cylinder(0.021 * scale, 1, [0, 0, 0], m.edge, root);
    casing.userData.dynamic = rod.userData.dynamic = true;
    r.pistons.push({
      a: hip,
      b: knee,
      from: V(scale * 0.24, -scale * 0.26, scale * 0.11),
      to: V(scale * 0.24, -scale * 0.35, scale * 0.16),
      casing,
      rod,
    });
    r.legs.push(hip);
    r.limbs.push({
      hip,
      knee,
      foot,
      L,
      scale,
      rest: V(x + Math.sign(x) * scale * 0.25, scale * 0.24, z + Math.sign(z) * scale * 0.25),
      phase,
      planted: true,
      anchor: V(),
      start: V(),
      target: V(),
    });
  }
  if (boss) {
    r.body = p.node(root, [0, 3.4, 0], 'chassis');
    p.box([3.7, 0.55, 3.1], [0, -0.85, 0.1], m.black, r.body);
    for (const s of [-1, 1]) {
      p.rod([s * 1.5, -0.7, -1.15], [s * 1.5, 0.95, 1], 0.12, m.edge, r.body);
      p.box([0.26, 0.3, 2.9], [s * 1.8, -0.55, 0], m.steel, r.body);
      for (const z of [-1.35, 1.35]) leg(s * 1.55, z, 1.2, s < 0 === z < 0 ? 0 : 0.5);
    }
    if (index === 0) {
      // Reactor chassis: bolted pressure vessel, radiator doors and a furnace core.
      p.cylinder(1.05, 2.35, [0, 0.25, 0.05], m.black, r.body, 'z');
      p.ring(1.09, 0.15, [0, 0.25, -1.23], m.steel, r.body);
      p.cylinder(0.78, 0.1, [0, 0.25, -1.23], hot, r.body, 'z');
      p.ring(0.52, 0.035, [0, 0.25, -1.32], m.copper, r.body);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        p.bolt([Math.cos(a) * 1.1, 0.25 + Math.sin(a) * 1.1, -1.4], r.body, 0.065);
      }
      for (const s of [-1, 1]) {
        const vent = p.node(r.body, [s * 0.67, 0.25, -1.45], 'reactor-shutter');
        p.box([1.15, 1.76, 0.15], [0, 0, 0], m.paint, vent);
        p.vents([0, 0, -0.11], 0.84, 1.28, 8, vent);
        r.vents.push({ mesh: vent, side: s, kind: 'door' });
        p.cylinder(0.24, 2.35, [s * 1.2, 0.4, 0.5], m.steel, r.body);
        p.cylinder(0.27, 0.2, [s * 1.2, 1.65, 0.5], m.black, r.body);
        p.cable(
          [
            [s * 0.8, -0.6, 1],
            [s * 1.4, 0.15, 1.25],
            [s * 0.9, 1.1, 1],
          ],
          0.075,
          r.body,
        );
      }
      p.box([1.8, 0.25, 1.3], [0, 1.53, 0.2], m.accent, r.body);
      for (let i = 0; i < 5; i++)
        p.box([0.035, 0.035, 0.8], [-0.6 + i * 0.3, 1.68, 0.2], m.black, r.body);
    } else if (index === 1) {
      p.cylinder(0.86, 2.4, [0, 0.4, 0], m.black, r.body);
      p.ring(0.95, 0.13, [0, 1.6, 0], m.accent, r.body, 'y');
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3,
          x = Math.sin(a) * 1.05,
          z = Math.cos(a) * 1.05;
        p.cylinder(0.2, 1.65, [x, 0.3, z], m.glass, r.body);
        p.cylinder(0.12, 1.55, [x, 0.3, z], tint, r.body);
        for (const y of [-0.57, 1.17]) p.cylinder(0.25, 0.12, [x, y, z], m.steel, r.body);
        const petal = p.node(r.body, [Math.sin(a) * 0.8, 1.3, Math.cos(a) * 0.8], 'radiator-leaf');
        petal.rotation.y = a;
        petal.rotation.x = 0.6;
        p.box([0.7, 1.8, 0.09], [0, 0.7, 0.15], m.paint, petal);
        for (let n = 0; n < 6; n++)
          p.box([0.6, 0.022, 0.035], [0, 0.13 + n * 0.21, 0.21], m.steel, petal);
        r.vents.push({ mesh: petal, kind: 'leaf', side: 1 });
        p.cable(
          [
            [x, -0.5, z],
            [x * 1.2, -0.1, z * 1.2],
            [x, 1, z],
          ],
          0.045,
          r.body,
        );
      }
      p.ring(0.55, 0.12, [0, 0.2, -1.25], m.edge, r.body);
      p.cylinder(0.4, 0.1, [0, 0.2, -1.3], hot, r.body, 'z');
    } else if (index === 2) {
      p.box([2.15, 2.8, 1.5], [0, 0.3, 0], m.paint, r.body);
      p.ring(1.14, 0.14, [0, 0.6, -0.86], m.accent, r.body);
      p.cylinder(1, 0.08, [0, 0.6, -0.88], m.black, r.body, 'z');
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        p.box(
          [0.045, 0.17, 0.04],
          [Math.sin(a) * 0.85, 0.6 + Math.cos(a) * 0.85, -0.96],
          tint,
          r.body,
        ).rotation.z = -a;
      }
      const hands = p.node(r.body, [0, 0.6, -1], 'dial');
      p.box([0.045, 0.76, 0.04], [0, 0.33, 0], m.edge, hands);
      p.box([0.43, 0.05, 0.04], [0.19, 0, -0.02], m.copper, hands);
      r.tools.push({ mesh: hands, speed: 0.15, axis: 'z' });
      for (const s of [-1, 1]) {
        const radiator = p.node(r.body, [s * 1.17, 0.2, 0.12], 'time-radiator');
        p.box([0.24, 2.4, 1.7], [0, 0, 0], m.steel, radiator);
        for (let i = 0; i < 9; i++)
          p.box([0.35, 0.03, 1.5], [s * 0.15, -0.95 + i * 0.24, 0], m.black, radiator);
        r.vents.push({ mesh: radiator, side: s, kind: 'door' });
      }
      p.box([1.55, 0.3, 1.35], [0, 1.9, 0], m.black, r.body);
    } else {
      p.box([1.25, 2.5, 1.3], [0, 0.3, 0], m.black, r.body);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        const segment = p.node(r.body, [Math.cos(a) * 1.1, 0.35, Math.sin(a) * 1.1], 'phase-fin');
        segment.rotation.y = -a;
        p.box([0.18, 2.7, 0.95], [0, 0, 0], m.paint, segment);
        p.box([0.035, 2.3, 0.7], [-0.11, 0, 0], m.edge, segment);
        r.vents.push({ mesh: segment, side: i % 2 ? 1 : -1, kind: 'leaf' });
      }
      p.cylinder(0.66, 0.12, [0, 0.2, -0.8], hot, r.body, 'z');
      p.ring(0.76, 0.075, [0, 0.2, -0.92], m.accent, r.body);
      const inner = p.node(r.body, [0, 0.3, 0], 'gyro');
      for (let i = 0; i < 3; i++) {
        const orbit = p.ring(1.6 + i * 0.2, 0.045, [0, 0, 0], tint, inner);
        orbit.rotation.set(i * 0.65, i * 0.8, 0);
      }
      r.tools.push({ mesh: inner, speed: 0.22, axis: 'y' });
    }
    // Shared sensor mast and two removable tools retain their gameplay identity.
    const head = p.node(r.body, [0, 1.65, -0.65], 'sensor');
    p.box([0.87, 0.43, 0.61], [0, 0, 0], m.black, head);
    p.box([1, 0.16, 0.7], [0, 0.25, 0], m.paint, head);
    for (const sx of [-0.27, 0, 0.27]) {
      p.cylinder(0.09, 0.06, [sx, 0, -0.35], m.glass, head, 'z');
      p.ring(0.1, 0.025, [sx, 0, -0.39], m.edge, head);
      p.cylinder(0.035, 0.07, [sx, 0, -0.38], hot, head, 'z');
    }
    for (const s of [-1, 1]) {
      const arm = p.node(root, [s * 2.04, 3.9, -0.15], 'tool-mount');
      r.arms.push(arm);
      p.joint([0, 0, 0], 0.29, 0.58, arm);
      p.box([0.3, 1.1, 0.36], [0, -0.55, 0], m.black, arm);
      p.box([0.62, 0.65, 0.48], [0, -0.57, -0.03], m.paint, arm);
      p.cable(
        [
          [s * 0.23, 0.1, 0.15],
          [s * 0.37, -0.6, 0.22],
          [s * 0.2, -1.2, 0.05],
        ],
        0.065,
        arm,
      );
      p.joint([0, -1.1, 0], 0.24, 0.6, arm);
      if (s < 0) {
        const cutter = p.node(arm, [0, -1.55, -0.12], 'cutter');
        p.ring(0.63, 0.08, [0, 0, 0], m.edge, cutter, 'x');
        p.cylinder(0.3, 0.3, [0, 0, 0], m.black, cutter, 'x');
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8;
          const tooth = p.box(
            [0.2, 0.13, 0.17],
            [0, Math.sin(a) * 0.68, Math.cos(a) * 0.68],
            m.copper,
            cutter,
          );
          tooth.rotation.x = -a;
        }
        r.tools.push({ mesh: cutter, speed: 4, axis: 'x' });
      } else {
        const recoil = p.node(arm, [0, -1.3, -0.15], 'cannon');
        p.box([0.78, 0.72, 0.8], [0, 0, 0], m.paint, recoil);
        r.recoils.push(recoil);
        for (const sx of [-0.22, 0.22]) {
          p.cylinder(0.115, 1.55, [sx, 0, -0.9], m.steel, recoil, 'z');
          for (const z of [-0.35, -0.65, -0.95]) p.ring(0.14, 0.025, [sx, 0, z], m.black, recoil);
          p.cylinder(0.09, 0.04, [sx, 0, -1.7], hot, recoil, 'z');
          r.muzzles.push(p.node(recoil, [sx, 0, -1.76], 'muzzle'));
        }
      }
    }
    r.halo = p.node(root, [0, 3.9, 1.4], 'rear-rotor');
    p.ring(2.05, 0.085, [0, 0, 0], m.steel, r.halo);
    p.ring(1.85, 0.025, [0, 0, 0], tint, r.halo);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      p.rod(
        [Math.cos(a) * 1.8, Math.sin(a) * 1.8, 0],
        [Math.cos(a) * 2.08, Math.sin(a) * 2.08, 0],
        0.06,
        m.copper,
        r.halo,
      );
    }
    for (const s of [-1, 1]) p.rod([s * 1.5, 2.9, 0.6], [s * 1.5, 4.7, 1.4], 0.1, m.black, root);
  } else if (type === 'cutter') {
    r.body = p.node(root, [0, 1.06, 0], 'cutter-body');
    p.box([1.18, 0.45, 1.36], [0, 0, 0], m.black, r.body);
    p.box([1.36, 0.2, 1.48], [0, 0.28, 0.03], m.paint, r.body);
    p.vents([0, 0.02, -0.72], 0.6, 0.25, 3, r.body);
    for (const s of [-1, 1]) {
      p.cylinder(0.08, 0.05, [s * 0.44, 0.18, -0.76], hot, r.body, 'z');
      p.ring(0.09, 0.017, [s * 0.44, 0.18, -0.8], m.edge, r.body);
      for (const z of [-0.5, 0.5]) leg(s * 0.55, z, 0.42, s < 0 === z < 0 ? 0 : 0.5);
      const arm = p.node(root, [s * 0.85, 1.02, -0.35], 'cutting-arm');
      r.arms.push(arm);
      p.joint([0, 0, 0], 0.12, 0.22, arm);
      p.box([0.13, 0.48, 0.17], [0, -0.22, 0], m.steel, arm);
      const blade = p.node(arm, [0, -0.38, -0.1], 'saw');
      p.cylinder(0.27, 0.045, [0, 0, 0], m.black, blade, 'x');
      p.ring(0.28, 0.025, [0, 0, 0], m.edge, blade, 'x');
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        p.box(
          [0.06, 0.08, 0.09],
          [0, Math.sin(a) * 0.3, Math.cos(a) * 0.3],
          m.copper,
          blade,
        ).rotation.x = -a;
      }
      r.tools.push({ mesh: blade, speed: 6, axis: 'x' });
    }
    for (let i = 0; i < 5; i++)
      p.box([0.68, 0.026, 0.035], [0, 0.05, -0.4 + i * 0.18], m.steel, r.body).rotation.x =
        Math.PI / 2;
  } else if (type === 'turret') {
    p.cylinder(0.55, 0.26, [0, 0.22, 0], m.black);
    p.cylinder(0.22, 1.02, [0, 0.76, 0], m.steel);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      p.rod(
        [Math.sin(a) * 0.25, 0.8, Math.cos(a) * 0.25],
        [Math.sin(a) * 0.95, 0.16, Math.cos(a) * 0.95],
        0.075,
        m.steel,
      );
      p.box(
        [0.35, 0.14, 0.47],
        [Math.sin(a) * 0.95, 0.08, Math.cos(a) * 0.95],
        m.rubber,
      ).rotation.y = a;
    }
    r.body = p.node(root, [0, 1.55, 0], 'turret-head');
    p.box([1.1, 0.53, 0.85], [0, 0, 0], m.paint, r.body);
    const recoil = p.node(r.body, [0, 0, 0], 'receiver');
    r.recoils.push(recoil);
    for (const s of [-1, 1]) {
      p.cylinder(0.08, 1.2, [s * 0.28, 0, -0.67], m.steel, recoil, 'z');
      p.ring(0.105, 0.028, [s * 0.28, 0, -0.7], m.black, recoil);
      p.cylinder(0.065, 0.05, [s * 0.28, 0, -1.3], hot, recoil, 'z');
      r.muzzles.push(p.node(recoil, [s * 0.28, 0, -1.34], 'muzzle'));
    }
    p.box([0.5, 0.14, 0.48], [0, 0.41, -0.1], m.black, r.body);
    p.cylinder(0.05, 0.04, [0, 0.4, -0.38], hot, r.body, 'z');
    p.vents([0, 0, 0.44], 0.7, 0.32, 4, r.body);
  } else {
    p.cylinder(0.52, 0.18, [0, 0.14, 0], m.black);
    p.cylinder(0.12, 1.4, [0, 0.88, 0], m.steel);
    r.body = p.node(root, [0, 1.85, 0], 'beacon');
    p.cylinder(0.32, 1.02, [0, 0, 0], m.glass, r.body);
    p.cylinder(0.16, 0.9, [0, 0, 0], tint, r.body);
    for (const y of [-0.6, 0.6]) p.cylinder(0.45, 0.13, [0, y, 0], m.steel, r.body);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3,
        x = Math.sin(a) * 0.68,
        z = Math.cos(a) * 0.68;
      const vane = p.node(r.body, [x, 0, z], 'antenna');
      vane.rotation.y = a;
      p.box([0.22, 1.27, 0.16], [0, 0, 0], m.paint, vane);
      p.box([0.075, 0.92, 0.035], [0, 0, -0.1], m.copper, vane);
      p.rod([0, 0.4, 0], [-x * 0.65, 0.4, -z * 0.65], 0.04, m.steel, vane);
    }
    p.ring(0.87, 0.04, [0, 0, 0], tint, r.body, 'y');
  }
  decorateEnemy(w, p, r, index, boss, type, palette);
  p.bake();
  w.root.add(root);
  return root;
}

export function animateMechanicalEnemy(e, time) {
  const root = e.mesh,
    r = root.userData;
  if (!r.limbs) return;
  const dt = Math.min(0.05, Math.max(0, time - (r.lastTime ?? time - 1 / 60)));
  r.lastTime = time;
  root.updateMatrixWorld(true);
  const now = root.position.clone(),
    inverse = new T.Matrix4().copy(root.matrixWorld).invert();
  if (!r.initialized) {
    r.lastPosition = now.clone();
    r.velocity = V();
    for (const f of r.limbs) {
      f.anchor.copy(f.rest).applyMatrix4(root.matrixWorld);
      f.start.copy(f.anchor);
      f.target.copy(f.anchor);
    }
    r.initialized = true;
  }
  const velocity = now.clone().sub(r.lastPosition).divideScalar(Math.max(0.001, dt));
  r.lastPosition.copy(now);
  r.velocity.lerp(velocity, 1 - Math.exp(-dt * 15));
  const speed = r.velocity.length(),
    moving = speed > 0.1,
    cadence = Math.max(0.7, speed / (e.boss ? 3 : 1.4)),
    stance = 0.5;
  for (const f of r.limbs) {
    let phase = (f.phase + (moving ? dt * cadence : 0)) % 1;
    const rest = f.rest.clone().applyMatrix4(root.matrixWorld);
    let target;
    if (moving) {
      if (
        f.planted &&
        phase < stance &&
        Math.hypot(f.anchor.x - rest.x, f.anchor.z - rest.z) > f.scale * 0.65
      ) {
        phase = stance + 0.001;
        f.phase = stance - 0.001;
      }
      if (phase >= stance && (f.planted || f.phase < stance)) {
        f.start.copy(f.anchor);
        f.target.copy(rest).addScaledVector(r.velocity, (1 - phase + stance / 2) / cadence);
        f.planted = false;
      }
      if (phase < stance) {
        if (!f.planted) {
          f.anchor.copy(f.target);
          f.planted = true;
        }
        target = f.anchor.clone();
      } else {
        const prediction = rest
          .clone()
          .addScaledVector(r.velocity, (1 - phase + stance / 2) / cadence);
        prediction.y = rest.y;
        f.target.lerp(prediction, 1 - Math.exp(-dt * 20));
        const t = (phase - stance) / (1 - stance);
        target = f.start.clone().lerp(f.target, t * t * (3 - 2 * t));
        target.y = rest.y + Math.sin(t * Math.PI) * f.scale * 0.25;
      }
    } else {
      f.anchor.lerp(rest, 1 - Math.exp(-dt * 10));
      f.start.copy(f.anchor);
      f.target.copy(f.anchor);
      f.planted = true;
      target = f.anchor.clone();
    }
    f.phase = phase;
    target.applyMatrix4(inverse);
    const pose = solveLeg(f.hip.position, target, f.L, f.L, V(Math.sign(f.rest.x) * 0.65, 0, -0.7));
    f.hip.quaternion.copy(pose.upper);
    f.knee.quaternion.copy(pose.lower);
    f.foot.quaternion.copy(pose.foot);
    f.error = pose.ankle.distanceTo(target);
  }
  for (const tool of r.tools)
    tool.mesh.rotation[tool.axis] += dt * tool.speed * (e.stunned > 0 ? 0.1 : 1);
  const exposed = e.exposed > 0 ? 1 : 0;
  for (const vent of r.vents) {
    if (vent.kind === 'door')
      vent.mesh.rotation.y = T.MathUtils.lerp(
        vent.mesh.rotation.y,
        vent.side * exposed * 0.9,
        1 - Math.exp(-dt * 6),
      );
    else
      vent.mesh.rotation.x = T.MathUtils.lerp(
        vent.mesh.rotation.x,
        0.6 + exposed * 0.55,
        1 - Math.exp(-dt * 5),
      );
  }
  for (let i = 0; i < r.arms.length; i++)
    r.arms[i].rotation.x = T.MathUtils.lerp(
      r.arms[i].rotation.x,
      e.windup > 0 ? (i === 0 ? 0.6 : -0.18) : 0,
      1 - Math.exp(-dt * 6),
    );
  for (const receiver of r.recoils)
    receiver.position.z =
      (e.boss ? -0.15 : 0) + Math.exp(-Math.max(0, time - (e.firedAt || -100)) * 18) * 0.19;
  root.updateMatrixWorld(true);
  for (const link of r.pistons) {
    const a = link.from.clone().applyMatrix4(link.a.matrixWorld).applyMatrix4(inverse),
      b = link.to.clone().applyMatrix4(link.b.matrixWorld).applyMatrix4(inverse),
      delta = b.clone().sub(a),
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

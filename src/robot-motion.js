import * as T from 'three';
import { updateActuators } from './robot-rig.js';
const DOWN = new T.Vector3(0, -1, 0),
  POLE = new T.Vector3(0, 0, -1);
const clamp = T.MathUtils.clamp;
const ease = (a, b, rate, dt) => T.MathUtils.lerp(a, b, 1 - Math.exp(-rate * dt));

export function aimWeapon(robot, target, immediate = false) {
  const r = robot.userData.rig;
  if (immediate) {
    const p = robot.position,
      pitch = clamp(
        Math.atan2(target.y - p.y - 2.1, Math.hypot(target.x - p.x, target.z - p.z)),
        -0.6,
        0.6,
      );
    r.arms[1].rotation.set(Math.PI / 2 - 0.4 + pitch - r.body.rotation.x, 0, 0);
    r.elbows[1].rotation.x = 0.4;
  }
  robot.updateMatrixWorld(true);
  const local = r.gun.parent.worldToLocal(target.clone()).sub(r.gun.position).normalize();
  r.gun.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), local);
  robot.updateMatrixWorld(true);
}

// Both segment orientations are solved from an ankle target. The ankle then
// cancels their accumulated rotation, keeping the sole parallel to the deck.
export function solveLeg(hip, target, upper = 0.65, lower = 0.65, pole = POLE) {
  const delta = target.clone().sub(hip),
    raw = delta.length(),
    distance = clamp(raw, 0.04, upper + lower - 0.0001),
    axis = delta.clone().normalize();
  if (raw < 0.00001) axis.copy(DOWN);
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const bend = pole.clone().addScaledVector(axis, -pole.dot(axis));
  if (bend.lengthSq() < 0.001) bend.set(0, -1, 0);
  bend.normalize();
  const knee = hip
    .clone()
    .addScaledVector(axis, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
  const ankle = hip.clone().addScaledVector(axis, distance);
  const q1 = new T.Quaternion().setFromUnitVectors(DOWN, knee.clone().sub(hip).normalize());
  const q2 = new T.Quaternion().setFromUnitVectors(DOWN, ankle.clone().sub(knee).normalize());
  return {
    upper: q1,
    lower: q1.clone().invert().multiply(q2),
    foot: q2.clone().invert(),
    ankle,
    knee,
    clamped: raw > upper + lower,
  };
}

export function animateMechanicalRobot(robot, time, speed = 0, attack = 0, airborne = false) {
  const r = robot.userData.rig;
  if (!r?.actuators) return;
  const dt = r.lastTime === null ? 1 / 60 : clamp(time - r.lastTime, 0, 0.05);
  r.lastTime = time;
  robot.updateMatrixWorld(true);
  const actual = robot.getWorldPosition(new T.Vector3()),
    scale = robot.getWorldScale(new T.Vector3());
  if (!r.virtualOffset) r.virtualOffset = new T.Vector3();
  const preview = robot.userData.previewSpeed || 0;
  r.virtualOffset.z -= preview * dt;
  const current = actual.clone().add(r.virtualOffset);
  const propelled = robot.userData.dashing === true || (r.velocity?.length() || 0) > 18;
  const lifted = airborne || propelled;
  if (!r.initialized || current.distanceTo(r.lastPosition) > 4 || (r.wasLifted && !lifted)) {
    r.lastPosition.copy(current);
    r.initialized = true;
    r.gaitPhase = 0;
    r.motionWeight = 0;
    for (let i = 0; i < 2; i++) {
      const f = r.footState[i];
      f.anchor
        .set((i ? 1 : -1) * 0.235, 0.165, 0)
        .applyMatrix4(robot.matrixWorld)
        .add(r.virtualOffset);
      f.start.copy(f.anchor);
      f.target.copy(f.anchor);
      f.phase = i * 0.5;
      f.planted = true;
      f.settle = null;
    }
  }
  const velocity = current.clone().sub(r.lastPosition).divideScalar(Math.max(dt, 0.001));
  velocity.y = 0;
  r.lastPosition.copy(current);
  r.velocity.lerp(velocity, 1 - Math.exp(-dt * 15));
  const velocityLength = Math.min(14, r.velocity.length()),
    moving = velocityLength > 0.14;
  r.motionWeight = ease(r.motionWeight || 0, moving ? 1 : 0, 12, dt);
  const cadence = clamp(velocityLength / 2.1, 1.2, 6),
    stance = 0.42;
  if (moving) r.gaitPhase += dt * cadence;
  const phase = r.gaitPhase || 0,
    bodyBob = Math.cos(phase * Math.PI * 4) * 0.025 * r.motionWeight;
  const landing = Math.max(0, (robot.userData.landUntil || 0) - time) / 0.3;
  const hurt = Math.max(0, (robot.userData.hurtUntil || 0) - time) / 0.25;
  const slash = (robot.userData.slash || 0) > time,
    fire = (robot.userData.fire || 0) > time;
  const aiming = fire || (robot.userData.aimUntil || 0) > time;
  const aim = robot.userData.aimAt;
  const aimPitch = aim
    ? clamp(
        Math.atan2(
          aim.y - actual.y - 2.1 * scale.y,
          Math.hypot(aim.x - actual.x, aim.z - actual.z),
        ),
        -0.6,
        0.6,
      )
    : 0;
  const swing = slash ? Math.sin(clamp((robot.userData.slash - time) / 0.32, 0, 1) * Math.PI) : 0;
  r.hips.position.y = 1.35 + bodyBob - landing * 0.12;
  r.body.position.y = -0.08 + bodyBob - landing * 0.12;
  r.body.rotation.x = ease(
    r.body.rotation.x,
    Math.min(0.11, velocityLength * 0.009) + hurt * 0.15,
    13,
    dt,
  );
  r.body.rotation.z = ease(
    r.body.rotation.z,
    slash ? swing * 0.17 : Math.sin(phase * Math.PI * 2) * 0.025 * r.motionWeight,
    14,
    dt,
  );
  const inverse = new T.Matrix4().copy(robot.matrixWorld).invert();
  for (let i = 0; i < 2; i++) {
    const f = r.footState[i],
      side = i ? 1 : -1;
    let next = (f.phase + (moving ? dt * cadence : 0)) % 1;
    const rest = new T.Vector3(side * 0.235, 0.165, 0)
      .applyMatrix4(robot.matrixWorld)
      .add(r.virtualOffset);
    let target;
    if (lifted) {
      target = new T.Vector3(side * 0.235, 0.35 + (i ? 0.08 : 0), i ? 0.18 : -0.25);
      f.anchor.copy(rest);
      f.target.copy(rest);
      f.start.copy(rest);
      f.planted = false;
      f.settle = null;
    } else if (moving) {
      f.settle = null;
      // Accelerating from rest can outrun a scheduled support phase. Lift the
      // trailing foot early instead of dragging it or stretching the leg.
      const supportOffset = Math.hypot(f.anchor.x - rest.x, f.anchor.z - rest.z);
      if (f.planted && next < stance && supportOffset > 0.46 * scale.y) {
        next = stance + 0.001;
        f.phase = stance - 0.001;
      }
      if (next >= stance && (f.phase < stance || f.planted)) {
        f.start.copy(f.anchor);
        f.target.copy(rest).addScaledVector(r.velocity, (1 - next + stance / 2) / cadence);
        f.target.y = rest.y;
        f.planted = false;
      }
      if (next < stance) {
        if (!f.planted) {
          f.anchor.copy(f.target);
          const offset = f.anchor.clone().sub(rest);
          offset.y = 0;
          const reach = 0.43 * scale.y;
          if (offset.length() > reach) {
            offset.setLength(reach);
            f.anchor.copy(rest).add(offset);
          }
          f.planted = true;
          r.stepEvents++;
        }
        target = f.anchor.clone();
      } else {
        const predicted = rest
          .clone()
          .addScaledVector(r.velocity, (1 - next + stance / 2) / cadence);
        predicted.y = rest.y;
        f.target.lerp(predicted, 1 - Math.exp(-dt * 20));
        const t = clamp((next - stance) / (1 - stance), 0, 1),
          smooth = t * t * (3 - 2 * t);
        target = f.start.clone().lerp(f.target, smooth);
        target.y = rest.y + Math.sin(t * Math.PI) * (0.16 + velocityLength * 0.009) * scale.y;
      }
      target.sub(r.virtualOffset).applyMatrix4(inverse);
    } else {
      // A stopped or turning robot finishes the lifted foot with a short
      // recovery step. Sliding both planted soles toward rest would be visible.
      if (!f.settle && (!f.planted || f.anchor.distanceTo(rest) > 0.07))
        f.settle = { start: (f.currentWorld || f.anchor).clone(), elapsed: 0 };
      if (f.settle) {
        f.settle.elapsed += dt;
        const t = clamp(f.settle.elapsed / 0.22, 0, 1),
          smooth = t * t * (3 - 2 * t);
        target = f.settle.start.clone().lerp(rest, smooth);
        target.y += Math.sin(t * Math.PI) * 0.09 * scale.y;
        f.planted = false;
        if (t === 1) {
          f.anchor.copy(rest);
          f.target.copy(rest);
          f.planted = true;
          f.settle = null;
          r.stepEvents++;
        }
      } else target = f.anchor.clone();
      target.sub(r.virtualOffset).applyMatrix4(inverse);
    }
    f.currentWorld = target.clone().applyMatrix4(robot.matrixWorld).add(r.virtualOffset);
    f.phase = next;
    const hip = new T.Vector3(side * 0.235, r.hips.position.y, 0),
      pose = solveLeg(hip, target);
    r.legs[i].quaternion.copy(pose.upper);
    r.knees[i].quaternion.copy(pose.lower);
    r.feet[i].quaternion.copy(pose.foot);
    f.solved = pose.ankle;
    f.requested = target;
    f.clamped = pose.clamped;
    const armSwing = Math.sin(phase * Math.PI * 2 + i * Math.PI) * 0.32 * r.motionWeight;
    const recoil = fire
      ? Math.exp(-Math.max(0, time - (robot.userData.shotAt || 0)) * 22) * 0.12
      : 0;
    r.arms[i].rotation.x = ease(
      r.arms[i].rotation.x,
      slash
        ? i === 0
          ? 1.3 + swing
          : 0.4
        : aiming && i === 1
          ? 1.17 + aimPitch - r.body.rotation.x - recoil
          : armSwing - 0.05,
      22,
      dt,
    );
    r.arms[i].rotation.z = ease(
      r.arms[i].rotation.z,
      slash && i === 0 ? -swing * 0.8 : i ? -0.06 : 0.06,
      22,
      dt,
    );
    r.elbows[i].rotation.x = ease(
      r.elbows[i].rotation.x,
      aiming && i === 1 ? 0.4 : -0.2 - r.motionWeight * 0.2,
      18,
      dt,
    );
    r.hands[i].rotation.x = aiming ? -0.1 : 0.08;
    r.thrusters[i].visible = lifted;
    r.thrusters[i].scale.y = robot.userData.dashing ? 2.2 : 1;
  }
  let lookYaw = Math.sin(time * 0.37) * 0.08,
    lookPitch = Math.sin(time * 0.53) * 0.025;
  if (robot.userData.lookAt) {
    const head = r.head.getWorldPosition(new T.Vector3()),
      dir = robot.userData.lookAt.clone().sub(head).transformDirection(inverse);
    lookYaw = clamp(Math.atan2(-dir.x, -dir.z), -0.6, 0.6);
    lookPitch = clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -0.25, 0.3);
  }
  r.head.rotation.y = ease(r.head.rotation.y, lookYaw, 8, dt);
  r.head.rotation.x = ease(r.head.rotation.x, lookPitch, 8, dt);
  r.muzzle.visible = fire && time - (robot.userData.shotAt || 0) < 0.055;
  r.blade.visible = slash;
  if (aiming && aim) aimWeapon(robot, aim);
  else r.gun.rotation.set(-Math.PI / 2, 0, 0);
  r.wasLifted = lifted;
  updateActuators(robot);
}

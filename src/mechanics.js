export function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dt)));
}
export function turnToward(current, target, rate, dt) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-rate * dt));
}
export function projectedMarker(point, width, height, margin = 70) {
  const behind = point.z > 1;
  let x = point.x,
    y = -point.y;
  if (behind) {
    x = -x;
    y = 0.9;
  }
  const scale = Math.max(1, Math.abs(x), Math.abs(y));
  x /= scale;
  y /= scale;
  return {
    x: Math.max(margin, Math.min(width - margin, ((x + 1) * width) / 2)),
    y: Math.max(170, Math.min(height - 170, ((y + 1) * height) / 2)),
    behind,
  };
}
export function targetScore(distance, alignment, assist) {
  if (
    !Number.isFinite(distance) ||
    distance < 0 ||
    alignment < (assist ? (distance < 8 ? -1 : -0.35) : 0.72)
  )
    return Infinity;
  return distance * 0.35 + (1 - alignment) * 24;
}

// Integrate the exponential response, not just the final velocity, so travel
// distance and braking stay consistent at 30, 60 and 144 Hz.
export function moveVelocity(velocity, direction, speed, dt, dashing = false) {
  const moving = direction.lengthSq() > 0;
  const reversing = moving && velocity.dot(direction) < 0;
  const rate = dashing ? 90 : !moving ? 60 : reversing ? 70 : 42;
  const decay = Math.exp(-rate * dt),
    target = direction.clone().multiplyScalar(speed);
  const displacement = target
    .clone()
    .multiplyScalar(dt)
    .addScaledVector(velocity.clone().sub(target), (1 - decay) / rate);
  velocity.sub(target).multiplyScalar(decay).add(target);
  return displacement;
}

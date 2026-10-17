// Small, allocation-free magnetic pull step shared by runtime and build regression tests.
// Horizontal reach stays intentionally short; the taller vertical window lets floating/high
// mints be attracted while the mint moves in 3D instead of becoming stuck directly overhead.
export function calculateMagnetPullStep(mintPosition, targetPosition, dt, horizontalRange, verticalRange, out, farSpeed = 8.2, nearSpeed = 10.0) {
  const dx = targetPosition.x - mintPosition.x;
  const dy = targetPosition.y - mintPosition.y;
  const dz = targetPosition.z - mintPosition.z;
  const horizontal = Math.hypot(dx, dz);
  const vertical = Math.abs(dy);
  out.inRange = horizontal <= horizontalRange && vertical <= verticalRange;
  out.moved = false;
  out.x = mintPosition.x;
  out.y = mintPosition.y;
  out.z = mintPosition.z;
  out.horizontalDistance = horizontal;
  out.distance = Math.hypot(dx, dy, dz);
  if (!out.inRange || out.distance <= 0.025) return out;

  // Move along the full 3D vector. This deliberately handles the directly-above/below case
  // (horizontal distance ~0), which the previous horizontal-only step silently ignored.
  const speed = horizontal > horizontalRange * 0.52 ? farSpeed : nearSpeed;
  const step = Math.min(out.distance, speed * Math.min(Math.max(dt, 0), 0.05));
  out.x += (dx / out.distance) * step;
  out.y += (dy / out.distance) * step;
  out.z += (dz / out.distance) * step;
  out.moved = true;
  return out;
}

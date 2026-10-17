// Convert the approximate sine of the Moon's altitude and its azimuth into a unit direction.
// Using sqrt(1 - sinAltitude^2) for the horizontal magnitude preserves the real altitude angle;
// it avoids the old fixed, low elevation that made direct moonlight skim nearly parallel to ground.
export function moonDirectionFromAltitude(azimuth, sinAltitude) {
  const altitudeSine = Number.isFinite(sinAltitude) ? Math.min(1, Math.max(-1, sinAltitude)) : 0;
  const safeAzimuth = Number.isFinite(azimuth) ? azimuth : 0;
  const horizontal = Math.sqrt(Math.max(0, 1 - altitudeSine * altitudeSine));
  return {
    x: Math.cos(safeAzimuth) * horizontal,
    y: altitudeSine,
    z: Math.sin(safeAzimuth) * horizontal,
  };
}

// Low-precision Meeus lunar phase-angle model. It runs locally from the current UTC instant;
// no service, location permission, or manually accelerated in-game clock is involved.
const DEGREES_TO_RADIANS = Math.PI / 180;

function wrapDegrees(angle) {
  return ((angle % 360) + 360) % 360;
}

export function lunarLightScale(illumination) {
  return Number.isFinite(illumination) ? Math.min(1, Math.max(0, illumination)) : 0;
}

export function lunarInfo(now = new Date()) {
  const julianDate = now.getTime() / 86400000 + 2440587.5;
  const T = (julianDate - 2451545) / 36525;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  // Meeus, Astronomical Algorithms, chapter 47: mean elongation and lunar anomalies.
  const D = wrapDegrees(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
  const M = wrapDegrees(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  const Mp = wrapDegrees(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);

  // Elongation gives the cycle's new-to-full-to-new position. The phase-angle series below
  // accounts for the Moon's orbital variation instead of assuming every lunation is identical.
  const phase = D / 360;
  const phaseAngleDegrees = wrapDegrees(
    180 - D
    - 6.289 * Math.sin(Mp * DEGREES_TO_RADIANS)
    + 2.1 * Math.sin(M * DEGREES_TO_RADIANS)
    - 1.274 * Math.sin((2 * D - Mp) * DEGREES_TO_RADIANS)
    - 0.658 * Math.sin(2 * D * DEGREES_TO_RADIANS)
    - 0.214 * Math.sin(2 * Mp * DEGREES_TO_RADIANS)
    - 0.11 * Math.sin(D * DEGREES_TO_RADIANS),
  );
  let illumination = lunarLightScale((1 + Math.cos(phaseAngleDegrees * DEGREES_TO_RADIANS)) * 0.5);
  // Remove numerical/orbital-series residue at syzygy so new moon really produces no moonlight.
  if (illumination < 0.0005) illumination = 0;
  else if (illumination > 0.9995) illumination = 1;

  let name;
  const nearQuarter = illumination >= 0.46 && illumination <= 0.54;
  if (illumination === 0) name = 'New moon';
  else if (illumination === 1) name = 'Full moon';
  else if (phase < 0.5) {
    if (nearQuarter) name = 'First quarter';
    else name = illumination < 0.5 ? 'Waxing crescent' : 'Waxing gibbous';
  } else {
    if (nearQuarter) name = 'Last quarter';
    else name = illumination > 0.5 ? 'Waning gibbous' : 'Waning crescent';
  }
  return { phase, illumination, name };
}

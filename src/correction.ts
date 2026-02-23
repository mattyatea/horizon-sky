const DEG_TO_RAD = Math.PI / 180;

/**
 * Calculates an altitude offset to simulate multiple scattering effects at sunrise/sunset.
 * As described in: https://github.com/dnlzro/horizon/issues/2
 *
 * @param altitude Sun altitude in radians
 * @returns Altitude offset in radians
 */
export function getMultipleScatteringOffset(altitude: number): number {
  const altDeg = altitude / DEG_TO_RAD;

  if (altDeg > 20) {
    // High sun: very minimal correction needed
    return 2.0 * DEG_TO_RAD;
  } else if (altDeg > -6) {
    // Sun above horizon to civil twilight: gentle increase
    const t = (20 - altDeg) / 26; // 0 at 20°, 1 at -6°
    const smoothT = t * t * (3 - 2 * t); // smooth step function
    return (2.0 + smoothT * 6.0) * DEG_TO_RAD; // 2° to 8°
  } else if (altDeg > -12) {
    // Civil to nautical twilight: slower increase to avoid reverse sunset
    const t = (-6 - altDeg) / 6; // 0 at -6°, 1 at -12°
    const smoothT = t * t * (3 - 2 * t);
    return (8.0 + smoothT * 3.0) * DEG_TO_RAD; // 8° to 11°
  } else {
    // Deep twilight: slow linear decay to avoid overly bright night sky
    const t = Math.max(0, (-12 - altDeg) / 18); // 0 at -12°, 1 at -30°
    return (11.0 * (1 - t)) * DEG_TO_RAD;
  }
}

/**
 * Bortle scale (1-9) to sun altitude threshold mapping for light pollution simulation.
 */
const LIGHT_POLLUTION_OFFSETS: Record<number, number> = {
  1: 0.0, // Pristine dark sky
  2: 0.1, // Typical dark sky
  3: 0.2, // Rural
  4: 1.0, // Rural/suburban
  5: 2.0, // Suburban
  6: 3.0, // Bright suburban
  7: 4.0, // Urban
  8: 5.0, // City
  9: 6.0, // Inner city
};

/**
 * Calculates a minimum sun altitude threshold to simulate light pollution based on the Bortle scale.
 *
 * @param bortle Bortle scale (1-9)
 * @returns Minimum altitude in radians
 */
export function getLightPollutionAltitude(bortle: number): number {
  const offsetDeg = LIGHT_POLLUTION_OFFSETS[bortle] ?? 0;
  // Subtract 3° as single scattering provides light until roughly -3°.
  return (offsetDeg - 3.0) * DEG_TO_RAD;
}

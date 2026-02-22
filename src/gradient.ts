import { clamp, dot, len, norm, add, scale, vecExp } from "./utils.js";
import type { Vec3 } from "./utils.js";

const PI = Math.PI;

const RAYLEIGH_SCATTER: Vec3 = [5.802e-6, 13.558e-6, 33.1e-6];
const MIE_SCATTER = 3.996e-6;
const MIE_ABSORB = 4.44e-6;
const OZONE_ABSORB: Vec3 = [0.65e-6, 1.881e-6, 0.085e-6];

const RAYLEIGH_SCALE_HEIGHT = 8e3;
const MIE_SCALE_HEIGHT = 1.2e3;

const GROUND_RADIUS = 6_360e3;
const TOP_RADIUS = 6_460e3;
const SUN_INTENSITY = 1.0;

const SAMPLES = 32;
const FOV_DEG = 75;

const EXPOSURE_DAY = 18.0;
const EXPOSURE_SUNSET = 35.0;
const EXPOSURE_NIGHT = 6.0;
const GAMMA = 2.2;
const SUNSET_BIAS_STRENGTH = 0.5;

function aces(color: Vec3): Vec3 {
  return color.map((c) => {
    const n = c * (2.51 * c + 0.03);
    const d = c * (2.43 * c + 0.59) + 0.14;
    return Math.max(0, Math.min(1, n / d));
  }) as Vec3;
}

function applySunsetBias([r, g, b]: Vec3): Vec3 {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const w = 1.0 / (1.0 + 2.0 * lum);
  const k = SUNSET_BIAS_STRENGTH;
  const rb = 1.0 + 0.5 * k * w;
  const gb = 1.0 - 0.5 * k * w;
  const bb = 1.0 + 1.0 * k * w;
  return [Math.max(0, r * rb), Math.max(0, g * gb), Math.max(0, b * bb)];
}

function rayleighPhase(angle: number): number {
  return (3 * (1 + Math.cos(angle) ** 2)) / (16 * PI);
}

function miePhase(angle: number): number {
  const g = 0.8;
  const s = 3 / (8 * PI);
  const num = (1 - g ** 2) * (1 + Math.cos(angle) ** 2);
  const denom = (2 + g ** 2) * (1 + g ** 2 - 2 * g * Math.cos(angle)) ** (3 / 2);
  return (s * num) / denom;
}

function intersectSphere(p: Vec3, d: Vec3, r: number): number | null {
  const m = p;
  const b = dot(m, d);
  const c = dot(m, m) - r ** 2;
  const discr = b ** 2 - c;
  if (discr < 0) return null;
  const t = -b - Math.sqrt(discr);
  if (t < 0) return -b + Math.sqrt(discr);
  return t;
}

function computeTransmittance(height: number, angle: number): Vec3 {
  const rayOrigin: Vec3 = [0, GROUND_RADIUS + height, 0];
  const rayDirection: Vec3 = [Math.sin(angle), Math.cos(angle), 0];

  const distance = intersectSphere(rayOrigin, rayDirection, TOP_RADIUS);
  if (!distance) return [1, 1, 1];

  const segmentLength = distance / SAMPLES;
  let t = 0.5 * segmentLength;

  let odRayleigh = 0;
  let odMie = 0;
  let odOzone = 0;

  for (let i = 0; i < SAMPLES; i++) {
    const pos = add(rayOrigin, scale(rayDirection, t));
    const h = len(pos) - GROUND_RADIUS;
    const dR = Math.exp(-h / RAYLEIGH_SCALE_HEIGHT);
    const dM = Math.exp(-h / MIE_SCALE_HEIGHT);
    odRayleigh += dR * segmentLength;
    const ozoneDensity = 1.0 - Math.min(Math.abs(h - 25e3) / 15e3, 1.0);
    odOzone += ozoneDensity * segmentLength;
    odMie += dM * segmentLength;
    t += segmentLength;
  }

  const tauR: Vec3 = [
    RAYLEIGH_SCATTER[0] * odRayleigh,
    RAYLEIGH_SCATTER[1] * odRayleigh,
    RAYLEIGH_SCATTER[2] * odRayleigh,
  ];
  const tauM: Vec3 = [MIE_ABSORB * odMie, MIE_ABSORB * odMie, MIE_ABSORB * odMie];
  const tauO: Vec3 = [
    OZONE_ABSORB[0] * odOzone,
    OZONE_ABSORB[1] * odOzone,
    OZONE_ABSORB[2] * odOzone,
  ];

  const tau: Vec3 = [
    -(tauR[0] + tauM[0] + tauO[0]),
    -(tauR[1] + tauM[1] + tauO[1]),
    -(tauR[2] + tauM[2] + tauO[2]),
  ];
  return vecExp(tau);
}

export interface GradientResult {
  gradient: string;
  topColor: Vec3;
  bottomColor: Vec3;
}

export function renderGradient(altitude: number): GradientResult {
  const cameraPosition: Vec3 = [0, GROUND_RADIUS, 0];
  const sunDirection: Vec3 = norm([Math.cos(altitude), Math.sin(altitude), 0]);

  const sunHeight = Math.sin(altitude);
  let exposure: number;
  if (sunHeight <= -0.15) {
    exposure = EXPOSURE_NIGHT;
  } else if (sunHeight <= 0.0) {
    const x = (sunHeight - -0.15) / 0.15;
    const s = x * x * (3 - 2 * x);
    exposure = EXPOSURE_NIGHT + s * (EXPOSURE_SUNSET - EXPOSURE_NIGHT);
  } else if (sunHeight <= 0.4) {
    const x = sunHeight / 0.4;
    const s = x * x * (3 - 2 * x);
    exposure = EXPOSURE_SUNSET + s * (EXPOSURE_DAY - EXPOSURE_SUNSET);
  } else {
    exposure = EXPOSURE_DAY;
  }

  const horizonGlow = Math.max(0, 1 - Math.abs(sunHeight) * 3);
  const focalZ = 1.0 / Math.tan((FOV_DEG * 0.5 * PI) / 180.0);

  const stops: Array<{ percent: number; rgb: Vec3 }> = [];

  for (let i = 0; i < SAMPLES; i++) {
    const s = i / (SAMPLES - 1);
    const viewDirection = norm([0, s, focalZ]);
    let inscattered: Vec3 = [0, 0, 0];

    const tExitTop = intersectSphere(cameraPosition, viewDirection, TOP_RADIUS);
    if (tExitTop !== null && tExitTop > 0) {
      const rayOrigin = cameraPosition.slice() as Vec3;
      const segmentLength = tExitTop / SAMPLES;
      let tRay = segmentLength * 0.5;

      const rayOriginRadius = len(rayOrigin);
      const isRayPointingDownwardAtStart =
        dot(rayOrigin, viewDirection) / rayOriginRadius < 0.0;
      const startHeight = rayOriginRadius - GROUND_RADIUS;
      const startRayCos = clamp(
        dot(
          [
            rayOrigin[0] / rayOriginRadius,
            rayOrigin[1] / rayOriginRadius,
            rayOrigin[2] / rayOriginRadius,
          ],
          viewDirection,
        ),
        -1,
        1,
      );
      const startRayAngle = Math.acos(Math.abs(startRayCos));
      const transmittanceCameraToSpace = computeTransmittance(startHeight, startRayAngle);

      for (let j = 0; j < SAMPLES; j++) {
        const samplePos = add(rayOrigin, scale(viewDirection, tRay));
        const sampleRadius = len(samplePos);
        const upUnit: Vec3 = [
          samplePos[0] / sampleRadius,
          samplePos[1] / sampleRadius,
          samplePos[2] / sampleRadius,
        ];
        const sampleHeight = sampleRadius - GROUND_RADIUS;

        const viewCos = clamp(dot(upUnit, viewDirection), -1, 1);
        const sunCos = clamp(dot(upUnit, sunDirection), -1, 1);
        const viewAngle = Math.acos(Math.abs(viewCos));
        const sunAngle = Math.acos(sunCos);

        const transmittanceToSpace = computeTransmittance(sampleHeight, viewAngle);
        const transmittanceCameraToSample: Vec3 = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          transmittanceCameraToSample[k] = isRayPointingDownwardAtStart
            ? transmittanceToSpace[k] / transmittanceCameraToSpace[k]
            : transmittanceCameraToSpace[k] / transmittanceToSpace[k];
        }

        const transmittanceLight = computeTransmittance(sampleHeight, sunAngle);

        const opticalDensityRay = Math.exp(-sampleHeight / RAYLEIGH_SCALE_HEIGHT);
        const opticalDensityMie = Math.exp(-sampleHeight / MIE_SCALE_HEIGHT);
        const sunViewCos = clamp(dot(sunDirection, viewDirection), -1, 1);
        const sunViewAngle = Math.acos(sunViewCos);
        const phaseR = rayleighPhase(sunViewAngle);
        const phaseM = miePhase(sunViewAngle);

        const scatteredRgb: Vec3 = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          const rayleighTerm = RAYLEIGH_SCATTER[k] * opticalDensityRay * phaseR;
          const mieTerm = MIE_SCATTER * opticalDensityMie * phaseM;
          scatteredRgb[k] = transmittanceLight[k] * (rayleighTerm + mieTerm);
        }

        for (let k = 0; k < 3; k++) {
          inscattered[k] += transmittanceCameraToSample[k] * scatteredRgb[k] * segmentLength;
        }
        tRay += segmentLength;
      }

      for (let k = 0; k < 3; k++) inscattered[k] *= SUN_INTENSITY;
    }

    let color = inscattered.slice() as Vec3;
    color = color.map((c) => c * exposure) as Vec3;
    if (horizonGlow > 0) {
      const warmth = horizonGlow * 0.6;
      color = color.map((c, i) => {
        const boost = i === 0 ? 1 + warmth : i === 1 ? 1 + warmth * 0.3 : 1 - warmth * 0.2;
        return c * boost;
      }) as Vec3;
    }
    color = applySunsetBias(color);
    color = aces(color);
    color = color.map((c) => Math.pow(c, 1.0 / GAMMA)) as Vec3;
    const rgb = color.map((c) => Math.round(clamp(c, 0, 1) * 255)) as Vec3;

    const percent = (1 - s) * 100;
    stops.push({ percent, rgb });
  }

  stops.sort((a, b) => a.percent - b.percent);
  const colorStops = stops
    .map(
      ({ percent, rgb }) =>
        `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]}) ${Math.round(percent * 100) / 100}%`,
    )
    .join(", ");

  return {
    gradient: `linear-gradient(to bottom, ${colorStops})`,
    topColor: stops[0].rgb,
    bottomColor: stops[stops.length - 1].rgb,
  };
}

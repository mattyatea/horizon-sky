import { getSunPosition } from "./suncalc.js";
import { renderGradient } from "./gradient.js";
import { fetchSunTimes, correctAltitude } from "./sunTimes.js";
import { getMultipleScatteringOffset, getLightPollutionAltitude } from "./correction.js";
import type { SunTimesProvider, SunTimes } from "./sunTimes.js";
import type { Vec3 } from "./utils.js";

export interface SkyResult {
  gradient: string;
  topColor: string;
  bottomColor: string;
  altitude: number;
  azimuth: number;
  correctedAltitude?: number;
  sunrise?: Date;
  sunset?: Date;
}

export type SunTimesOption =
  | false
  | { provider: SunTimesProvider };

export interface ComputeSkyOptions {
  date: Date;
  latitude: number;
  longitude: number;
  sunTimes?: SunTimesOption;
  bortle?: number;
}

function vecToRgb(v: Vec3): string {
  return `rgb(${v[0]}, ${v[1]}, ${v[2]})`;
}

export async function computeSky(options: ComputeSkyOptions): Promise<SkyResult> {
  const {
    date,
    latitude,
    longitude,
    sunTimes: sunTimesOption = false,
    bortle,
  } = options;

  const { altitude: rawAltitude, azimuth } = getSunPosition(date, latitude, longitude);

  let altitude = rawAltitude;
  let correctedAltitude: number | undefined;
  let sunrise: Date | undefined;
  let sunset: Date | undefined;

  if (sunTimesOption) {
    const provider = sunTimesOption.provider;

    const sunTimes: SunTimes = await fetchSunTimes(latitude, longitude, date, provider);
    correctedAltitude = correctAltitude(date, rawAltitude, sunTimes, latitude, longitude);
    altitude = correctedAltitude;
    sunrise = sunTimes.sunrise;
    sunset = sunTimes.sunset;
  }

  // Apply Multiple Scattering correction
  altitude += getMultipleScatteringOffset(altitude);

  // Apply Light Pollution correction
  if (bortle !== undefined) {
    altitude = Math.max(altitude, getLightPollutionAltitude(bortle));
  }

  const { gradient, topColor, bottomColor } = renderGradient(altitude);

  return {
    gradient,
    topColor: vecToRgb(topColor),
    bottomColor: vecToRgb(bottomColor),
    altitude: rawAltitude,
    azimuth,
    correctedAltitude,
    sunrise,
    sunset,
  };
}

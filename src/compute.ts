import { getSunPosition } from "./suncalc.js";
import { renderGradient } from "./gradient.js";
import { fetchSunTimes, correctAltitude } from "./sunTimes.js";
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
  | true
  | { provider?: SunTimesProvider };

export interface ComputeSkyOptions {
  date: Date;
  latitude: number;
  longitude: number;
  sunTimes?: SunTimesOption;
}

function vecToRgb(v: Vec3): string {
  return `rgb(${v[0]}, ${v[1]}, ${v[2]})`;
}

export async function computeSky(options: ComputeSkyOptions): Promise<SkyResult> {
  const { date, latitude, longitude, sunTimes: sunTimesOption = false } = options;

  const { altitude, azimuth } = getSunPosition(date, latitude, longitude);

  if (!sunTimesOption) {
    const { gradient, topColor, bottomColor } = renderGradient(altitude);
    return {
      gradient,
      topColor: vecToRgb(topColor),
      bottomColor: vecToRgb(bottomColor),
      altitude,
      azimuth,
    };
  }

  const provider =
    sunTimesOption === true || sunTimesOption.provider === undefined
      ? undefined
      : sunTimesOption.provider;

  const sunTimes: SunTimes = await fetchSunTimes(latitude, longitude, date, provider);
  const correctedAltitude = correctAltitude(date, altitude, sunTimes, latitude, longitude);

  const { gradient, topColor, bottomColor } = renderGradient(correctedAltitude);
  return {
    gradient,
    topColor: vecToRgb(topColor),
    bottomColor: vecToRgb(bottomColor),
    altitude,
    azimuth,
    correctedAltitude,
    sunrise: sunTimes.sunrise,
    sunset: sunTimes.sunset,
  };
}

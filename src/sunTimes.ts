import { getSunPosition } from "./suncalc.js";

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

export interface SunTimesRequest {
  latitude: number;
  longitude: number;
  date: string;
}

export interface SunTimesResponse {
  sunrise: Date | string;
  sunset: Date | string;
}

export type SunTimesProvider = (params: SunTimesRequest) => Promise<SunTimesResponse>;

export async function defaultSunTimesProvider(params: SunTimesRequest): Promise<SunTimesResponse> {
  const { latitude, longitude, date } = params;
  const url = `https://api.sunrise-sunset.org/json?lat=${latitude}&lng=${longitude}&date=${date}&formatted=0`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`sunrise-sunset.org API error: ${res.status}`);
  }
  const json = (await res.json()) as {
    status: string;
    results: { sunrise: string; sunset: string };
  };
  if (json.status !== "OK") {
    throw new Error(`sunrise-sunset.org API returned status: ${json.status}`);
  }
  return { sunrise: json.results.sunrise, sunset: json.results.sunset };
}

export async function fetchSunTimes(
  latitude: number,
  longitude: number,
  date: Date,
  provider: SunTimesProvider = defaultSunTimesProvider,
): Promise<SunTimes> {
  const tzOffsetMinutes = Math.round(longitude / 15) * 60;
  const localDate = new Date(date.getTime() + tzOffsetMinutes * 60 * 1000);
  const dateStr = [
    localDate.getUTCFullYear(),
    String(localDate.getUTCMonth() + 1).padStart(2, "0"),
    String(localDate.getUTCDate()).padStart(2, "0"),
  ].join("-");

  const result = await provider({ latitude, longitude, date: dateStr });

  return {
    sunrise: result.sunrise instanceof Date ? result.sunrise : new Date(result.sunrise),
    sunset: result.sunset instanceof Date ? result.sunset : new Date(result.sunset),
  };
}

export function correctAltitude(
  now: Date,
  sunAltitude: number,
  sunTimes: SunTimes,
  latitude: number,
  longitude: number,
): number {
  const { sunrise, sunset } = sunTimes;
  const sunriseOffset = getSunPosition(sunrise, latitude, longitude).altitude;
  const sunsetOffset = getSunPosition(sunset, latitude, longitude).altitude;

  const BLEND_MS = 30 * 60 * 1000;
  const tNow = now.getTime();
  const tSunrise = sunrise.getTime();
  const tSunset = sunset.getTime();

  const span = tSunset - tSunrise;
  const pos = span > 0 ? (tNow - tSunrise) / span : 0.5;

  const blendFrac = BLEND_MS / span;
  let t: number;
  if (pos <= 0.5 - blendFrac) {
    t = 0;
  } else if (pos >= 0.5 + blendFrac) {
    t = 1;
  } else {
    const x = (pos - (0.5 - blendFrac)) / (2 * blendFrac);
    t = x * x * (3 - 2 * x);
  }

  const offset = sunriseOffset + t * (sunsetOffset - sunriseOffset);
  return sunAltitude - offset;
}

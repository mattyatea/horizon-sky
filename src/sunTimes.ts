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
  // キャッシュ用Mapを静的に保持
  const globalAny = globalThis as any;
  if (!globalAny.__sunTimesCache) {
    globalAny.__sunTimesCache = new Map();
  }
  const cache: Map<string, Promise<SunTimes>> = globalAny.__sunTimesCache;

  const tzOffsetMinutes = Math.round(longitude / 15) * 60;
  const localDate = new Date(date.getTime() + tzOffsetMinutes * 60 * 1000);
  const dateStr = [
    localDate.getUTCFullYear(),
    String(localDate.getUTCMonth() + 1).padStart(2, "0"),
    String(localDate.getUTCDate()).padStart(2, "0"),
  ].join("-");

  // providerの区別も含めてキャッシュキーを生成
  const providerId = provider === defaultSunTimesProvider ? "default" : provider.toString();
  // 座標を丸めてキャッシュキーにする (連続的なスライダー変更によるDoSを防ぐため)
  const roundedLat = Math.round(latitude);
  const roundedLng = Math.round(longitude);
  const cacheKey = `${roundedLat},${roundedLng},${dateStr},${providerId}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const promise = (async () => {
    const result = await provider({ latitude, longitude, date: dateStr });
    const sunTimes: SunTimes = {
      sunrise: result.sunrise instanceof Date ? result.sunrise : new Date(result.sunrise),
      sunset: result.sunset instanceof Date ? result.sunset : new Date(result.sunset),
    };
    return sunTimes;
  })();

  cache.set(cacheKey, promise);

  try {
    return await promise;
  } catch (err) {
    cache.delete(cacheKey);
    throw err;
  }
}

export function correctAltitude(
  now: Date,
  sunAltitude: number,
  sunTimes: SunTimes,
  _latitude: number,
  _longitude: number,
): number {
  const { sunrise, sunset } = sunTimes;
  
  const tNow = now.getTime();
  const tSunrise = sunrise.getTime();
  const tSunset = sunset.getTime();
  
  // Calculate how far we are through the day
  const daySpan = tSunset - tSunrise;
  if (daySpan <= 0) return sunAltitude;
  
  // Calculate position in day (0 = sunrise, 1 = sunset)
  const dayPos = (tNow - tSunrise) / daySpan;
  
  // Only apply correction during twilight transition periods
  // (30 minutes before/after sunrise/sunset)
  const TWILIGHT_MS = 30 * 60 * 1000;
  
  // Calculate the offset: how far past sunrise or before sunset we are
  // This gives a gentle bias rather than aggressive shifting
  let bias: number;
  
  if (dayPos < 0) {
    // Before sunrise - we're approaching dawn
    const timeToSunrise = tSunrise - tNow;
    if (timeToSunrise > TWILIGHT_MS * 2) {
      return sunAltitude; // Too far before sunrise, no correction needed
    }
    // Smooth ramp up as we approach sunrise
    const t = 1 - (timeToSunrise / (TWILIGHT_MS * 2));
    const smoothT = t * t * (3 - 2 * t);
    // Add a small positive bias to bring forward the dawn colors
    bias = -smoothT * 0.5 * (Math.PI / 180); // -0.5 degrees max
  } else if (dayPos > 1) {
    // After sunset - we're approaching dusk
    const timeSinceSunset = tNow - tSunset;
    if (timeSinceSunset > TWILIGHT_MS * 2) {
      return sunAltitude; // Too far after sunset, no correction needed
    }
    // Smooth ramp up as we approach sunset
    const t = 1 - (timeSinceSunset / (TWILIGHT_MS * 2));
    const smoothT = t * t * (3 - 2 * t);
    // Add a small positive bias to extend the sunset colors
    bias = -smoothT * 0.5 * (Math.PI / 180); // -0.5 degrees max
  } else {
    // During daytime - no correction needed, multiple scattering handles transitions
    return sunAltitude;
  }
  
  return sunAltitude + bias;
}
# horizon-sky
> Part of [horizon](https://github.com/dnlzro/horizon) — physics-based sky gradient renderer for the web.

Physics-based sky gradient renderer. Given a date/time and geographic coordinates, returns a CSS `linear-gradient` that accurately represents the current sky — including sunrise, daytime, sunset, and night.

Powered by [suncalc](https://github.com/mourner/suncalc) for sun position calculations. Works in any environment that supports the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) (browsers, Node.js 18+, Deno, Bun, Cloudflare Workers, etc.) for optional sunrise/sunset correction.

## Installation

```bash
npm install horizon-sky
```

## Quick Start

```ts
import { computeSky } from "horizon-sky";

const sky = await computeSky({
  date: new Date(),
  latitude: 35.6895,
  longitude: 139.6917,
});

document.body.style.background = sky.gradient;
```

## API

### `computeSky(options)` — static mode

Compute the sky for a specific date and location. Returns a `Promise<SkyResult>`.

```ts
import { computeSky } from "horizon-sky";

const sky = await computeSky({
  date: new Date("2026-06-21T06:00:00+09:00"),
  latitude: 35.6895,
  longitude: 139.6917,
});
```

**Options:**

| Field | Type | Required | Description |
|---|---|---|---|
| `date` | `Date` | ✅ | The date and time to render the sky for |
| `latitude` | `number` | ✅ | Latitude in degrees (-90 to 90) |
| `longitude` | `number` | ✅ | Longitude in degrees (-180 to 180) |
| `sunTimes` | `SunTimesOption` | — | Enable sunrise/sunset altitude correction (see below) |
| `bortle` | `number` | — | Bortle scale (1-9) for light pollution correction |

**`SunTimesOption`:**

```ts
// Disabled (default) — no correction applied
sunTimes: false

// Enabled with a custom provider
sunTimes: { provider: myCustomProvider }
```

**Returns: `SkyResult`**

```ts
interface SkyResult {
  gradient: string;
  topColor: string;
  bottomColor: string;
  altitude: number;
  azimuth: number;
  correctedAltitude?: number;
  sunrise?: Date;
  sunset?: Date;
}
```

---

### `realtimeSky(options)` — realtime mode

An `AsyncGenerator` that yields a fresh `SkyResult` at a regular interval using the current system time. Stops when the provided `AbortSignal` is aborted.

```ts
import { realtimeSky } from "horizon-sky";

const controller = new AbortController();

for await (const sky of realtimeSky({
  latitude: 35.6895,
  longitude: 139.6917,
  interval: 60_000,
  signal: controller.signal,
  sunTimes: { provider: myCustomProvider },
})) {
  document.body.style.background = sky.gradient;
}
```

To stop the loop:

```ts
controller.abort();
```

**Options:** All fields from `ComputeSkyOptions` except `date` (always uses `new Date()`), plus:

| Field | Type | Default | Description |
|---|---|---|---|
| `interval` | `number` | `60000` | Milliseconds between updates |
| `signal` | `AbortSignal` | — | Cancellation signal |

---

## Sunrise/Sunset Correction

By default, `computeSky` uses the raw solar altitude from orbital mechanics. This is accurate but may produce slightly off colors at exactly sunrise/sunset since the horizon reference differs from the physical model.

When a custom provider is provided via `sunTimes: { provider }`, the library fetches the actual sunrise/sunset times for the given location and date, then corrects the altitude so the gradient transitions precisely at those moments.

### Custom Provider

You must provide a `provider` function to enable sunrise/sunset correction. This gives you full control over the data source.

```ts
import { computeSky } from "horizon-sky";
import type { SunTimesProvider } from "horizon-sky";

const myProvider: SunTimesProvider = async ({ latitude, longitude, date }) => {
  const res = await fetch(`https://my-api.example.com/sun?lat=${latitude}&lng=${longitude}&date=${date}`);
  const data = await res.json();
  return {
    sunrise: data.sunrise_utc,
    sunset: data.sunset_utc,
  };
};

const sky = await computeSky({
  date: new Date(),
  latitude: 35.6895,
  longitude: 139.6917,
  sunTimes: { provider: myProvider },
});
```

#### Provider Interface

```ts
type SunTimesProvider = (params: SunTimesRequest) => Promise<SunTimesResponse>;

interface SunTimesRequest {
  latitude: number;
  longitude: number;
  date: string;
}

interface SunTimesResponse {
  sunrise: Date | string;
  sunset: Date | string;
}
```

**Important:** `sunrise` and `sunset` must represent times in **UTC**. If your API returns local times, convert them before returning.

#### Example: Using a self-hosted API

```ts
const selfHostedProvider: SunTimesProvider = async ({ latitude, longitude, date }) => {
  const res = await fetch(`/api/sun-times?lat=${latitude}&lng=${longitude}&date=${date}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const { sunrise_utc, sunset_utc } = await res.json();
  return { sunrise: sunrise_utc, sunset: sunset_utc };
};
```

Your API endpoint should return a JSON response in this shape:

```json
{
  "sunrise_utc": "2026-06-21T20:14:00+00:00",
  "sunset_utc": "2026-06-22T10:01:00+00:00"
}
```

The field names are flexible — only the `SunTimesResponse` shape returned by your `provider` function matters.

---

## Low-level API

The internal rendering and calculation functions are also exported for advanced use.

```ts
import { renderGradient, getSunPosition } from "horizon-sky";

const pos = getSunPosition(new Date(), 35.6895, 139.6917);
console.log(pos.altitude, pos.azimuth);

const { gradient, topColor, bottomColor } = renderGradient(pos.altitude);
document.body.style.background = gradient;
```

---

## License

MIT. Physical model and parameters derived from:

- ["A Scalable and Production Ready Sky and Atmosphere Rendering Technique"](https://onlinelibrary.wiley.com/doi/10.1111/cgf.14050) — Sébastien Hillaire
- ["Production Sky Rendering"](https://www.shadertoy.com/view/slSXRW) — Andrew Helmer (MIT License)

import { computeSky } from "./compute.js";
import type { ComputeSkyOptions, SkyResult } from "./compute.js";

export interface RealtimeSkyOptions extends Omit<ComputeSkyOptions, "date"> {
  interval?: number;
  signal?: AbortSignal;
}

export async function* realtimeSky(options: RealtimeSkyOptions): AsyncGenerator<SkyResult> {
  const { interval = 60_000, signal, ...computeOptions } = options;

  while (!signal?.aborted) {
    const date = new Date();
    yield await computeSky({ ...computeOptions, date });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, interval);
      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }
    }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      throw err;
    });
  }
}

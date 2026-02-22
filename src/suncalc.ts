import SunCalc from "suncalc";

export interface SunPosition {
  altitude: number;
  azimuth: number;
}

export function getSunPosition(date: Date, lat: number, lng: number): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng);
  return {
    altitude: pos.altitude,
    azimuth: pos.azimuth,
  };
}

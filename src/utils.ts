/** 3-component vector [r/x, g/y, b/z] */
export type Vec3 = [number, number, number];

export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

export function dot(v1: Vec3, v2: Vec3): number {
  return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

export function len(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function norm(v: Vec3): Vec3 {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function add(v1: Vec3, v2: Vec3): Vec3 {
  return [v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]];
}

export function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function vecExp(v: Vec3): Vec3 {
  return [Math.exp(v[0]), Math.exp(v[1]), Math.exp(v[2])];
}

/** 可复现的伪随机数（mulberry32） */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomHex(r: () => number): string {
  return '#' + [r(), r(), r()].map((x) => Math.floor(x * 256).toString(16).padStart(2, '0')).join('');
}

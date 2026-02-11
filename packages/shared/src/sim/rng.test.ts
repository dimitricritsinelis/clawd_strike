import { describe, expect, it } from "vitest";

import { hashSeed, lcg, rand01 } from "./rng";

describe("rng", () => {
  it("hashSeed is deterministic", () => {
    expect(hashSeed("wall")).toBe(hashSeed("wall"));
    expect(hashSeed("wall")).not.toBe(hashSeed("floor"));
  });

  it("lcg + rand01 produce deterministic [0,1) samples", () => {
    const a = lcg(12345);
    const b = lcg(12345);
    const seqA = [rand01(a), rand01(a), rand01(a), rand01(a)];
    const seqB = [rand01(b), rand01(b), rand01(b), rand01(b)];
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});


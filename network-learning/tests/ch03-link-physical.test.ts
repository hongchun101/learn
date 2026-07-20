import { describe, it, expect } from 'vitest';
import {
  powerToDb,
  amplitudeToDb,
  dbToPower,
  dbToAmplitude,
  sumDb,
  shannonCapacity,
  shannonCapacityDb,
  nyquistRate,
  spectralEfficiency,
  freeSpacePathLoss,
  linkMarginDb,
  requiredSnrDb,
  SHANNON_LIMIT_DB,
  MODULATION_BPS,
  REQUIRED_EBN0_DB,
  nrzEncode,
  nrziEncode,
  manchesterEncode,
  manchesterDecode,
  encode8b10b,
  encode8b10bStream,
  decode8b10bStream,
  demo as ch03Demo,
} from '../src/03-link-physical/index.js';

describe('03 — dB helpers', () => {
  it('powerToDb / dbToPower are inverses', () => {
    for (const p of [0.001, 0.1, 1, 10, 1000]) {
      expect(dbToPower(powerToDb(p))).toBeCloseTo(p, 10);
    }
  });

  it('amplitudeToDb / dbToAmplitude are inverses', () => {
    for (const a of [0.001, 0.1, 1, 10, 1000]) {
      expect(dbToAmplitude(amplitudeToDb(a))).toBeCloseTo(a, 10);
    }
  });

  it('sumDb sums powers expressed in dB', () => {
    // 10 dB + 10 dB ≈ 13.01 dB
    expect(sumDb(10, 10)).toBeCloseTo(13.0103, 3);
  });

  it('throws on non-positive', () => {
    expect(() => powerToDb(0)).toThrow();
    expect(() => powerToDb(-1)).toThrow();
  });
});

describe('03 — Shannon and Nyquist', () => {
  it('shannonCapacity matches the formula', () => {
    // C = B log2(1 + S/N)
    const c = shannonCapacity(1, 1);
    expect(c).toBeCloseTo(1, 12); // log2(2) = 1
  });

  it('shannonCapacityDb agrees with shannonCapacity', () => {
    expect(shannonCapacityDb(1e6, 20)).toBeCloseTo(shannonCapacity(1e6, dbToPower(20)), 6);
  });

  it('spectral efficiency equals log2(1 + S/N)', () => {
    expect(spectralEfficiency(3)).toBeCloseTo(2, 12);
    expect(spectralEfficiency(15)).toBeCloseTo(4, 12);
  });

  it('nyquist rate is 2 × bandwidth', () => {
    expect(nyquistRate(4000)).toBe(8000);
  });

  it('shannon limit is approximately -1.59 dB', () => {
    expect(SHANNON_LIMIT_DB).toBeCloseTo(-1.591_75, 4);
  });
});

describe('03 — Link budget', () => {
  it('free-space path loss grows with distance and frequency', () => {
    const a = freeSpacePathLoss(100, 2.4e9);
    const b = freeSpacePathLoss(1000, 2.4e9);
    const c = freeSpacePathLoss(100, 5e9);
    expect(b - a).toBeCloseTo(20, 6); // 10× distance → +20 dB
    expect(c - a).toBeCloseTo(20 * Math.log10(5 / 2.4), 6);
  });

  it('link margin = received power - sensitivity', () => {
    const margin = linkMarginDb({
      txPowerDbm: 20,
      txAntennaGainDbi: 0,
      rxAntennaGainDbi: 0,
      pathLossDb: 100,
      rxSensitivityDbm: -90,
    });
    expect(margin).toBe(10);
  });
});

describe('03 — Modulation table', () => {
  it('BPSK has 1 b/sym, 256-QAM has 8', () => {
    expect(MODULATION_BPS['BPSK']).toBe(1);
    expect(MODULATION_BPS['256QAM']).toBe(8);
  });

  it('requiredSnrDb matches Shannon: S/N = 2^bps - 1', () => {
    for (const [m, bps] of Object.entries(MODULATION_BPS)) {
      const expected = powerToDb(Math.pow(2, bps) - 1);
      expect(requiredSnrDb(m as keyof typeof MODULATION_BPS)).toBeCloseTo(expected, 6);
    }
  });

  it('practical Eb/N0 is above the Shannon limit', () => {
    for (const required of Object.values(REQUIRED_EBN0_DB)) {
      expect(required).toBeGreaterThan(SHANNON_LIMIT_DB);
    }
  });
});

describe('03 — Line coding', () => {
  it('NRZ is the identity', () => {
    expect(nrzEncode([0, 1, 0, 1])).toEqual([0, 1, 0, 1]);
  });

  it('NRZI toggles on 1s, holds on 0s', () => {
    expect(nrziEncode([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
    expect(nrziEncode([1, 1, 1, 1])).toEqual([1, 0, 1, 0]);
    expect(nrziEncode([1, 0, 1, 0, 0])).toEqual([1, 1, 0, 0, 0]);
  });

  it('Manchester doubles the bit rate', () => {
    const bits = [0, 1, 1, 0, 1];
    const sym = manchesterEncode(bits);
    expect(sym.length).toBe(bits.length * 2);
    expect(manchesterDecode(sym)).toEqual(bits);
  });

  it('Manchester decode rejects invalid sequences', () => {
    expect(manchesterDecode([0, 0])).toBeNull();
    expect(manchesterDecode([1, 1])).toBeNull();
  });
});

describe('03 — 8b/10b', () => {
  it('encodes every byte and decodes back to the same value', () => {
    for (let b = 0; b < 256; b++) {
      const syms = encode8b10bStream([b]);
      expect(syms).toHaveLength(1);
      const dec = decode8b10bStream(syms);
      expect(dec[0]).toBe(b);
    }
  });

  it('runs through a longer payload and round-trips', () => {
    const payload = Array.from({ length: 32 }, (_, i) => (i * 17) & 0xff);
    const enc = encode8b10bStream(payload);
    const dec = decode8b10bStream(enc);
    expect(dec).toEqual(payload);
  });

  it('running disparity is bounded in [-1, +1] for any stream', () => {
    const payload = Array.from({ length: 100 }, () => Math.floor(Math.random() * 256));
    let rd: -1 | 0 | 1 = -1;
    for (const b of payload) {
      const enc = encode8b10b(b, rd);
      expect([-1, 0, 1]).toContain(enc.runningDisparity);
      rd = enc.runningDisparity;
    }
  });
});

describe('03 — demo runs end-to-end', () => {
  it('executes the demo', () => {
    expect(() => ch03Demo()).not.toThrow();
  });
});

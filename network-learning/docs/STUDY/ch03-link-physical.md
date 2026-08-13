# Chapter 03 — Link & Physical Layer

## Goal

After this chapter you should be able to:

- Translate between linear power and dB/dBm.
- Compute a link budget and read the result.
- State the Shannon-Hartley theorem and the Shannon limit.
- Explain the difference between BPSK, QPSK, 16-QAM, and 256-QAM by
  bits-per-symbol and required SNR.
- Encode/decode NRZ, NRZI, Manchester, and 8b/10b.

## Prerequisites

Comfort with basic algebra and `log10`. No code from chapter 1 is
required, but the bit packing will feel familiar.

## Walkthrough

1. **dB helpers.** `powerToDb`, `dbToPower`, `sumDb`. These are
   inverses. `sumDb` uses the standard rule:
   `10 * log10(10^(a/10) + 10^(b/10) + ...)`.
2. **Shannon.** `shannonCapacity(bw, snrLinear)` returns bits/sec.
   `shannonCapacityDb` accepts dB. The limit `-1.59 dB` is the
   minimum Eb/N0 for any coding scheme.
3. **Link budget.** `receivedPowerDbm(b)` and `linkMarginDb(b)`
   compute the RSS and the margin over the receiver sensitivity.
   `freeSpacePathLoss(d, f)` is the textbook FSPL formula.
4. **Modulation.** `MODULATION_BPS` and `REQUIRED_EBN0_DB` are
   data-only; an expert should be able to draw the constellation
   on paper.
5. **Line coding.** `nrzEncode`, `nrziEncode`, `manchesterEncode`/
   `Decode`, `encode8b10b`/`encode8b10bStream`/`decode8b10bStream`.

`8b/10b` is the most interesting: every 8-bit byte becomes a 10-bit
symbol with **DC-balance** (running disparity pulled toward 0) and
**clock-recovery** guaranteed. Used by PCIe, SATA, USB 3, DisplayPort,
Thunderbolt, Fibre Channel, 1000BASE-X, 10GBASE-R (via 64b/66b).

Run `npx tsx src/03-link-physical/demo.ts` to see every primitive
fire.

## Exercises

1. **Link budget.** A Wi-Fi AP at 20 dBm, 6 dBi gain, transmits 50 m
   to a client at 2.4 GHz. Cable / connector loss = 1 dB. Client
   antenna gain = 2 dBi. Client sensitivity = -82 dBm. Does the link
   close?
2. **Shannon headroom.** A 20 MHz channel at SNR = 18 dB. What is
   the capacity? What is the spectral efficiency?
3. **Modulation choice.** For a link budget that closes at 12 dB SNR,
   which of BPSK / QPSK / 16-QAM / 64-QAM is realistic? (Use
   `REQUIRED_EBN0_DB` plus the implementation loss.)
4. **Manchester.** Encode `bits = [1, 0, 1, 1]`. Confirm the symbol
   stream has transitions every bit time.
5. **8b/10b.** Encode `0x55` and decode the 10-bit symbol back. The
   alphabet has both a "RD=-1" and a "RD=+1" variant; the encoder
   picks the one that brings running disparity toward 0.

### Answers (sketch)

1. `fspl(50, 2.4e9) ≈ 78 dB`.
   `rx = 20 + 6 - 78 - 1 + 2 = -51 dBm`. Margin = `-51 - (-82) = 31 dB`.
   Link closes with margin.
2. `C = 20e6 * log2(1 + 10^1.8) ≈ 20 MHz * ~6.4 b/s/Hz ≈ 128 Mbps`.
3. 12 dB SNR is roughly enough for 16-QAM at a low BER, marginal at
   64-QAM. BPSK and QPSK always work; 16-QAM depends on the channel.
4. Manchester of `[1,0,1,1]` is `10 01 10 01` (each bit is a
   low-to-high or high-to-low transition).
5. 8b/10b is in `shannon.ts`; the running disparity is tracked per
   encoded symbol.

## Common pitfalls

- **dB vs dBm.** dB is a ratio; dBm is referenced to 1 mW. Mixing
  them is a classic mistake.
- **Required SNR vs required Eb/N0.** Eb/N0 is normalized to bit rate;
  SNR is total signal to noise. Convert with the bits/symbol and the
  coding rate.
- **8b/10b alphabet.** The chapter uses the data-only mapping; K
  characters (control symbols) are reserved. Wave a glass at PCIe;
  the COM/comma characters are how link partners align.
- **Manchester violations.** Long runs of identical symbols are
  forbidden by Manchester; if you see them, the link is corrupted.

## Interview questions

1. **State Shannon's theorem.** Capacity = bandwidth × log2(1 + SNR).
2. **What's the Shannon limit?** `-1.59 dB` Eb/N0. Real codes
   approach within 0.1 dB.
3. **Why does 8b/10b use 10 bits per byte?** DC-balance and a
   guaranteed run length ≤ 5, plus a `comma` symbol for alignment.
4. **Why BPSK at low SNR?** Only one bit per symbol but the lowest
   required Eb/N0. Throughput is low; reliability is high.
5. **What is "link margin"?** `rxPower - rxSensitivity`. Positive
   means the link closes; nobody should ship a negative-margin link.

## What to build

A `linkBudget` walkthrough that takes a configuration object and
prints the receiver power, the SNR, the achievable modulation, and
the chosen throughput. This is the kind of calculation a wireless
engineer does in their head daily.

## References

- Shannon, "A Mathematical Theory of Communication", 1948.
- Nyquist, "Certain Topics in Telegraph Transmission Theory", 1928.
- IEEE 802.3-2018, clauses 36 (1000BASE-X) and 49 (10GBASE-R).
- Widmer & Franaszek, "A DC-Balanced, Partitioned-Block, 8B/10B
  Transmission Code", IBM J. Res. Dev. 27(5), 1983.

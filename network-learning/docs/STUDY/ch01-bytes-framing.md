# Chapter 01 — Bits, Framing, and Error Coding

## Goal

Every wire protocol is a sequence of bits. After this chapter you should
be able to:

- Treat a byte as 8 ordered bits and read/write sub-byte fields.
- Recognize and choose between the three framing families.
- Detect errors with CRC-8, CRC-16, CRC-32, and the Internet checksum.
- Correct single-bit errors with Hamming(7,4) and small burst errors with
  Reed-Solomon.

## Prerequisites

None. This is the first chapter.

## Walkthrough

Read the source in this order:

1. `bits.ts` — `BitCursor`, `BitWriter`, `getBit`, `setBit`, `toHex`.
   Notice that `BitCursor.readBits(n)` reads MSB-first within each byte:
   that is the order every "network" wire format we ship uses.
2. `framing.ts` — three families:
   - **Length-prefixed** (`encodeU8Frame`, `encodeU16BeFrame`,
     `encodeU32LeFrame`). Cheap, deterministic, no escaping; the
     payload must be `≤ 2^bits - 1`.
   - **Delimiter-based** (`splitOnDelim`, `withDelim`). Used by
     HTTP/1.1, SMTP, IRC. The payload must not contain the sentinel.
   - **Self-synchronizing** (`cobsEncode`, `cobsDecode`). Resyncs after
     corruption within one byte of the bad spot. Used by BACnet, ROM
     bootloader protocols, embedded sensors.
3. `error-coding.ts` — three things:
   - **CRC** for detection (crc8, crc16Ccitt, crc32). CRCs are
     designed to catch all single-bit errors and most multi-bit errors.
   - **Internet checksum** for legacy reasons (IPv4, ICMP, TCP, UDP).
     Weaker than CRC-32 but cheap, and rolls seamlessly with the
     pseudo-header.
   - **Hamming(7,4)** for single-error correction in storage and
     embedded contexts.
   - **RS(7,3)** over GF(2^3) for byte-error correction. The same
     construction underlies production RS(255, k) in DVB, QR codes, and
     DataMatrix.

Run `npx tsx src/01-bytes-framing/demo.ts` to see every primitive
produce real bytes.

## Exercises

Try these on paper or in a scratch file before reading the answers.

1. **Hex round-trip.** Write a function `bytesFromHex("05 48 65 6c 6c 6f")`
   that returns `Uint8Array.from([0x05, 0x48, ...])`, then encode it as
   a u8-length-prefixed frame.
2. **Pack a 3-bit field.** Use `BitWriter` to pack three values: a
   3-bit colour, a 1-bit flag, and a 4-bit counter. Decode the same
   bytes with `BitCursor`.
3. **Compare CRCs.** Compute CRC-8, CRC-16-CCITT, and CRC-32 on
   `"123456789"` and confirm against the canonical vectors:
   `0xF4`, `0x29B1`, `0xCBF43926`.
4. **Single-bit flip.** Take `hamming74EncodeNibble(0b1011)`, flip
   bit 4, run `hamming74Decode`, and confirm `correctedBit === 4`.
5. **RS-correct one.** Inject a one-byte error into an RS(7,3)
   codeword and call `rs73CorrectOne`. Verify the result passes
   `rs73IsValid`.

### Answers (sketch)

1. `toHex`/`fromHex` ship in `bits.ts`; the u8 frame is
   `05 48 65 6c 6c 6f`.
2. `b.writeBits(0b101, 3); b.writeBit(1); b.writeBits(0b1100, 4);`
   → `0xBC`.
3. The canonical polynomials are 0x07, 0x1021, 0xEDB88320.
4. The decode should report the corrected bit.
5. The codeword should be valid after correction.

## Common pitfalls

- **Off-by-one bit.** `BitCursor.readBits(12)` is not the same as
  `readBits(8) + readBits(4)`. Stay MSB-first.
- **Endianness of CRC.** `verifyCrc32` expects the CRC to be appended
  big-endian. Check the protocol's spec before swapping.
- **Internet checksum end-around.** The algorithm uses 16-bit
  one's-complement addition. If you compute it then flip the bits, you
  are doing it wrong.
- **RS is not magic.** RS(7,3) can correct **up to 2 byte errors** per
  codeword. Three errors and `rs73CorrectOne` returns `null`.

## Interview questions

1. **Why length-prefix a frame when you can use a delimiter?** Because
   payloads can contain the delimiter, and escaping adds complexity
   and a new class of bugs.
2. **What's the difference between detection and correction?** A CRC
   can detect errors; a Hamming / RS code can correct them. Detection
   is cheaper per bit; correction costs overhead.
3. **Why COBS and not just length-prefix?** COBS gives you a single
   sentinel byte (0x00) that can never appear in the payload, so the
   receiver can re-sync after a corruption within one byte. Useful on
   noisy media (RS-485, BACnet, bootloader protocols).
4. **Why is CRC-32 good at detecting errors that the Internet checksum
   misses?** CRC-32 uses the full polynomial division; the Internet
   checksum is a simple 16-bit sum that can miss same-position
   bit-flips in two bytes.
5. **What is the minimum Hamming distance of Hamming(7,4)?** 3. That's
   why it can correct 1 and detect 2.

## What to build

A tiny `BinaryReader` / `BinaryWriter` over `DataView` that re-uses
the chapter's primitives for varint, length-prefixed strings, and
CRC-32 verified messages. You'll reach for this in every later chapter.

## References

- Williams, "Painless Guide to CRC Error Detection Algorithms".
- Hamming, "Error detecting and error correcting codes", Bell System
  Technical Journal, 1950.
- RFC 1071 — Computing the Internet Checksum.
- Cheshire & Baker, "Consistent Overhead Byte Stuffing", 1997.

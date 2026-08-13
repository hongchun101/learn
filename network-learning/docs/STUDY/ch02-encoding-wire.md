# Chapter 02 — Encoding & Wire Formats

## Goal

After this chapter you should be able to:

- Pick the right integer encoding (fixed-width, varint, zig-zag) for a
  given field.
- Spot TLV, KLV, and field-tagged (Protobuf) wire formats in the wild.
- Read and write IEEE 754 binary16 and Q-format fixed-point.
- Encode a small structured record in two different wire formats and
  choose between them.

## Prerequisites

Chapter 01.

## Walkthrough

1. `endianness.ts` — three families:
   - **u8/u16/u32/u64** in big-endian (network order) and little-endian.
     Big-endian is dominant on the wire (TCP, UDP, IP, DNS, TLS, HTTP,
     BGP, RADIUS). Little-endian is dominant on disk and in modern CPU
     ISAs.
   - **Signed** numbers use two's complement. The chapter also ships
     zig-zag (Protobuf's `sint32`) for signed values whose magnitude
     is usually small.
   - **Fixed-point** Q-format and **binary16** for DSP/firmware and
     graphics/ML use cases.
2. `varint.ts` — three varint families:
   - **LEB128** (Protobuf, QUIC varint, SBE, FlatBuffers, Thrift compact).
   - **Signed LEB128** (DWARF, WebAssembly).
   - **SQLite varint** (1–9 bytes, different continuation rule).
   - **BER length** (ASN.1, X.509, LDAP).
3. `klv.ts` — three structured styles:
   - **TLV** (Type-Length-Value). 1-byte type, 1-byte length, payload.
   - **KLV** (Key-Length-Value). 16-bit key (SMPTE ST 336), BER length.
   - **Protobuf-style** tag (varint) + wire type (varint) + value.

Run `npx tsx src/02-encoding-wire/demo.ts` to see encoding/decoding
for every family.

## Exercises

1. **Round-trip a u64.** Use `u64Be(0xFFFF_FFFF_FFFF_FFFFn)` and
   `readU64Be` to confirm the big-endian byte order.
2. **Zig-zag.** Compare `zigzag32(-1)` to `zigzag32(1)`. Why is the
   mapping `(n << 1) ^ (n >> 31)`?
3. **Encode a record.** Encode `{id: 1, name: "alice"}` as TLV
   u8 and as Protobuf-tagged. Compare the byte counts.
4. **BER length.** Encode 200 as a BER length. Confirm that
   `decodeBerLength` parses it back to 200.
5. **f16 trap.** Encode `0.1` as `f16Be`. Confirm round-trip is
   `0.0999755859375`. This is the same as serializing a 16-bit float
   in any ML framework.

### Answers (sketch)

1. The bytes are `ff ff ff ff ff ff ff ff` big-endian.
2. Zig-zag interleaves negatives with positives so small magnitudes
   stay small on the wire.
3. TLV: `01 05 61 6c 69 63 65`. Protobuf-style: `08 01 12 05 ...`.
4. `81 c8`. The high bit means "long form", the next byte is the
   length-of-length.
5. f16 has a 10-bit mantissa; `0.1` cannot be represented exactly.

## Common pitfalls

- **Endianness of the CRC.** Many protocols calculate CRC-32 over the
  bytes in the order they appear on the wire (big-endian).
- **Varint sign extension.** Signed LEB128 sign-extends; read the
  protocol's spec to know if you want zig-zag or two's complement.
- **TLV vs typed-array confusion.** TLV iterates records of mixed
  type; an array iterates records of one type. Don't confuse them.
- **Protobuf wire type != field type.** "Wire type 2" means
  length-delimited; the field type is a separate concept (defined by
  the schema).

## Interview questions

1. **Why does Protobuf use zig-zag for `sint32`?** Because a signed
   varint would always be 10 bytes for negative values; zig-zag puts
   small magnitudes in small bytes.
2. **What's the difference between TLV and KLV?** Mostly the key
   width and the length encoding. KLV is conventionally called
   KLV when the key is a 16-bit UL or OID (SMPTE ST 336).
3. **When would you use a varint?** When most values are small and
   you want to keep the wire format self-describing.
4. **Trade-off: big-endian vs little-endian?** Big-endian is the
   "network" default; little-endian matches most CPUs. The choice
   is a wire-format commitment; once made, you cannot change it
   without breaking every deployment.
5. **Why Q-format?** Because many embedded DSPs lack a float unit.
   A Q15.16 multiply is a 32-bit integer multiply.

## What to build

A `MessageFrame` codec that wires typed records (TLV entries) into a
length-prefixed frame using chapter 1's `encodeU8Frame`. You now have
a serializer that supports adding new field types without breaking
existing readers.

## References

- RFC 9000 (QUIC varint).
- SMPTE ST 336 (KLV).
- Protobuf encoding guide.
- IEEE 754 binary16 specification.

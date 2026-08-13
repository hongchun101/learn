# Chapter 04 — Ethernet II, IPv4/IPv6, ARP, ICMP

## Goal

After this chapter you should be able to:

- Decode an IPv4 header by hand.
- Compute CIDR membership and recognise private/loopback ranges.
- Decode an IPv6 header, including extension headers.
- Generate the link-local IPv6 from a MAC address.
- Read and write an ARP request and an ICMP echo.

## Prerequisites

Chapter 01 (BitCursor) and Chapter 02 (endianness).

## Walkthrough

1. **MAC / IPv4 / IPv6.** `macToString`, `ipv4ToString`, `ipv6ToString`
   plus the parse side. IPv6 puts `::` for the longest zero run.
2. **Ethernet.** `encodeEthernet`/`decodeEthernet`. The 4-byte FCS is
   CRC-32 over the frame without the trailing 4 bytes.
3. **IPv4.** 20-byte minimum. Options are present if `IHL > 5`.
   `encodeIpv4` writes the header with the header checksum (RFC 1071).
4. **IPv6.** 40 bytes fixed. Extension headers (Hop-by-Hop, Routing,
   Fragment, Destination Options) chain via the `nextHeader` field.
   `ipv6LinkLocalFromMac` uses the modified EUI-64 rule.
5. **ARP.** `encodeArp`/`decodeArp`. Two operational opcodes: 1 = request,
   2 = reply.
6. **ICMP.** `encodeIcmpEcho`/`decodeIcmpEcho`. The classic `ping`.

Run `npx tsx src/04-ethernet-ip/demo.ts` to see every protocol print
its bytes.

## Exercises

1. **Decode a hex dump.** Given `ff ff ff ff ff ff 00 11 22 33 44 55 08 00 ...`,
   say which protocol is next (ethertype `0x0800`).
2. **CIDR.** Is `10.0.5.7` in `10.0.0.0/8`? Write a one-liner.
3. **IPv6 link-local.** For MAC `02:42:ac:11:00:02`, compute the
   link-local. The `02` first byte becomes `02` (U/L bit flipped).
4. **Checksum.** Hand-compute the IPv4 header checksum for
   `45 00 00 1c 00 01 00 00 40 06 00 00 7f 00 00 01 7f 00 00 01`.
5. **ARP.** Encode an ARP request from `192.168.1.1` asking who has
   `192.168.1.2`. Decode a known request and check every field.

### Answers (sketch)

1. ARP (`0x0806`) or IPv4 (`0x0800`). The first 6 bytes are the
   broadcast destination.
2. Yes. `ipv4CidrMatch` handles this directly.
3. `fe80::042:acff:fe11:0002` (after the modified EUI-64 transform).
4. The sum is zero; that's how the receiver verifies it.
5. ARP has 28 bytes for IPv4-over-Ethernet (8 bytes header + 18 bytes
   payload).

## Common pitfalls

- **Byte order on the wire.** IPv4 is big-endian. The C struct you
  remember from `csapp` is the same.
- **IPv4 options.** They're rare but real (Record Route, Timestamp).
  Don't forget to multiply by 4 when reading the IHL field.
- **IPv6 extension headers.** They chain via `nextHeader`. The final
  `nextHeader` is the transport-layer protocol.
- **Multicast vs broadcast.** IPv6 doesn't broadcast. It uses multicast
  + solicited-node.

## Interview questions

1. **Why IPv6's link-local from MAC?** Because the host can self-
   allocate without DHCP or SLAAC.
2. **Why is the IPv4 header checksum weak?** It's a 16-bit sum,
   not a CRC. It catches the same bit-flip in two bytes.
3. **What's the smallest valid IPv4 header?** 20 bytes; IHL = 5.
4. **Why does IPv6 drop the header checksum?** Because the link and
   transport layers both have checksums. Removing it saves work per
   hop.
5. **What does ARP solve?** The "I have an IP, I need a MAC"
   problem. Without it, IP cannot be transmitted on a LAN.

## What to build

A `PcapRecord` round-tripper: read a small PCAP file (just the
global header + a few records), parse the Ethernet/IPv4/TCP/UDP
payload, and print a one-line summary. PCAP is one of the most
useful on-the-job formats.

## References

- RFC 826 (ARP).
- RFC 791 (IPv4).
- RFC 8200 (IPv6).
- RFC 1071 (Internet checksum).
- IEEE 802.3 (Ethernet).

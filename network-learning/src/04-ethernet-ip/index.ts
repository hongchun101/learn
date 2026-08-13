// =============================================================================
// Chapter 04 — Ethernet II, ARP, IPv4, IPv6, ICMP
// =============================================================================
// Goal: this is the layer where the textbook "TCP/IP stack" first becomes
// visible. Every packet on a LAN, an intranet, or the public Internet
// traverses a sequence of headers built from this chapter. We implement
// the wire formats, not the kernel forwarding logic.
//
// Sections:
//   1. Ethernet II (IEEE 802.3) frame: 6-byte MAC DA/SA + 2-byte Ethertype
//      + payload + 4-byte FCS. Includes the LLC/SNAP bridge to 802.2.
//   2. IPv4 header: 20-byte minimum, options, fragmentation/reassembly,
//      CIDR, address classification.
//   3. IPv6 header: 40-byte fixed, extension headers (Hop-by-Hop, Routing,
//      Fragment, Destination Options), NDP, link-local addresses.
//   4. ARP (RFC 826) request/reply.
//   5. ICMPv4 (RFC 792) and ICMPv6 (RFC 4443) — Echo, Destination
//      Unreachable, Time Exceeded, Neighbor Discovery.
//
// All functions are pure: they take/return typed structures and Uint8Array.
// =============================================================================
// Prerequisites: Chapter 01 (BitCursor) and Chapter 02 (endianness).
// Why it matters: this is the layer where the textbook "TCP/IP stack" first
// becomes visible. Every packet on a LAN, an intranet, or the public
// Internet traverses a sequence of headers built from this chapter. Being
// able to decode a pcap by hand is what separates a thinking operator
// from a button-masher.
// Key invariants:
//   * IPv4 is big-endian on the wire; the header checksum is the
//     Internet checksum (RFC 1071) over the header with the checksum
//     field set to zero.
//   * IPv6 has a 40-byte fixed header, no checksum, and a chain of
//     extension headers indexed by `nextHeader`.
//   * IPv6 link-local is `fe80::/10`; the IID is the modified EUI-64
//     derived from the MAC (flip the U/L bit).
//   * ARP for IPv4 over Ethernet is 28 bytes (8 header + 18 payload).
// Common pitfalls:
//   * Forgetting IHL includes the options; the minimum is 5 (20 bytes).
//   * Treating IPv6 extension headers as optional — they chain.
//   * Using `IPv4 broadcast` on IPv6 — IPv6 uses multicast only.
// Interview-ready summary: I can decode an IPv4 header, an IPv6 header,
// an ARP request, and an ICMP echo by hand, and explain the modifications
// that yield the link-local IID.

export {
  macToString,
  macFromString,
  ipv4ToString,
  ipv4FromString,
  ipv6ToString,
  ipv6FromString,
  ipv4Class,
  ipv4IsPrivate,
  ipv4IsLoopback,
  ipv4CidrMatch,
  encodeEthernet,
  decodeEthernet,
  ethernetFcs,
  encodeIpv4,
  decodeIpv4,
  encodeIpv6,
  decodeIpv6,
  ipv6LinkLocalFromMac,
  encodeArp,
  decodeArp,
  encodeIcmpEcho,
  decodeIcmpEcho,
  MAC_BROADCAST,
  ETHERTYPE,
  IP_PROTO,
  ARP_REQUEST,
  ARP_REPLY,
} from './ethernet.js';
export type { MacAddress, Ipv4Address, Ipv6Address, EthernetFrame, Ipv4Header, Ipv6Header, ArpPacket, IcmpEcho } from './ethernet.js';
export { demo } from './demo.js';

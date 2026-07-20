// =============================================================================
// Chapter 04 — Ethernet II, ARP, IPv4, IPv6, ICMP
// =============================================================================
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

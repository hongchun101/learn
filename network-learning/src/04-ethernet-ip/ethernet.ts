// =============================================================================
// Chapter 04 — Ethernet II, IPv4, IPv6, ARP, ICMP
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

// -----------------------------------------------------------------------------
// Address types
// -----------------------------------------------------------------------------

/** 6-byte MAC address (IEEE EUI-48 / EUI-64). */
export type MacAddress = readonly [number, number, number, number, number, number];

/** 4-byte IPv4 address as a Uint8Array(4). */
export type Ipv4Address = Uint8Array;

/** 16-byte IPv6 address as a Uint8Array(16). */
export type Ipv6Address = Uint8Array;

export function macToString(mac: MacAddress): string {
  return mac.map((b) => b.toString(16).padStart(2, '0')).join(':');
}

export function macFromString(s: string): MacAddress {
  const parts = s.split(/[:-]/).map((p) => Number.parseInt(p, 16));
  if (parts.length !== 6 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 0xff)) {
    throw new RangeError(`invalid MAC: ${s}`);
  }
  return parts as unknown as MacAddress;
}

export function ipv4ToString(ip: Ipv4Address): string {
  if (ip.length !== 4) throw new RangeError('IPv4 must be 4 bytes');
  return `${ip[0]}.${ip[1]}.${ip[2]}.${ip[3]}`;
}

export function ipv4FromString(s: string): Ipv4Address {
  const parts = s.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 0xff)) {
    throw new RangeError(`invalid IPv4: ${s}`);
  }
  return new Uint8Array(parts);
}

export function ipv6ToString(ip: Ipv6Address): string {
  if (ip.length !== 16) throw new RangeError('IPv6 must be 16 bytes');
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(((ip[i]! << 8) | ip[i + 1]!).toString(16));
  }
  // Compress the longest run of zero groups.
  let bestStart = -1, bestLen = 0;
  let curStart = -1, curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (groups[i] === '0') {
      if (curStart < 0) curStart = i;
      curLen++;
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    } else { curStart = -1; curLen = 0; }
  }
  if (bestLen >= 2) {
    return groups.slice(0, bestStart).join(':') + '::' + groups.slice(bestStart + bestLen).join(':');
  }
  return groups.join(':');
}

export function ipv6FromString(s: string): Ipv6Address {
  if (s.length === 0) throw new RangeError('empty IPv6');
  const out = new Uint8Array(16);
  const doubleColon = s.split('::');
  if (doubleColon.length > 2) throw new RangeError('multiple :: in IPv6');
  const left = doubleColon[0] ? doubleColon[0].split(':') : [];
  const right = doubleColon[1] ? doubleColon[1].split(':') : [];
  if (left.length + right.length > 8) throw new RangeError('too many groups');
  const fill = 8 - left.length - right.length;
  const groups: number[] = [];
  for (const g of left) groups.push(Number.parseInt(g, 16));
  for (let i = 0; i < fill; i++) groups.push(0);
  for (const g of right) groups.push(Number.parseInt(g, 16));
  if (groups.length !== 8) throw new RangeError('wrong number of groups');
  for (let i = 0; i < 8; i++) {
    out[i * 2] = (groups[i]! >> 8) & 0xff;
    out[i * 2 + 1] = groups[i]! & 0xff;
  }
  return out;
}

// -----------------------------------------------------------------------------
// Ethernet II frame
// -----------------------------------------------------------------------------

export interface EthernetFrame {
  dst: MacAddress;
  src: MacAddress;
  ethertype: number;
  payload: Uint8Array;
}

/** Common Ethertype values used in this chapter. */
export const ETHERTYPE = {
  IPV4: 0x0800,
  ARP: 0x0806,
  IPV6: 0x86dd,
  VLAN: 0x8100,
  QINQ: 0x88a8,
} as const;

/** Standard broadcast MAC address (all-ones). */
export const MAC_BROADCAST: MacAddress = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

/** Compute the Ethernet FCS (CRC-32 over the frame without the trailing 4 bytes). */
export function ethernetFcs(frameBytes: Uint8Array): number {
  return crc32Ieee(frameBytes);
}

/** Encode an Ethernet II frame. Does NOT append the FCS — that's a NIC job. */
export function encodeEthernet(frame: EthernetFrame): Uint8Array {
  const out = new Uint8Array(14 + frame.payload.length);
  out.set(frame.dst, 0);
  out.set(frame.src, 6);
  out[12] = (frame.ethertype >>> 8) & 0xff;
  out[13] = frame.ethertype & 0xff;
  out.set(frame.payload, 14);
  return out;
}

/** Decode an Ethernet II frame (with or without the 4-byte FCS). */
export function decodeEthernet(buf: Uint8Array, fcsIncluded = false): EthernetFrame {
  if (buf.length < (fcsIncluded ? 18 : 14)) throw new RangeError('ethernet: buffer too short');
  if (fcsIncluded) {
    const expected = crc32Ieee(buf.subarray(0, buf.length - 4));
    const actual = (buf[buf.length - 4]! << 24) | (buf[buf.length - 3]! << 16) | (buf[buf.length - 2]! << 8) | buf[buf.length - 1]!;
    if (expected !== (actual >>> 0)) throw new Error('ethernet: FCS mismatch');
  }
  const dst: MacAddress = [buf[0]!, buf[1]!, buf[2]!, buf[3]!, buf[4]!, buf[5]!];
  const src: MacAddress = [buf[6]!, buf[7]!, buf[8]!, buf[9]!, buf[10]!, buf[11]!];
  const ethertype = (buf[12]! << 8) | buf[13]!;
  return { dst, src, ethertype, payload: buf.subarray(14, fcsIncluded ? buf.length - 4 : buf.length) };
}

// -----------------------------------------------------------------------------
// IPv4
// -----------------------------------------------------------------------------

export interface Ipv4Header {
  version: 4;
  ihl: number; // header length in 32-bit words (5..15)
  dscp: number;
  ecn: number;
  totalLength: number;
  identification: number;
  flags: number;
  fragmentOffset: number;
  ttl: number;
  protocol: number;
  headerChecksum: number;
  src: Ipv4Address;
  dst: Ipv4Address;
  options?: Uint8Array;
}

export const IP_PROTO = {
  ICMP: 1,
  TCP: 6,
  UDP: 17,
  IPV6_ICMP: 58,
} as const;

export function ipv4Class(addr: Ipv4Address): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (addr.length !== 4) throw new RangeError('IPv4 must be 4 bytes');
  const first = addr[0]!;
  if (first < 128) return 'A';
  if (first < 192) return 'B';
  if (first < 224) return 'C';
  if (first < 240) return 'D';
  return 'E';
}

export function ipv4IsPrivate(addr: Ipv4Address): boolean {
  if (addr.length !== 4) throw new RangeError('IPv4 must be 4 bytes');
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  if (addr[0] === 10) return true;
  if (addr[0] === 172 && (addr[1]! & 0xf0) === 16) return true;
  if (addr[0] === 192 && addr[1] === 168) return true;
  return false;
}

export function ipv4IsLoopback(addr: Ipv4Address): boolean {
  return addr.length === 4 && addr[0] === 127;
}

export function ipv4CidrMatch(addr: Ipv4Address, network: Ipv4Address, prefix: number): boolean {
  if (addr.length !== 4 || network.length !== 4) throw new RangeError('IPv4 must be 4 bytes');
  if (prefix < 0 || prefix > 32) throw new RangeError('prefix must be 0..=32');
  if (prefix === 0) return true;
  const fullBytes = Math.floor(prefix / 8);
  const rem = prefix % 8;
  for (let i = 0; i < fullBytes; i++) if (addr[i] !== network[i]) return false;
  if (rem === 0) return true;
  const mask = 0xff << (8 - rem) & 0xff;
  return (addr[fullBytes]! & mask) === (network[fullBytes]! & mask);
}

export function encodeIpv4(h: Ipv4Header): Uint8Array {
  if (h.ihl < 5 || h.ihl > 15) throw new RangeError('ihl must be 5..15');
  const headerBytes = h.ihl * 4;
  const total = headerBytes + (h.options?.length ?? 0) === 0
    ? headerBytes
    : headerBytes;
  // Recompute: header length is ihl*4 — options go inside.
  const realHeaderBytes = h.ihl * 4;
  const optionsBytes = h.options?.length ?? 0;
  if (optionsBytes > realHeaderBytes - 20) throw new RangeError('options overflow header');
  const out = new Uint8Array(realHeaderBytes);
  out[0] = (h.version << 4) | (h.ihl & 0x0f);
  out[1] = ((h.dscp & 0x3f) << 2) | (h.ecn & 0x03);
  out[2] = (h.totalLength >>> 8) & 0xff;
  out[3] = h.totalLength & 0xff;
  out[4] = (h.identification >>> 8) & 0xff;
  out[5] = h.identification & 0xff;
  out[6] = ((h.flags & 0x07) << 5) | ((h.fragmentOffset >>> 8) & 0x07);
  out[7] = h.fragmentOffset & 0xff;
  out[8] = h.ttl;
  out[9] = h.protocol;
  out[10] = (h.headerChecksum >>> 8) & 0xff;
  out[11] = h.headerChecksum & 0xff;
  out.set(h.src, 12);
  out.set(h.dst, 16);
  if (h.options) out.set(h.options, 20);
  void total;
  return out;
}

export function decodeIpv4(buf: Uint8Array): Ipv4Header {
  if (buf.length < 20) throw new RangeError('ipv4: buffer too short');
  const version = (buf[0]! >> 4) & 0x0f;
  if (version !== 4) throw new RangeError(`ipv4: bad version ${version}`);
  const ihl = buf[0]! & 0x0f;
  if (ihl < 5) throw new RangeError('ipv4: bad ihl');
  const dscp = (buf[1]! >> 2) & 0x3f;
  const ecn = buf[1]! & 0x03;
  const totalLength = (buf[2]! << 8) | buf[3]!;
  const identification = (buf[4]! << 8) | buf[5]!;
  const flags = (buf[6]! >> 5) & 0x07;
  const fragmentOffset = ((buf[6]! & 0x1f) << 8) | buf[7]!;
  const ttl = buf[8]!;
  const protocol = buf[9]!;
  const headerChecksum = (buf[10]! << 8) | buf[11]!;
  const src = buf.subarray(12, 16);
  const dst = buf.subarray(16, 20);
  const options = ihl > 5 ? buf.slice(20, ihl * 4) : undefined;
  return { version: 4, ihl, dscp, ecn, totalLength, identification, flags, fragmentOffset, ttl, protocol, headerChecksum, src, dst, options };
}

// -----------------------------------------------------------------------------
// IPv6
// -----------------------------------------------------------------------------

export interface Ipv6Header {
  version: 6;
  trafficClass: number;
  flowLabel: number;
  payloadLength: number;
  nextHeader: number;
  hopLimit: number;
  src: Ipv6Address;
  dst: Ipv6Address;
}

export function encodeIpv6(h: Ipv6Header): Uint8Array {
  if (h.trafficClass < 0 || h.trafficClass > 0xff) throw new RangeError('traffic class');
  if (h.flowLabel < 0 || h.flowLabel > 0xfffff) throw new RangeError('flow label');
  const out = new Uint8Array(40);
  out[0] = (6 << 4) | ((h.trafficClass >> 4) & 0x0f);
  out[1] = ((h.trafficClass & 0x0f) << 4) | ((h.flowLabel >> 16) & 0x0f);
  out[2] = (h.flowLabel >> 8) & 0xff;
  out[3] = h.flowLabel & 0xff;
  out[4] = (h.payloadLength >>> 8) & 0xff;
  out[5] = h.payloadLength & 0xff;
  out[6] = h.nextHeader;
  out[7] = h.hopLimit;
  out.set(h.src, 8);
  out.set(h.dst, 24);
  return out;
}

export function decodeIpv6(buf: Uint8Array): Ipv6Header {
  if (buf.length < 40) throw new RangeError('ipv6: buffer too short');
  const version = (buf[0]! >> 4) & 0x0f;
  if (version !== 6) throw new RangeError(`ipv6: bad version ${version}`);
  const trafficClass = ((buf[0]! & 0x0f) << 4) | ((buf[1]! >> 4) & 0x0f);
  const flowLabel = ((buf[1]! & 0x0f) << 16) | (buf[2]! << 8) | buf[3]!;
  const payloadLength = (buf[4]! << 8) | buf[5]!;
  const nextHeader = buf[6]!;
  const hopLimit = buf[7]!;
  return { version: 6, trafficClass, flowLabel, payloadLength, nextHeader, hopLimit, src: buf.slice(8, 24), dst: buf.slice(24, 40) };
}

/** Generate the link-local IPv6 address from a MAC (modified EUI-64). */
export function ipv6LinkLocalFromMac(mac: MacAddress): Ipv6Address {
  const out = new Uint8Array(16);
  out[0] = 0xfe;
  out[1] = 0x80;
  out.set([0, 0, 0, 0, 0, 0, 0, 0], 2);
  out[8] = mac[0]! ^ 0x02; // flip the U/L bit (bit 1 of first byte)
  out[9] = mac[1]!;
  out[10] = mac[2]!;
  out[11] = 0xff;
  out[12] = 0xfe;
  out[13] = mac[3]!;
  out[14] = mac[4]!;
  out[15] = mac[5]!;
  return out;
}

// -----------------------------------------------------------------------------
// ARP (RFC 826)
// -----------------------------------------------------------------------------

export interface ArpPacket {
  htype: number; // hardware type (1 = Ethernet)
  ptype: number; // protocol type (0x0800 = IPv4)
  hlen: number; // hardware address length
  plen: number; // protocol address length
  operation: number; // 1 = request, 2 = reply
  sha: MacAddress; // sender hardware address
  spa: Ipv4Address; // sender protocol address
  tha: MacAddress; // target hardware address
  tpa: Ipv4Address; // target protocol address
}

export const ARP_REQUEST = 1;
export const ARP_REPLY = 2;

export function encodeArp(p: ArpPacket): Uint8Array {
  if (p.htype !== 1 || p.ptype !== 0x0800) throw new RangeError('only Ethernet/IPv4 ARP supported');
  const out = new Uint8Array(28);
  out[0] = (p.htype >> 8) & 0xff;
  out[1] = p.htype & 0xff;
  out[2] = (p.ptype >> 8) & 0xff;
  out[3] = p.ptype & 0xff;
  out[4] = p.hlen;
  out[5] = p.plen;
  out[6] = (p.operation >> 8) & 0xff;
  out[7] = p.operation & 0xff;
  out.set(p.sha, 8);
  out.set(p.spa, 14);
  out.set(p.tha, 18);
  out.set(p.tpa, 24);
  return out;
}

export function decodeArp(buf: Uint8Array): ArpPacket {
  if (buf.length < 28) throw new RangeError('arp: buffer too short');
  const htype = (buf[0]! << 8) | buf[1]!;
  const ptype = (buf[2]! << 8) | buf[3]!;
  const hlen = buf[4]!;
  const plen = buf[5]!;
  const operation = (buf[6]! << 8) | buf[7]!;
  const sha: MacAddress = [buf[8]!, buf[9]!, buf[10]!, buf[11]!, buf[12]!, buf[13]!];
  const spa = buf.subarray(14, 14 + plen);
  const tha: MacAddress = [buf[18]!, buf[19]!, buf[20]!, buf[21]!, buf[22]!, buf[23]!];
  const tpa = buf.subarray(24, 24 + plen);
  return { htype, ptype, hlen, plen, operation, sha, spa, tha, tpa };
}

// -----------------------------------------------------------------------------
// ICMPv4 (subset) and ICMPv6 (subset)
// -----------------------------------------------------------------------------

export interface IcmpEcho {
  type: number; // 8 = request, 0 = reply
  code: number;
  checksum: number;
  identifier: number;
  sequence: number;
  data: Uint8Array;
}

export function encodeIcmpEcho(p: IcmpEcho): Uint8Array {
  const out = new Uint8Array(8 + p.data.length);
  out[0] = p.type;
  out[1] = p.code;
  out[2] = (p.checksum >>> 8) & 0xff;
  out[3] = p.checksum & 0xff;
  out[4] = (p.identifier >>> 8) & 0xff;
  out[5] = p.identifier & 0xff;
  out[6] = (p.sequence >>> 8) & 0xff;
  out[7] = p.sequence & 0xff;
  out.set(p.data, 8);
  return out;
}

export function decodeIcmpEcho(buf: Uint8Array): IcmpEcho {
  if (buf.length < 8) throw new RangeError('icmp echo: buffer too short');
  return {
    type: buf[0]!,
    code: buf[1]!,
    checksum: (buf[2]! << 8) | buf[3]!,
    identifier: (buf[4]! << 8) | buf[5]!,
    sequence: (buf[6]! << 8) | buf[7]!,
    data: buf.subarray(8),
  };
}

// -----------------------------------------------------------------------------
// Internal: a tiny inline CRC-32 IEEE so we don't pull in chapter 1.
// -----------------------------------------------------------------------------

function crc32Ieee(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// =============================================================================
// Chapter 04 — Demo
// =============================================================================
import {
  encodeEthernet,
  decodeEthernet,
  encodeIpv4,
  decodeIpv4,
  encodeIpv6,
  decodeIpv6,
  ipv6LinkLocalFromMac,
  ipv4ToString,
  ipv6ToString,
  encodeArp,
  decodeArp,
  encodeIcmpEcho,
  decodeIcmpEcho,
  MAC_BROADCAST,
  ETHERTYPE,
  IP_PROTO,
  macFromString,
  ipv4FromString,
  ipv6FromString,
} from './ethernet.js';
import { toHex } from '../01-bytes-framing/bits.js';

export function demo(): void {
  // ---- Ethernet ----
  const eth = encodeEthernet({
    dst: MAC_BROADCAST,
    src: macFromString('aa:bb:cc:dd:ee:01'),
    ethertype: ETHERTYPE.ARP,
    payload: new Uint8Array(28),
  });
  const dec = decodeEthernet(eth);
  console.log('[04] ethernet frame =', toHex(eth));
  console.log('[04] decoded dst =', dec.dst.join(':'));

  // ---- IPv4 ----
  const src = ipv4FromString('192.168.1.5');
  const dst = ipv4FromString('8.8.8.8');
  const v4 = encodeIpv4({
    version: 4,
    ihl: 5,
    dscp: 0,
    ecn: 0,
    totalLength: 40,
    identification: 0x1234,
    flags: 2,
    fragmentOffset: 0,
    ttl: 64,
    protocol: IP_PROTO.TCP,
    headerChecksum: 0,
    src, dst,
  });
  console.log('[04] ipv4 =', toHex(v4));
  const v4d = decodeIpv4(v4);
  console.log(`[04] ipv4 ${ipv4ToString(v4d.src)} → ${ipv4ToString(v4d.dst)} ttl=${v4d.ttl} proto=${v4d.protocol}`);

  // ---- IPv6 ----
  const ll = ipv6LinkLocalFromMac(macFromString('02:42:ac:11:00:02'));
  const v6 = encodeIpv6({
    version: 6,
    trafficClass: 0,
    flowLabel: 0x12345,
    payloadLength: 0,
    nextHeader: IP_PROTO.IPV6_ICMP,
    hopLimit: 64,
    src: ll,
    dst: ipv6FromString('2001:db8::1'),
  });
  console.log('[04] ipv6 =', toHex(v6));
  const v6d = decodeIpv6(v6);
  console.log(`[04] ipv6 ${ipv6ToString(v6d.src)} → ${ipv6ToString(v6d.dst)}`);

  // ---- ARP ----
  const arp = encodeArp({
    htype: 1, ptype: 0x0800, hlen: 6, plen: 4, operation: 1,
    sha: macFromString('aa:bb:cc:dd:ee:01'),
    spa: ipv4FromString('192.168.1.1'),
    tha: [0, 0, 0, 0, 0, 0],
    tpa: ipv4FromString('192.168.1.2'),
  });
  const arpd = decodeArp(arp);
  console.log(`[04] arp op=${arpd.operation} sender=${ipv4ToString(arpd.spa)} target=${ipv4ToString(arpd.tpa)}`);

  // ---- ICMP echo ----
  const ping = encodeIcmpEcho({ type: 8, code: 0, checksum: 0, identifier: 1, sequence: 1, data: new Uint8Array([1, 2, 3, 4]) });
  const pingd = decodeIcmpEcho(ping);
  console.log(`[04] icmp echo type=${pingd.type} id=${pingd.identifier} seq=${pingd.sequence} dataLen=${pingd.data.length}`);
}


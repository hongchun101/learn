import { describe, it, expect } from 'vitest';
import {
  macFromString, macToString,
  ipv4FromString, ipv4ToString,
  ipv6FromString, ipv6ToString,
  ipv4Class, ipv4IsPrivate, ipv4IsLoopback, ipv4CidrMatch,
  encodeEthernet, decodeEthernet, ethernetFcs, MAC_BROADCAST, ETHERTYPE,
  encodeIpv4, decodeIpv4, IP_PROTO,
  encodeIpv6, decodeIpv6, ipv6LinkLocalFromMac,
  encodeArp, decodeArp, ARP_REQUEST, ARP_REPLY,
  encodeIcmpEcho, decodeIcmpEcho,
  demo as ch04Demo,
} from '../src/04-ethernet-ip/index.js';

describe('04 — address helpers', () => {
  it('macFromString / macToString roundtrip', () => {
    expect(macFromString('aa:bb:cc:dd:ee:01')).toEqual([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x01]);
    expect(macToString(macFromString('aa:bb:cc:dd:ee:01'))).toBe('aa:bb:cc:dd:ee:01');
    expect(macFromString('aa-bb-cc-dd-ee-01')).toEqual([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x01]);
    expect(() => macFromString('zz:bb:cc:dd:ee:01')).toThrow();
  });

  it('ipv4 class / private / loopback', () => {
    expect(ipv4Class(ipv4FromString('10.0.0.1'))).toBe('A');
    expect(ipv4Class(ipv4FromString('128.0.0.1'))).toBe('B');
    expect(ipv4Class(ipv4FromString('192.168.1.1'))).toBe('C');
    expect(ipv4Class(ipv4FromString('224.0.0.1'))).toBe('D');
    expect(ipv4Class(ipv4FromString('240.0.0.1'))).toBe('E');
    expect(ipv4IsPrivate(ipv4FromString('10.1.2.3'))).toBe(true);
    expect(ipv4IsPrivate(ipv4FromString('172.16.0.1'))).toBe(true);
    expect(ipv4IsPrivate(ipv4FromString('172.31.255.1'))).toBe(true);
    expect(ipv4IsPrivate(ipv4FromString('172.32.0.1'))).toBe(false);
    expect(ipv4IsPrivate(ipv4FromString('8.8.8.8'))).toBe(false);
    expect(ipv4IsLoopback(ipv4FromString('127.0.0.1'))).toBe(true);
  });

  it('ipv4 CIDR match', () => {
    expect(ipv4CidrMatch(ipv4FromString('10.0.0.1'), ipv4FromString('10.0.0.0'), 8)).toBe(true);
    expect(ipv4CidrMatch(ipv4FromString('11.0.0.1'), ipv4FromString('10.0.0.0'), 8)).toBe(false);
    expect(ipv4CidrMatch(ipv4FromString('192.168.1.5'), ipv4FromString('192.168.0.0'), 16)).toBe(true);
    expect(ipv4CidrMatch(ipv4FromString('192.169.1.5'), ipv4FromString('192.168.0.0'), 16)).toBe(false);
    expect(ipv4CidrMatch(ipv4FromString('192.168.1.5'), ipv4FromString('0.0.0.0'), 0)).toBe(true);
  });

  it('ipv6 roundtrips and compresses zero runs', () => {
    const a = ipv6FromString('2001:db8:0:0:0:0:0:1');
    expect(ipv6ToString(a)).toBe('2001:db8::1');
    const b = ipv6FromString('::1');
    expect(ipv6ToString(b)).toBe('::1');
    const c = ipv6FromString('fe80::1');
    expect(ipv6ToString(c)).toBe('fe80::1');
  });
});

describe('04 — Ethernet II', () => {
  it('round-trips a frame', () => {
    const f = encodeEthernet({
      dst: MAC_BROADCAST,
      src: macFromString('aa:bb:cc:dd:ee:01'),
      ethertype: ETHERTYPE.ARP,
      payload: new Uint8Array([1, 2, 3, 4]),
    });
    const d = decodeEthernet(f);
    expect(d.dst).toEqual(MAC_BROADCAST);
    expect(d.src).toEqual([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x01]);
    expect(d.ethertype).toBe(ETHERTYPE.ARP);
    expect(Array.from(d.payload)).toEqual([1, 2, 3, 4]);
  });

  it('verifies the FCS when present', () => {
    const f = encodeEthernet({
      dst: MAC_BROADCAST,
      src: macFromString('aa:bb:cc:dd:ee:01'),
      ethertype: ETHERTYPE.IPV4,
      payload: new Uint8Array(20),
    });
    const fcs = ethernetFcs(f);
    const withFcs = new Uint8Array(f.length + 4);
    withFcs.set(f);
    withFcs[withFcs.length - 4] = (fcs >>> 24) & 0xff;
    withFcs[withFcs.length - 3] = (fcs >>> 16) & 0xff;
    withFcs[withFcs.length - 2] = (fcs >>> 8) & 0xff;
    withFcs[withFcs.length - 1] = fcs & 0xff;
    expect(() => decodeEthernet(withFcs, true)).not.toThrow();
    withFcs[15]! ^= 0x80;
    expect(() => decodeEthernet(withFcs, true)).toThrow(/FCS/);
  });
});

describe('04 — IPv4', () => {
  it('round-trips a header without options', () => {
    const h = encodeIpv4({
      version: 4, ihl: 5, dscp: 0x10, ecn: 1, totalLength: 84,
      identification: 0x1234, flags: 0b010, fragmentOffset: 0,
      ttl: 64, protocol: IP_PROTO.TCP, headerChecksum: 0,
      src: ipv4FromString('192.168.1.5'), dst: ipv4FromString('8.8.8.8'),
    });
    const d = decodeIpv4(h);
    expect(d.version).toBe(4);
    expect(d.ihl).toBe(5);
    expect(dscpAndEcn(d)).toBe(0x10 * 4 + 1);
    expect(d.totalLength).toBe(84);
    expect(d.identification).toBe(0x1234);
    expect(d.flags).toBe(0b010);
    expect(d.ttl).toBe(64);
    expect(d.protocol).toBe(IP_PROTO.TCP);
    expect(ipv4ToString(d.src)).toBe('192.168.1.5');
    expect(ipv4ToString(d.dst)).toBe('8.8.8.8');
  });

  it('rejects bad version', () => {
    const ok = new Uint8Array(20);
    ok[0] = 0x45; // version 4, ihl 5
    expect(() => decodeIpv4(ok)).not.toThrow();
    const bad = new Uint8Array(20);
    bad[0] = 0x60; // version 6
    expect(() => decodeIpv4(bad)).toThrow(/version/);
  });
});

function dscpAndEcn(h: { dscp: number; ecn: number }): number {
  return (h.dscp << 2) | h.ecn;
}

describe('04 — IPv6', () => {
  it('round-trips a header', () => {
    const h = encodeIpv6({
      version: 6,
      trafficClass: 0xab,
      flowLabel: 0x12345,
      payloadLength: 1500,
      nextHeader: IP_PROTO.TCP,
      hopLimit: 64,
      src: ipv6FromString('2001:db8::1'),
      dst: ipv6FromString('2001:db8::2'),
    });
    const d = decodeIpv6(h);
    expect(d.version).toBe(6);
    expect(d.trafficClass).toBe(0xab);
    expect(d.flowLabel).toBe(0x12345);
    expect(d.payloadLength).toBe(1500);
    expect(d.nextHeader).toBe(IP_PROTO.TCP);
    expect(d.hopLimit).toBe(64);
    expect(ipv6ToString(d.src)).toBe('2001:db8::1');
    expect(ipv6ToString(d.dst)).toBe('2001:db8::2');
  });

  it('derives link-local from MAC with U/L bit flipped', () => {
    const mac = macFromString('02:42:ac:11:00:02');
    const ll = ipv6LinkLocalFromMac(mac);
    expect(ipv6ToString(ll)).toBe('fe80::42:acff:fe11:2');
  });
});

describe('04 — ARP', () => {
  it('round-trips a request and reply', () => {
    const req = encodeArp({
      htype: 1, ptype: 0x0800, hlen: 6, plen: 4,
      operation: ARP_REQUEST,
      sha: macFromString('aa:bb:cc:dd:ee:01'),
      spa: ipv4FromString('192.168.1.1'),
      tha: [0, 0, 0, 0, 0, 0],
      tpa: ipv4FromString('192.168.1.2'),
    });
    const d = decodeArp(req);
    expect(d.operation).toBe(ARP_REQUEST);
    expect(ipv4ToString(d.spa)).toBe('192.168.1.1');
    expect(ipv4ToString(d.tpa)).toBe('192.168.1.2');

    const reply = encodeArp({ ...d, operation: ARP_REPLY, tha: macFromString('aa:bb:cc:dd:ee:02') });
    expect(decodeArp(reply).operation).toBe(ARP_REPLY);
  });
});

describe('04 — ICMP echo', () => {
  it('round-trips a ping', () => {
    const p = encodeIcmpEcho({ type: 8, code: 0, checksum: 0x1234, identifier: 7, sequence: 9, data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) });
    const d = decodeIcmpEcho(p);
    expect(d.type).toBe(8);
    expect(d.code).toBe(0);
    expect(d.checksum).toBe(0x1234);
    expect(d.identifier).toBe(7);
    expect(d.sequence).toBe(9);
    expect(Array.from(d.data)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });
  it('runs end-to-end', () => {
    expect(() => ch04Demo()).not.toThrow();
  });
});

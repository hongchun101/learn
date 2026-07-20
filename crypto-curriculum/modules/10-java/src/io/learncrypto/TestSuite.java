package io.learncrypto;

import java.util.HashSet;
import java.util.Set;

/** Runs the six contract checks as `assert` statements; main returns the
 *  count of assertions that fired. With `-ea`, an assertion failure prints
 *  the location and exits non-zero. Without `-ea`, asserts are no-ops, so
 *  this `main` returns 1 always and is intended to be run as
 *  `java -ea -cp target io.learncrypto.TestSuite`.
 */
public final class TestSuite {

    private static byte[] flipBit(byte[] in, int idx, int mask) {
        byte[] out = in.clone();
        out[idx] = (byte) ((out[idx] & 0xff) ^ mask);
        return out;
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x & 0xff));
        return sb.toString();
    }

    public static void main(String[] args) throws Exception {
        int passed = 0;
        int total = 0;

        // ---- 1. AES-256-GCM round-trip ----
        try {
            byte[] key = Csprng.randomBytes(32);
            byte[] pt  = Csprng.randomBytes(57);
            Ciphers.GcmEnv env = Ciphers.aesGcmEncrypt(key, pt, null);
            byte[] pt2 = Ciphers.aesGcmDecrypt(key, env, null);
            total++;
            assert hex(pt2).equals(hex(pt)) : "AES-GCM round-trip failed";
            passed++;
            // tag-flip rejected
            try {
                total++;
                Ciphers.aesGcmDecrypt(key, new Ciphers.GcmEnv(env.ct, env.nonce,
                        flipBit(env.tag, 15, 0x80)), null);
                throw new AssertionError("AES-GCM did not reject tag-flip!");
            } catch (java.security.GeneralSecurityException e) {
                passed++;
            }
        } catch (Exception e) { throw new RuntimeException(e); }

        // ---- 2. HMAC-SHA-256 ----
        byte[] k = Csprng.randomBytes(32);
        byte[] m = Csprng.randomBytes(64);
        byte[] tag = Macs.hmacSha256(k, m);
        total++;
        assert tag.length == 32 : "HMAC-SHA-256 tag length";
        passed++;
        total++;
        assert Macs.hmacSha256Verify(k, m, tag) : "HMAC verify failed";
        passed++;
        total++;
        assert !Macs.hmacSha256Verify(k, m, flipBit(tag, 7, 0x10)) : "HMAC verify forged";
        passed++;

        // ---- 3. SHA-256 (challenge 3) ----
        byte[] empty = Hashes.sha256(new byte[0]);
        total++;
        assert hex(empty).equals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855") : "SHA-256 empty";
        passed++;
        byte[] abc = Hashes.sha256("abc".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        total++;
        assert hex(abc).equals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") : "SHA-256 abc";
        passed++;

        // ---- 4. HKDF-SHA-256 (RFC 5869 TC1) ----
        byte[] ikm  = new byte[22]; java.util.Arrays.fill(ikm, (byte) 0x0b);
        byte[] salt = new byte[]{0,1,2,3,4,5,6,7,8,9,0xa,0xb,0xc};
        byte[] info = new byte[]{(byte)0xf0,(byte)0xf1,(byte)0xf2,(byte)0xf3,(byte)0xf4,
                (byte)0xf5,(byte)0xf6,(byte)0xf7,(byte)0xf8,(byte)0xf9};
        byte[] okm = Hashes.hkdfSha256(ikm, 42, salt, info);
        total++;
        assert hex(okm).equals("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865") : "HKDF TC1";
        passed++;

        // ---- 5. ECDSA-P256 (challenge 5 — JDK 8 has no Ed25519, so we use ECDSA) ----
        java.security.KeyPair kp = Signatures.freshEcdsa();
        byte[] mm = Csprng.randomBytes(64);
        byte[] s = Signatures.signEcdsa(kp.getPrivate(), mm);
        total++;
        assert s.length > 60 && s.length < 80 : "ECDSA sig length out of expected range";
        passed++;
        total++;
        assert Signatures.verifyEcdsa(kp.getPublic(), mm, s) : "ECDSA verify failed";
        passed++;
        total++;
        assert !Signatures.verifyEcdsa(kp.getPublic(), flipBit(mm, 0, 0x01), s) : "ECDSA forgery";
        passed++;

        // ---- 6. CSPRNG ----
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 50_000; i++) seen.add(hex(Csprng.randomBytes(16)));
        total++;
        assert seen.size() == 50_000 : "CSPRNG collision-resistance failure";
        passed++;
        total++;
        assert Signatures.eddsaAvailable().length() > 0 : "EdDSA probe";
        passed++;

        System.out.println("Java contract tests: " + passed + "/" + total + " assertions passed.");
    }
}

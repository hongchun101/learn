package io.learncrypto;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;

/** SHA-256 and HKDF-SHA-256. RFC 5869 reference implementation. */
public final class Hashes {
    private Hashes() {}

    private static final byte[] EMPTY = new byte[0];

    public static byte[] sha256(byte[] data) throws GeneralSecurityException {
        return MessageDigest.getInstance("SHA-256").digest(data);
    }

    public static byte[] hkdfSha256(byte[] master, int outLen, byte[] salt, byte[] info)
            throws GeneralSecurityException {
        if (outLen <= 0) throw new IllegalArgumentException("outLen must be positive");
        if (outLen > 255 * 32) throw new IllegalArgumentException("outLen too large");
        byte[] effectiveSalt = salt != null ? salt : new byte[32];
        byte[] effectiveInfo = info != null ? info : EMPTY;
        // Extract
        byte[] prk = hmac(effectiveSalt, master);
        // Expand
        ByteArrayOutputStream okm = new ByteArrayOutputStream();
        byte[] prev = EMPTY;
        for (int counter = 1; okm.size() < outLen; counter++) {
            Mac m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(prk, "HmacSHA256"));
            m.update(prev);
            m.update(effectiveInfo);
            m.update((byte) counter);
            prev = m.doFinal();
            okm.write(prev, 0, Math.min(prev.length, outLen - okm.size()));
            if (counter > 255) throw new IllegalStateException("hkdf counter overflow");
        }
        return okm.toByteArray();
    }

    private static byte[] hmac(byte[] key, byte[] message) throws GeneralSecurityException {
        Mac m = Mac.getInstance("HmacSHA256");
        m.init(new SecretKeySpec(key, "HmacSHA256"));
        return m.doFinal(message);
    }
}

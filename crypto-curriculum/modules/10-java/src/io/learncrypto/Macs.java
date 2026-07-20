package io.learncrypto;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;

/** HMAC-SHA-256 over byte arrays. */
public final class Macs {
    private Macs() {}

    public static byte[] hmacSha256(byte[] key, byte[] message) throws GeneralSecurityException {
        Mac m = Mac.getInstance("HmacSHA256");
        m.init(new SecretKeySpec(key, "HmacSHA256"));
        return m.doFinal(message);
    }

    /** Constant-time comparison (uses MessageDigest.isEqual since Java 7u72). */
    public static boolean hmacSha256Verify(byte[] key, byte[] message, byte[] tag) throws GeneralSecurityException {
        byte[] expected = hmacSha256(key, message);
        return MessageDigest.isEqual(expected, tag);
    }
}

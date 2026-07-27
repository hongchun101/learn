package io.learncrypto;

import java.security.GeneralSecurityException;
import java.security.SecureRandom;

/** 用极简且类型安全的 API 包装 SecureRandom。 */
public final class Csprng {
    private static final SecureRandom RNG = new SecureRandom();

    private Csprng() {}

    public static byte[] randomBytes(int n) {
        if (n < 0) throw new IllegalArgumentException("n must be non-negative");
        byte[] out = new byte[n];
        if (n > 0) RNG.nextBytes(out);
        return out;
    }
}

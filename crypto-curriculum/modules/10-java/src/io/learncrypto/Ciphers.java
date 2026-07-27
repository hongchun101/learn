package io.learncrypto;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;

/** 使用 12 字节 IV 的 AES-256-GCM 加解密。 */
public final class Ciphers {
    public static final int TAG_BITS = 128;
    private static final SecureRandom RNG = new SecureRandom();

    private Ciphers() {}

    public static final class GcmEnv {
        public final byte[] ct;
        public final byte[] nonce;
        public final byte[] tag;
        public GcmEnv(byte[] ct, byte[] nonce, byte[] tag) {
            this.ct = ct; this.nonce = nonce; this.tag = tag;
        }
    }

    public static GcmEnv aesGcmEncrypt(byte[] key, byte[] pt, byte[] aad) throws GeneralSecurityException {
        if (key.length != 32) throw new IllegalArgumentException("key must be 32 bytes");
        byte[] nonce = new byte[12];
        RNG.nextBytes(nonce);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"),
                new GCMParameterSpec(TAG_BITS, nonce));
        if (aad != null && aad.length > 0) c.updateAAD(aad);
        byte[] ct = c.doFinal(pt); // 追加 16 字节的 tag
        // 拆分 ct 与 tag。
        byte[] ctOnly = Arrays.copyOf(ct, ct.length - 16);
        byte[] tag    = Arrays.copyOfRange(ct, ct.length - 16, ct.length);
        return new GcmEnv(ctOnly, nonce, tag);
    }

    public static byte[] aesGcmDecrypt(byte[] key, GcmEnv env, byte[] aad) throws GeneralSecurityException {
        if (key.length != 32) throw new IllegalArgumentException("key must be 32 bytes");
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
                new GCMParameterSpec(TAG_BITS, env.nonce));
        if (aad != null && aad.length > 0) c.updateAAD(aad);
        // 重新组合 ct||tag，因为 cipher.doFinal 需要传入合并后的密文。
        ByteBuffer buf = ByteBuffer.allocate(env.ct.length + env.tag.length);
        buf.put(env.ct); buf.put(env.tag);
        return c.doFinal(buf.array());
    }
}

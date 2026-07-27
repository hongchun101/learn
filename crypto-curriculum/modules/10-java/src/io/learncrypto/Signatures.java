package io.learncrypto;

import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;

/**
 * Java 签名包装器。在本机可用的 JDK 8 版本上，Sun provider 并未内置
 * Ed25519 —— 我们使用 SunEC 在 P-256 上的 ECDSA 作为可运行的代表。
 * 契约接口返回签名字节并提供往返验签；所使用的*算法*是当前本地
 * JDK 中真实存在的算法。
 */
public final class Signatures {
    private Signatures() {}

    public static KeyPair freshEcdsa() throws GeneralSecurityException {
        KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
        g.initialize(new java.security.spec.ECGenParameterSpec("secp256r1"));
        return g.generateKeyPair();
    }

    public static byte[] signEcdsa(java.security.PrivateKey sk, byte[] message) throws GeneralSecurityException {
        Signature s = Signature.getInstance("SHA256withECDSA");
        s.initSign(sk);
        s.update(message);
        return s.sign();
    }

    public static boolean verifyEcdsa(java.security.PublicKey pk, byte[] message, byte[] sig)
            throws GeneralSecurityException {
        Signature s = Signature.getInstance("SHA256withECDSA");
        s.initVerify(pk);
        s.update(message);
        return s.verify(sig);
    }

    /** EdDSA 需 JDK 15 及以上。本机运行 JDK 8，因此仅报告可用性。 */
    public static String eddsaAvailable() {
        try {
            KeyPairGenerator.getInstance("EdDSA");
            return "yes";
        } catch (java.security.NoSuchAlgorithmException e) {
            return "no (host is JDK 8; use BouncyCastle Ed25519 for production)";
        }
    }
}

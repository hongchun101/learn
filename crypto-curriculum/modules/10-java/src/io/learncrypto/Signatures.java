package io.learncrypto;

import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;

/**
 * Java signature wrapper. On JDK 8 (the version available on this host) Ed25519
 * is not built into the Sun provider — we use SunEC ECDSA over P-256 as the
 * runnable representative. The contract returns signature bytes and a
 * round-trip verify; the *algorithm* is one that actually exists in the local
 * JDK.
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

    /** EdDSA is JDK 15+. The host runs JDK 8 so we report availability. */
    public static String eddsaAvailable() {
        try {
            KeyPairGenerator.getInstance("EdDSA");
            return "yes";
        } catch (java.security.NoSuchAlgorithmException e) {
            return "no (host is JDK 8; use BouncyCastle Ed25519 for production)";
        }
    }
}

// C++ reference primitives using OpenSSL 3 (libcrypto's EVP API).
//
// Compile with: g++ -std=c++20 -lcrypto primitives.cpp test_contract.cpp -o tests
// Requires libcrypto / OpenSSL 3.

#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/hmac.h>
#include <openssl/sha.h>
#include <openssl/ec.h>
#include <openssl/ed25519.h>

#include <array>
#include <cstdint>
#include <cstring>
#include <vector>

namespace learncrypto {

using Bytes = std::vector<std::uint8_t>;

inline Bytes random_bytes(std::size_t n) {
    Bytes out(n);
    if (RAND_bytes(out.data(), static_cast<int>(n)) != 1) {
        throw std::runtime_error("RAND_bytes failed");
    }
    return out;
}

// AES-256-GCM
struct GcmEnv { Bytes ct, nonce, tag; };
GcmEnv aes_gcm_encrypt(const Bytes& key, const Bytes& pt, const Bytes& aad = {});
Bytes    aes_gcm_decrypt(const Bytes& key, const GcmEnv& env, const Bytes& aad = {});

// HMAC-SHA-256
Bytes hmac_sha256(const Bytes& key, const Bytes& msg);
bool  hmac_sha256_verify(const Bytes& key, const Bytes& msg, const Bytes& tag);

// HKDF-SHA-256 (EVP_KDF)
Bytes hkdf_sha256(const Bytes& master, std::size_t out_len,
                  const Bytes& salt = {}, const Bytes& info = {});

// SHA-256
Bytes sha256(const Bytes& in);

// Ed25519 sign/verify
struct Ed25519Keypair { Bytes sk, pk; };
Ed25519Keypair ed25519_generate();
Bytes ed25519_sign(const Bytes& sk, const Bytes& msg);
bool  ed25519_verify(const Bytes& pk, const Bytes& msg, const Bytes& sig);

} // namespace learncrypto

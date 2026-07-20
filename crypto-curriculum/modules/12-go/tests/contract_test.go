// Tests the six primitives the other modules contract-check.
//
// Run with:
//
//   go test -race ./...
//
// Requires Go 1.24+ (uses crypto/hkdf, crypto/ecdh from stdlib).
package crypto_curriculum_test

import (
	"bytes"
	"encoding/hex"
	"testing"

	"crypto-curriculum"
)

func TestAESGCMRoundTrip(t *testing.T) {
	key := crypto_curriculum.RandomBytes(32)
	pt := crypto_curriculum.RandomBytes(57)
	env, err := crypto_curriculum.AESGCMEncrypt(key, pt, nil)
	if err != nil {
		t.Fatal(err)
	}
	pt2, err := crypto_curriculum.AESGCMDecrypt(key, env, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(pt, pt2) {
		t.Fatal("round-trip mismatch")
	}
}

func TestAESGCMRejectsFlippedTag(t *testing.T) {
	key := crypto_curriculum.RandomBytes(32)
	pt := crypto_curriculum.RandomBytes(64)
	env, err := crypto_curriculum.AESGCMEncrypt(key, pt, nil)
	if err != nil {
		t.Fatal(err)
	}
	flipped := append([]byte{}, env.Tag...)
	flipped[15] ^= 0x80
	flippedEnv := crypto_curriculum.GcmEnv{CT: env.CT, Nonce: env.Nonce, Tag: flipped}
	if _, err := crypto_curriculum.AESGCMDecrypt(key, flippedEnv, nil); err == nil {
		t.Fatal("expected auth failure, got nil")
	}
}

func TestHMACSHA256RoundTrip(t *testing.T) {
	k := crypto_curriculum.RandomBytes(32)
	m := crypto_curriculum.RandomBytes(64)
	t1 := crypto_curriculum.HMACSHA256(k, m)
	if !crypto_curriculum.HMACSHA256Verify(k, m, t1) {
		t.Fatal("verify failed")
	}
	flipped := append([]byte{}, t1...)
	flipped[7] ^= 0x10
	if crypto_curriculum.HMACSHA256Verify(k, m, flipped) {
		t.Fatal("verify accepted forgery")
	}
}

func TestSHA256Canonical(t *testing.T) {
	if got := crypto_curriculum.SHA256Hex([]byte("")); got !=
		"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" {
		t.Fatalf("empty mismatch: %s", got)
	}
	if got := crypto_curriculum.SHA256Hex([]byte("abc")); got !=
		"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatalf("abc mismatch: %s", got)
	}
}

func TestHKDFRFC5869(t *testing.T) {
	ikm := bytes.Repeat([]byte{0x0b}, 22)
	salt := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xa, 0xb, 0xc}
	info := []byte{0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9}
	okm := crypto_curriculum.HKDFSHA256(ikm, 42, salt, info)
	want := "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
	if got := hex.EncodeToString(okm); got != want {
		t.Fatalf("HKDF mismatch: %s != %s", got, want)
	}
}

func TestEd25519RoundTrip(t *testing.T) {
	priv, pub := crypto_curriculum.Ed25519Generate()
	m := crypto_curriculum.RandomBytes(64)
	s := crypto_curriculum.Ed25519Sign(priv, m)
	if !crypto_curriculum.Ed25519Verify(pub, m, s) {
		t.Fatal("verify failed")
	}
	flipped := append([]byte{}, m...)
	flipped[0] ^= 0x01
	if crypto_curriculum.Ed25519Verify(pub, flipped, s) {
		t.Fatal("verify accepted forgery")
	}
}

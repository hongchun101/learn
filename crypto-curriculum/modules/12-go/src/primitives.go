// Package primitives 用 Go 实现了六项契约属性。
//
// 测试命令：
//
//   go test -race ./...
//
// 该模块刻意只用一个文件；生产环境中应当按原语拆分为独立的包。
// 本文件展示了 crypto/aes、crypto/cipher、crypto/sha256、crypto/hmac、
// crypto/ed25519、crypto/hkdf 和 crypto/rand 的规范、惯用用法。

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ed25519"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

func RandomBytes(n int) []byte {
	out := make([]byte, n)
	if _, err := io.ReadFull(rand.Reader, out); err != nil {
		panic(err)
	}
	return out
}

func SHA256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func HMACSHA256(key, msg []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(msg)
	return mac.Sum(nil)
}

func HMACSHA256Verify(key, msg, tag []byte) bool {
	if len(tag) != 32 {
		return false
	}
	expected := HMACSHA256(key, msg)
	return subtle.ConstantTimeCompare(expected, tag) == 1
}

func HKDFSHA256(master []byte, length int, salt, info []byte) []byte {
	out := make([]byte, length)
	r := hkdf.New(sha256.New, master, salt, info)
	if _, err := io.ReadFull(r, out); err != nil {
		panic(err)
	}
	return out
}

type GcmEnv struct {
	CT     []byte
	Nonce  []byte
	Tag    []byte
}

// AESGCMEncrypt 使用 AES-256-GCM 加密，并返回拆分后的 (ct, nonce, tag)。
func AESGCMEncrypt(key, plaintext, aad []byte) (GcmEnv, error) {
	if len(key) != 32 {
		return GcmEnv{}, fmt.Errorf("key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return GcmEnv{}, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return GcmEnv{}, err
	}
	nonce := RandomBytes(12)
	// Seal 将密文与认证标签拼接在一起。
	sealed := aead.Seal(nil, nonce, plaintext, aad)
	ct := sealed[:len(sealed)-16]
	tag := sealed[len(sealed)-16:]
	return GcmEnv{CT: ct, Nonce: nonce, Tag: tag}, nil
}

func AESGCMDecrypt(key []byte, env GcmEnv, aad []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	combined := append(append([]byte{}, env.CT...), env.Tag...)
	pt, err := aead.Open(nil, env.Nonce, combined, aad)
	if err != nil {
		return nil, errors.New("aes-gcm: authentication failed")
	}
	return pt, nil
}

// Ed25519 原语——`ed25519.PublicKey` 与 `PrivateKey` 即为规范类型。
func Ed25519Generate() (ed25519.PrivateKey, ed25519.PublicKey) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		panic(err)
	}
	return priv, pub
}

func Ed25519Sign(priv ed25519.PrivateKey, msg []byte) []byte {
	return ed25519.Sign(priv, msg)
}

func Ed25519Verify(pub ed25519.PublicKey, msg, sig []byte) bool {
	return ed25519.Verify(pub, msg, sig)
}

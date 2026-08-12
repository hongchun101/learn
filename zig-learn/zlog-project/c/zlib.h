/*
 * zlog 自带的 zlib 头文件桩
 * 用于演示 @cImport / addTranslateC 互操作。
 * 真实项目中应包含系统 zlib 头。
 */
#ifndef ZLOG_ZLIB_STUB_H
#define ZLOG_ZLIB_STUB_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* 简化版的 zlib 压缩/解压 API 签名，用于演示 interop */
int zlog_zlib_compress(unsigned char *dest, size_t *destLen,
                        const unsigned char *source, size_t sourceLen);

int zlog_zlib_uncompress(unsigned char *dest, size_t *destLen,
                          const unsigned char *source, size_t sourceLen);

unsigned long zlog_crc32(unsigned long crc, const unsigned char *buf, size_t len);

#ifdef __cplusplus
}
#endif

#endif /* ZLOG_ZLIB_STUB_H */

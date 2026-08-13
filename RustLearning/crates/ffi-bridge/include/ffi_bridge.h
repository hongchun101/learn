/* ffi_bridge.h — C 头文件，与 crates/ffi-bridge 对应
 *
 * 该头文件为 Rust 端 `#[no_mangle] pub extern "C" fn ...` 函数的镜像。
 * 修改 Rust 端时**必须**同步修改本文件，并由 CI 校验一致性。
 *
 * 任何使用本库的 C/C++ 项目都应只 #include 此文件。
 */
#ifndef FFI_BRIDGE_H
#define FFI_BRIDGE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* 不透明句柄：调用方在 C 端应视为 `void *` 等价物。 */
typedef struct IntVecHandle IntVecHandle;

/* 整数变换回调：返回一个新值。 */
typedef int64_t (*IntCallback)(int64_t);

/* 生命周期： */
IntVecHandle *int_vec_new(size_t len);
void           int_vec_destroy(IntVecHandle *h);

/* 只读查询： */
size_t int_vec_len(const IntVecHandle *h);
int64_t int_vec_get(const IntVecHandle *h, size_t idx);
int64_t int_vec_sum(const IntVecHandle *h);

/* 修改： */
void int_vec_push(IntVecHandle *h, int64_t value);
void int_vec_map_inplace(IntVecHandle *h, IntCallback cb);

/* 字符串： */
char *string_dup(const char *s);
void  string_free(char *s);

/* 订阅 / 分发： */
uint32_t subscribe(IntCallback cb);
void     unsubscribe(uint32_t id);
int64_t  dispatch(int64_t value);

#ifdef __cplusplus
}
#endif

#endif /* FFI_BRIDGE_H */

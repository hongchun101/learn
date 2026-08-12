//! C 互操作：zlib 包装
//!
//! 演示：
//! - 0.16 推荐做法：通过 build.zig 的 addTranslateC 翻译 C 头
//! - 在 Zig 代码里 `@import("c_zlib")` 拿到翻译后的模块
//! - 错误码到 Zig 错误联合的转换
//! - C ABI 函数调用（c_int, c_ulonglong 等）

const std = @import("std");
const c = @import("c_zlib");

const Allocator = std.mem.Allocator;

/// C 函数返回错误码转 Zig error
pub const ZlibError = error{
    InvalidArgument,
    OutOfMemory,
    DataError,
    VersionError,
    StreamError,
    NeedDictionary,
    BufError,
    StreamEnd,
    Unknown,
};

fn translateErr(code: c_int) ZlibError!void {
    return switch (code) {
        c.Z_OK => {},
        c.Z_STREAM_END => return error.StreamEnd,
        c.Z_NEED_DICT => return error.NeedDictionary,
        c.Z_ERRNO => return error.StreamError,
        c.Z_STREAM_ERROR => return error.StreamError,
        c.Z_DATA_ERROR => return error.DataError,
        c.Z_MEM_ERROR => return error.OutOfMemory,
        c.Z_BUF_ERROR => return error.BufError,
        c.Z_VERSION_ERROR => return error.VersionError,
        else => return error.Unknown,
    };
}

/// 计算 CRC32（流式 / 整段）
pub fn crc32(initial: u32, buf: []const u8) u32 {
    return @intCast(c.zlog_crc32(@as(c_ulong, initial), buf.ptr, buf.len));
}

/// 压缩数据
/// dest 缓冲区至少需要 source.len + 12 字节（zlib 上界）
pub fn compress(alloc: Allocator, source: []const u8) ![]u8 {
    var dest_len: c_ulong = @intCast(source.len + 64);
    const dest = try alloc.alloc(u8, @intCast(dest_len));
    errdefer alloc.free(dest);

    const rc = c.zlog_zlib_compress(dest.ptr, &dest_len, source.ptr, @intCast(source.len));
    try translateErr(rc);

    return dest[0..@intCast(dest_len)];
}

/// 解压数据
/// dest_len 由调用者预设：设为压缩后源大小的倍数
pub fn uncompress(alloc: Allocator, source: []const u8, expected_size: usize) ![]u8 {
    const dest = try alloc.alloc(u8, expected_size);
    errdefer alloc.free(dest);
    var dest_len: c_ulong = @intCast(expected_size);

    const rc = c.zlog_zlib_uncompress(dest.ptr, &dest_len, source.ptr, @intCast(source.len));
    try translateErr(rc);

    return dest[0..@intCast(dest_len)];
}

test "crc32 known" {
    // CRC32 of "" is 0
    try std.testing.expectEqual(@as(u32, 0), crc32(0, ""));
    // CRC32 of "a" is 0xE8B7BE43
    try std.testing.expectEqual(@as(u32, 0xE8B7BE43), crc32(0, "a"));
}

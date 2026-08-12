//! SIMD 加速的 ASCII 操作
//!
//! 演示：
//! - 字符分类
//! - 批量转换（如大写）
//! - 校验和

const std = @import("std");

const BLOCK_SIZE: usize = 32;

/// 检查所有字符是否都是 ASCII
pub fn isAllAscii(input: []const u8) bool {
    const high: @Vector(BLOCK_SIZE, u8) = @splat(0x80);
    var i: usize = 0;
    while (i + BLOCK_SIZE <= input.len) : (i += BLOCK_SIZE) {
        const chunk: @Vector(BLOCK_SIZE, u8) = input[i..][0..BLOCK_SIZE].*;
        const ge = chunk >= high;
        inline for (0..BLOCK_SIZE) |j| {
            if (ge[j]) return false;
        }
    }
    while (i < input.len) : (i += 1) {
        if (input[i] >= 0x80) return false;
    }
    return true;
}

/// 大写化所有 ASCII 字符（原地）
pub fn toAsciiUpper(buf: []u8) void {
    const diff: @Vector(BLOCK_SIZE, u8) = @splat('a' - 'A');
    const lower_a: @Vector(BLOCK_SIZE, u8) = @splat('a');
    const lower_z: @Vector(BLOCK_SIZE, u8) = @splat('z');
    var i: usize = 0;
    while (i + BLOCK_SIZE <= buf.len) : (i += BLOCK_SIZE) {
        const chunk: @Vector(BLOCK_SIZE, u8) = buf[i..][0..BLOCK_SIZE].*;
        const is_ge: @Vector(BLOCK_SIZE, bool) = chunk >= lower_a;
        const is_le: @Vector(BLOCK_SIZE, bool) = chunk <= lower_z;
        inline for (0..BLOCK_SIZE) |j| {
            const lower = is_ge[j] and is_le[j];
            buf[i + j] = if (lower) chunk[j] - diff[j] else chunk[j];
        }
    }
    while (i < buf.len) : (i += 1) {
        if (buf[i] >= 'a' and buf[i] <= 'z') {
            buf[i] -= 'a' - 'A';
        }
    }
}

/// 计算 FNV-1a 哈希
pub fn fnv1a(input: []const u8) u64 {
    var hash: u64 = 0xcbf29ce484222325;
    const prime: u64 = 0x100000001b3;

    var i: usize = 0;
    while (i < input.len) : (i += 1) {
        hash ^= input[i];
        hash = (hash *% prime);
    }
    return hash;
}

test "isAllAscii - positive" {
    try std.testing.expect(isAllAscii("hello world"));
}

test "isAllAscii - negative" {
    try std.testing.expect(!isAllAscii("hello \xff"));
}

test "toAsciiUpper" {
    var buf: [16]u8 = undefined;
    @memcpy(buf[0.."Hello World".len], "Hello World");
    toAsciiUpper(buf[0.."Hello World".len]);
    try std.testing.expectEqualStrings("HELLO WORLD", buf[0.."Hello World".len]);
}

test "fnv1a - known" {
    // FNV-1a("") = 0xcbf29ce484222325
    try std.testing.expectEqual(@as(u64, 0xcbf29ce484222325), fnv1a(""));
    // FNV-1a("a") = 0xaf63dc4c8601ec8c
    try std.testing.expectEqual(@as(u64, 0xaf63dc4c8601ec8c), fnv1a("a"));
}

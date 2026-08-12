//! SIMD 加速的字符串搜索
//!
//! 演示：
//! - @Vector(N, T) 的使用
//! - 元素级比较
//! - @reduce 归约
//! - 字节级 SIMD 扫描

const std = @import("std");

/// SIMD 块大小（32 字节 = AVX2 单寄存器）
const BLOCK_SIZE: usize = 32;

/// 朴素字符串搜索（O(n*m)）
pub fn indexOfScalar(haystack: []const u8, needle: []const u8) ?usize {
    if (needle.len == 0) return 0;
    if (needle.len > haystack.len) return null;
    var i: usize = 0;
    while (i + needle.len <= haystack.len) : (i += 1) {
        if (std.mem.eql(u8, haystack[i..][0..needle.len], needle)) {
            return i;
        }
    }
    return null;
}

/// SIMD 加速搜索：找 needle 第一个字符出现位置
/// 然后在该位置朴素比对剩余字符
pub fn indexOf(haystack: []const u8, needle: []const u8) ?usize {
    if (needle.len == 0) return 0;
    if (needle.len > haystack.len) return null;

    const first: u8 = needle[0];
    const first_v: @Vector(BLOCK_SIZE, u8) = @splat(first);

    var i: usize = 0;
    while (i + BLOCK_SIZE <= haystack.len) : (i += BLOCK_SIZE) {
        const chunk: @Vector(BLOCK_SIZE, u8) = haystack[i..][0..BLOCK_SIZE].*;
        const eq: @Vector(BLOCK_SIZE, bool) = chunk == first_v;
        // 直接用 if 检查每个元素（编译器向量化）
        inline for (0..BLOCK_SIZE) |j| {
            if (eq[j]) {
                const pos = i + j;
                if (pos + needle.len <= haystack.len and
                    std.mem.eql(u8, haystack[pos..][0..needle.len], needle))
                {
                    return pos;
                }
            }
        }
    }

    // 尾部
    while (i < haystack.len) : (i += 1) {
        if (haystack[i] == first) {
            if (i + needle.len <= haystack.len and
                std.mem.eql(u8, haystack[i..][0..needle.len], needle))
            {
                return i;
            }
        }
    }

    return null;
}

/// 找任一字符在 haystack 中首次出现的位置
pub fn indexOfAny(haystack: []const u8, chars: []const u8) ?usize {
    if (chars.len == 0) return null;
    if (haystack.len == 0) return null;

    const first = chars[0];
    const first_v: @Vector(BLOCK_SIZE, u8) = @splat(first);

    var i: usize = 0;
    while (i + BLOCK_SIZE <= haystack.len) : (i += BLOCK_SIZE) {
        const chunk: @Vector(BLOCK_SIZE, u8) = haystack[i..][0..BLOCK_SIZE].*;
        const eq: @Vector(BLOCK_SIZE, bool) = chunk == first_v;
        inline for (0..BLOCK_SIZE) |j| {
            if (eq[j]) return i + j;
        }
    }
    while (i < haystack.len) : (i += 1) {
        for (chars) |c| {
            if (haystack[i] == c) return i;
        }
    }
    return null;
}

/// 统计 needle 在 haystack 中出现次数
pub fn countOccurrences(haystack: []const u8, needle: []const u8) usize {
    if (needle.len == 0) return 0;
    var count: usize = 0;
    var i: usize = 0;
    while (indexOf(haystack[i..], needle)) |rel| {
        count += 1;
        i += rel + needle.len;
    }
    return count;
}

test "indexOf - found" {
    const h = "hello world hello";
    try std.testing.expect(indexOf(h, "hello") != null);
    try std.testing.expectEqual(@as(usize, 0), indexOf(h, "hello").?);
}

test "indexOf - not found" {
    try std.testing.expect(indexOf("hello", "xyz") == null);
}

test "indexOf - empty needle" {
    try std.testing.expectEqual(@as(usize, 0), indexOf("hello", "").?);
}

test "indexOf - large haystack" {
    var buf: [1000]u8 = undefined;
    for (&buf, 0..) |*b, i| b.* = if (i % 100 == 50) 'X' else '.';
    const pos = indexOf(&buf, "X") orelse return error.TestUnexpectedResult;
    try std.testing.expectEqual(@as(usize, 50), pos);
}

test "indexOfScalar matches indexOf" {
    const h = "the quick brown fox jumps over the lazy dog";
    const n = "fox";
    try std.testing.expectEqual(indexOfScalar(h, n), indexOf(h, n));
}

test "countOccurrences" {
    try std.testing.expectEqual(@as(usize, 3), countOccurrences("ababab", "ab"));
    try std.testing.expectEqual(@as(usize, 0), countOccurrences("hello", "xyz"));
}

test "indexOfAny - first" {
    try std.testing.expectEqual(@as(usize, 2), indexOfAny("hello", "lo").?);
}

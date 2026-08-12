//! JSON Lines 解析器
//!
//! 演示：
//! - std.json 解析
//! - 动态值与类型转换
//! - 错误集合组合

const std = @import("std");

/// JSON 解析后的通用值
pub const Value = std.json.Value;

/// 解析一行 JSON
pub fn parseOne(alloc: std.mem.Allocator, line: []const u8) !std.json.Parsed(Value) {
    return try std.json.parseFromSlice(Value, alloc, line, .{});
}

/// 解析多行
pub fn parseAll(alloc: std.mem.Allocator, lines: []const []const u8) ![]std.json.Parsed(Value) {
    var out: std.ArrayList(std.json.Parsed(Value)) = .empty;
    defer out.deinit(alloc);

    for (lines) |line| {
        if (parseOne(alloc, line)) |parsed| {
            try out.append(alloc, parsed);
        } else |_| {
            // 跳过坏行
        }
    }

    return out.toOwnedSlice(alloc);
}

/// 便利函数：尝试读取 JSON 对象的 "level" 字段
pub fn extractString(value: Value, key: []const u8) ?[]const u8 {
    if (value != .object) return null;
    const obj = value.object;
    const entry = obj.get(key) orelse return null;
    if (entry != .string) return null;
    return entry.string;
}

test "parseOne - simple object" {
    const alloc = std.testing.allocator;
    const line = "{\"level\":\"INFO\",\"msg\":\"hello\"}";
    const parsed = try parseOne(alloc, line);
    defer parsed.deinit();

    try std.testing.expectEqualStrings("INFO", extractString(parsed.value, "level").?);
}

test "extractString - missing key" {
    const alloc = std.testing.allocator;
    const line = "{\"a\":1}";
    const parsed = try parseOne(alloc, line);
    defer parsed.deinit();

    try std.testing.expect(extractString(parsed.value, "missing") == null);
}

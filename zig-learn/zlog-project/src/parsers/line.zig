//! 行解析与格式探测
//!
//! 演示：
//! - 标签联合（tagged union）的状态机
//! - comptime 字符串模式匹配
//! - 错误集合的精确化
//! - unmanaged ArrayList 模式
//! - 0.16 std.Io 风格文件 I/O

const std = @import("std");

/// 支持的日志格式
pub const Format = enum {
    /// 自动检测
    auto,
    /// 纯行文本（每行一条记录）
    line,
    /// Apache/Nginx Common Log
    apache,
    /// JSON Lines
    json,
};

/// 解析结果
pub const ParseResult = struct {
    /// 各行（owned, 调用者负责 free）
    lines: [][]u8,
    /// 读取的总字节数
    bytes_read: u64,
    /// 实际检测到的格式
    detected_format: Format,
};

/// 解析文件入口（0.16 风格：使用 std.Io）
pub fn parseFile(alloc: std.mem.Allocator, path: []const u8, format: Format) !ParseResult {
    var threaded: std.Io.Threaded = .init_single_threaded;
    const io = threaded.io();

    // 用 Io.Dir.cwd() 打开相对路径文件
    const file = std.Io.Dir.cwd().openFile(io, path, .{}) catch |err| {
        std.debug.print("无法打开 {s}: {s}\n", .{ path, @errorName(err) });
        return err;
    };
    defer file.close(io);

    // 1. 读全部内容到 buffer
    var buf_list: std.ArrayList(u8) = .empty;
    defer buf_list.deinit(alloc);
    var read_buf: [4096]u8 = undefined;
    var reader = file.reader(io, &read_buf);
    while (true) {
        const n = reader.interface.readSliceShort(&read_buf) catch |err| switch (err) {
            error.ReadFailed => break,
        };
        if (n == 0) break;
        try buf_list.appendSlice(alloc, read_buf[0..n]);
        if (buf_list.items.len > 1024 * 1024 * 1024) return error.StreamTooLong;
    }
    const content = try buf_list.toOwnedSlice(alloc);
    defer alloc.free(content);

    // 按行切分
    var lines: std.ArrayList([]u8) = .empty;
    defer lines.deinit(alloc);

    var iter = std.mem.splitScalar(u8, content, '\n');
    while (iter.next()) |raw| {
        const trimmed = if (raw.len > 0 and raw[raw.len - 1] == '\r')
            raw[0 .. raw.len - 1]
        else
            raw;
        if (trimmed.len == 0) continue;
        const dup = try alloc.dupe(u8, trimmed);
        try lines.append(alloc, dup);
    }

    // 探测格式（如果未指定）
    const detected: Format = if (format == .auto) detectFormat(lines.items) else format;

    return .{
        .lines = try lines.toOwnedSlice(alloc),
        .bytes_read = content.len,
        .detected_format = detected,
    };
}

/// 简易格式探测：取首行扫描特征
fn detectFormat(lines: []const []const u8) Format {
    if (lines.len == 0) return .line;

    const first = lines[0];
    if (first.len == 0) return .line;

    // JSON Lines 特征：以 '{' 开头
    if (first[0] == '{') return .json;

    // Apache Common Log 特征：包含 " - - [" 形式
    if (std.mem.indexOf(u8, first, " - - [") != null) return .apache;

    return .line;
}

test "detectFormat - json" {
    const lines = [_][]const u8{ "{\"a\":1}", "{\"a\":2}" };
    try std.testing.expectEqual(Format.json, detectFormat(&lines));
}

test "detectFormat - apache" {
    const lines = [_][]const u8{
        "127.0.0.1 - - [10/Oct/2023:13:55:36 -0700] \"GET / HTTP/1.1\" 200 2326",
    };
    try std.testing.expectEqual(Format.apache, detectFormat(&lines));
}

test "detectFormat - line" {
    const lines = [_][]const u8{ "INFO: hello world" };
    try std.testing.expectEqual(Format.line, detectFormat(&lines));
}

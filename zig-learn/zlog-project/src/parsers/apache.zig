//! Apache / Nginx Common Log 解析器
//!
//! 演示：
//! - 结构体字段布局
//! - 字符串切片与索引搜索
//! - 错误联合传递
//! - 标签联合的轻量构造

const std = @import("std");

/// 解析后的一条 Apache 日志
pub const Entry = struct {
    /// 客户端 IP
    host: []const u8,
    /// 用户标识（通常 "-"）
    ident: []const u8,
    /// 用户名
    user: []const u8,
    /// 时间戳原始文本
    timestamp: []const u8,
    /// 请求行（如 `GET /index.html HTTP/1.1`）
    request: []const u8,
    /// 状态码
    status: u16,
    /// 响应字节数
    bytes: u64,

    /// 解析错误
    pub const ParseError = error{
        MalformedLine,
        InvalidNumber,
    };
};

/// 解析单行 Apache 日志
pub fn parseOne(line: []const u8) Entry.ParseError!Entry {
    // 1. host
    const sp1 = std.mem.indexOfScalar(u8, line, ' ') orelse return error.MalformedLine;
    const host = line[0..sp1];
    var rest = line[sp1 + 1 ..];

    // 2. ident
    const sp2 = std.mem.indexOfScalar(u8, rest, ' ') orelse return error.MalformedLine;
    const ident = rest[0..sp2];
    rest = rest[sp2 + 1 ..];

    // 3. user
    const sp3 = std.mem.indexOfScalar(u8, rest, ' ') orelse return error.MalformedLine;
    const user = rest[0..sp3];
    rest = rest[sp3 + 1 ..];

    // 4. timestamp [10/Oct/2023:13:55:36 -0700]
    const ts_end = std.mem.indexOf(u8, rest, "] ") orelse return error.MalformedLine;
    const timestamp = rest[0 .. ts_end + 1];
    rest = rest[ts_end + 2 ..];

    // 5. request "GET /index.html HTTP/1.1"
    const req_start = std.mem.indexOfScalar(u8, rest, '"') orelse return error.MalformedLine;
    rest = rest[req_start + 1 ..];
    const req_end = std.mem.indexOfScalar(u8, rest, '"') orelse return error.MalformedLine;
    const request = rest[0..req_end];
    rest = rest[req_end + 1 ..];

    // 6. status
    // 跳过引号后的空格
    var after_req_space = rest;
    if (after_req_space.len > 0 and after_req_space[0] == ' ') after_req_space = after_req_space[1..];
    // 6. status
    const sp4 = std.mem.indexOfScalar(u8, after_req_space, ' ') orelse return error.MalformedLine;
    const status_str = after_req_space[0..sp4];
    const status = std.fmt.parseInt(u16, status_str, 10) catch return error.InvalidNumber;
    rest = after_req_space[sp4 + 1 ..];
    const bytes = blk: {
        if (std.mem.eql(u8, rest, "-")) break :blk @as(u64, 0);
        if (rest.len == 0) break :blk @as(u64, 0);
        break :blk std.fmt.parseInt(u64, rest, 10) catch return error.InvalidNumber;
    };

    return .{
        .host = host,
        .ident = ident,
        .user = user,
        .timestamp = timestamp,
        .request = request,
        .status = status,
        .bytes = bytes,
    };
}

/// 解析多行
pub fn parseAll(alloc: std.mem.Allocator, lines: []const []const u8) ![]Entry {
    var out: std.ArrayList(Entry) = .empty;
    defer out.deinit(alloc);

    for (lines) |line| {
        if (parseOne(line)) |entry| {
            try out.append(alloc, entry);
        } else |_| {
            // 跳过无法解析的行
        }
    }

    return out.toOwnedSlice(alloc);
}

test "parseOne - simple" {
    const line = "127.0.0.1 - - [10/Oct/2023:13:55:36 -0700] \"GET /index.html HTTP/1.1\" 200 2326";
    const entry = try parseOne(line);
    try std.testing.expectEqualStrings("127.0.0.1", entry.host);
    try std.testing.expectEqual(@as(u16, 200), entry.status);
    try std.testing.expectEqual(@as(u64, 2326), entry.bytes);
}

test "parseOne - dash bytes" {
    const line = "10.0.0.1 - alice [01/Jan/2024:00:00:00 +0000] \"POST /api HTTP/1.1\" 500 -";
    const entry = try parseOne(line);
    try std.testing.expectEqualStrings("10.0.0.1", entry.host);
    try std.testing.expectEqualStrings("alice", entry.user);
    try std.testing.expectEqual(@as(u16, 500), entry.status);
    try std.testing.expectEqual(@as(u64, 0), entry.bytes);
}

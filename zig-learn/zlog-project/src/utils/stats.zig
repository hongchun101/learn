//! 统计与反射打印
//!
//! 演示：
//! - @typeInfo 反射
//! - 编译期对结构体字段迭代
//! - hash 表（StringHashMapUnmanaged）的使用
//! - 排序与 Top-N
//! - comptime 字符串插值

const std = @import("std");

const Allocator = std.mem.Allocator;

/// 计数过的项
pub const Counted = struct {
    value: []const u8,
    count: usize,
};

/// 统计结果
pub const TopEntries = struct {
    items: []Counted,

    pub fn deinit(self: *TopEntries, alloc: Allocator) void {
        alloc.free(self.items);
    }
};

/// 字符串直方图：计数 + Top-N
pub fn topStrings(alloc: Allocator, values: []const []const u8, n: usize) !TopEntries {
    var counts: std.StringHashMapUnmanaged(usize) = .empty;
    defer counts.deinit(alloc);

    for (values) |v| {
        const gop = try counts.getOrPut(alloc, v);
        if (gop.found_existing) {
            gop.value_ptr.* += 1;
        } else {
            gop.value_ptr.* = 1;
        }
    }

    // 收集并排序
    var entries: std.ArrayList(Counted) = .empty;
    defer entries.deinit(alloc);

    var it = counts.iterator();
    while (it.next()) |kv| {
        try entries.append(alloc, .{
            .value = kv.key_ptr.*,
            .count = kv.value_ptr.*,
        });
    }

    // 按 count 降序
    std.mem.sort(Counted, entries.items, {}, lessThan);

    const top = @min(n, entries.items.len);
    const owned = try alloc.dupe(Counted, entries.items[0..top]);
    return .{ .items = owned };
}

fn lessThan(_: void, a: Counted, b: Counted) bool {
    return a.count > b.count;
}

/// 打印 Top-N（使用 std.debug.print）
pub fn printTopPathsSimple(paths: []const []const u8, n: usize) void {
    const alloc = std.heap.page_allocator;
    var top = topStrings(alloc, paths, n) catch return;
    defer top.deinit(alloc);

    std.debug.print("Top paths:\n", .{});
    for (top.items, 0..) |e, i| {
        std.debug.print("  {d:>2}. [{d:>5}] {s}\n", .{ i + 1, e.count, e.value });
    }
}

/// 反射示例：用 comptime 迭代结构体字段
pub fn printStatStruct(w: *std.Io.Writer, comptime T: type, value: T) !void {
    const info = @typeInfo(T).@"struct";
    try w.print("{s} {{\n", .{@typeName(T)});
    inline for (info.fields) |field| {
        try w.print("  {s}: {any}\n", .{ field.name, @field(value, field.name) });
    }
    try w.writeAll("}\n");
}

/// 演示用：简单 stat 结构
pub const LineStats = struct {
    total: usize = 0,
    info: usize = 0,
    warn: usize = 0,
    err_count: usize = 0,
    debug: usize = 0,
};

/// 统计一个 lines 数组中各级别数量
pub fn countLevels(_: Allocator, lines: []const []const u8) !LineStats {
    var s = LineStats{};
    s.total = lines.len;

    for (lines) |line| {
        if (std.mem.indexOf(u8, line, "INFO") != null) s.info += 1;
        if (std.mem.indexOf(u8, line, "WARN") != null) s.warn += 1;
        if (std.mem.indexOf(u8, line, "ERROR") != null) s.err_count += 1;
        if (std.mem.indexOf(u8, line, "DEBUG") != null) s.debug += 1;
    }

    return s;
}

test "countLevels" {
    const alloc = std.testing.allocator;
    const lines = [_][]const u8{
        "INFO: hello",
        "WARN: oops",
        "ERROR: bad",
    };
    const s = try countLevels(alloc, &lines);
    try std.testing.expectEqual(@as(usize, 1), s.info);
    try std.testing.expectEqual(@as(usize, 1), s.warn);
    try std.testing.expectEqual(@as(usize, 1), s.err_count);
}

test "topStrings" {
    const alloc = std.testing.allocator;
    const items = [_][]const u8{ "/a", "/a", "/b", "/a", "/c", "/b", "/a" };
    var top = try topStrings(alloc, &items, 3);
    defer top.deinit(alloc);

    try std.testing.expectEqual(@as(usize, 3), top.items.len);
    try std.testing.expectEqualStrings("/a", top.items[0].value);
    try std.testing.expectEqual(@as(usize, 4), top.items[0].count);
}

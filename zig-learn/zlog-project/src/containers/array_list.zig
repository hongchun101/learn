//! 通用 ArrayList 容器（教育性重写）
//!
//! 演示：
//! - 泛型类型生成（comptime type factory）
//! - unmanaged 模式
//! - 0.16 错误集合组合
//! - @intCast 显式转换

const std = @import("std");

const Allocator = std.mem.Allocator;

pub fn ArrayList(comptime T: type) type {
    return struct {
        const Self = @This();

        items: []T = &[_]T{},
        capacity: usize = 0,

        pub const empty: Self = .{};

        pub fn deinit(self: *Self, alloc: Allocator) void {
            if (self.capacity != 0) {
                alloc.free(self.items.ptr[0..self.capacity]);
            }
            self.* = .empty;
        }

        pub fn append(self: *Self, alloc: Allocator, value: T) !void {
            try self.ensureCapacity(alloc, self.items.len + 1);
            self.items.ptr[self.items.len] = value;
            self.items.len += 1;
        }

        pub fn appendSlice(self: *Self, alloc: Allocator, values: []const T) !void {
            try self.ensureCapacity(alloc, self.items.len + values.len);
            @memcpy(self.items.ptr[self.items.len .. self.items.len + values.len], values);
            self.items.len += values.len;
        }

        pub fn ensureCapacity(self: *Self, alloc: Allocator, new_capacity: usize) !void {
            if (new_capacity <= self.capacity) return;

            // 1.5x 增长策略
            var grown = self.capacity;
            while (grown < new_capacity) : (grown += @max(grown / 2, 4)) {}

            const new_ptr = try alloc.realloc(self.items.ptr[0..self.capacity], grown);
            self.items = new_ptr[0..self.items.len];
            self.capacity = grown;
        }

        pub fn toOwnedSlice(self: *Self, alloc: Allocator) ![]T {
            const copy = try alloc.dupe(T, self.items);
            self.* = .empty;
            return copy;
        }

        pub fn clearRetainingCapacity(self: *Self) void {
            self.items.len = 0;
        }

        pub fn get(self: Self, index: usize) !T {
            if (index >= self.items.len) return error.IndexOutOfRange;
            return self.items[index];
        }
    };
}

test "ArrayList basic usage" {
    const alloc = std.testing.allocator;
    var list: ArrayList(u32) = .empty;
    defer list.deinit(alloc);

    try list.append(alloc, 1);
    try list.append(alloc, 2);
    try list.append(alloc, 3);
    try list.appendSlice(alloc, &[_]u32{ 4, 5 });

    try std.testing.expectEqual(@as(usize, 5), list.items.len);
    try std.testing.expectEqual(@as(u32, 1), list.items[0]);
    try std.testing.expectEqual(@as(u32, 5), list.items[4]);
}

test "ArrayList growth" {
    const alloc = std.testing.allocator;
    var list: ArrayList(u8) = .empty;
    defer list.deinit(alloc);

    var i: usize = 0;
    while (i < 1000) : (i += 1) {
        try list.append(alloc, @intCast(i % 256));
    }
    try std.testing.expectEqual(@as(usize, 1000), list.items.len);
    try std.testing.expectEqual(@as(u8, 0), list.items[0]);
    try std.testing.expectEqual(@as(u8, 231), list.items[1000 - 1]);
}

test "ArrayList get OOB" {
    const alloc = std.testing.allocator;
    var list: ArrayList(u32) = .empty;
    defer list.deinit(alloc);
    try list.append(alloc, 42);
    try std.testing.expectError(error.IndexOutOfRange, list.get(10));
}

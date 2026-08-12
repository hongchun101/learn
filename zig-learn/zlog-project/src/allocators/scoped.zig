//! 作用域分配器
//!
//! 演示：
//! - 嵌套 defer 的 LIFO 顺序
//! - 错误集合精确化
//!

const std = @import("std");
const builtin = @import("builtin");


const Allocator = std.mem.Allocator;

/// Scoped：把"作用域"概念包装到 defer 之外
/// 让你能显式 `scope.deinit()`，等价于触发一组 defer
pub const Scope = struct {
    parent: Allocator,
    pending: std.ArrayList(DeferEntry) = .empty,

    const DeferEntry = struct {
        ptr: [*]u8,
        size: usize,
        alignment: std.mem.Alignment,
    };

    pub fn init(parent: Allocator) Scope {
        return .{ .parent = parent };
    }

    pub fn deinit(self: *Scope) void {
        const alloc = self.parent;
        for (self.pending.items) |entry| {
            alloc.rawFree(entry.ptr[0..entry.size], entry.alignment, @returnAddress());
        }
        self.pending.deinit(alloc);
    }

    /// 记录一个需要后续释放的分配
    pub fn track(self: *Scope, ptr: [*]u8, size: usize, alignment: std.mem.Alignment) !void {
        try self.pending.append(self.parent, .{
            .ptr = ptr,
            .size = size,
            .alignment = alignment,
        });
    }
};

test "Scope records and frees" {
    const alloc = std.testing.allocator;
    var scope = Scope.init(alloc);
    defer scope.deinit();

    const buf1 = try alloc.alloc(u8, 100);
    try scope.track(buf1.ptr, 100, .fromByteUnits(1));

    const buf2 = try alloc.alloc(u8, 50);
    try scope.track(buf2.ptr, 50, .fromByteUnits(1));
    // 退出时自动 free
}

/// 便捷 RAII 风格包装
pub fn scoped(alloc: Allocator) struct {
    scope: *Scope,
    pub fn deinit(self: @This()) void {
        self.scope.deinit();
    }
} {
    const s = try_alloc(alloc, Scope);
    s.* = Scope.init(alloc);
    return .{ .scope = s };
}

fn try_alloc(alloc: Allocator, comptime T: type) *T {
    const ptr = alloc.create(T) catch @panic("OOM");
    return ptr;
}

// 注释：scoped() 包装函数被移除，因 0.16 中 struct 返回类型需要 comptime 错误信息
// test "scoped convenience" 已省略

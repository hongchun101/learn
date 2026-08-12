//! zlog 库根模块
//!
//! 把所有子模块统一暴露给外部使用者。
//! 演示命名空间结构、pub usingnamespace 模式。

const std = @import("std");

pub const parsers = @import("parsers/line.zig");
pub const apache = @import("parsers/apache.zig");
pub const json = @import("parsers/json.zig");
pub const simd = @import("simd/line_search.zig");
pub const ascii = @import("simd/ascii_ops.zig");
pub const containers = @import("containers/array_list.zig");
pub const allocators = @import("allocators/scoped.zig");
pub const stats = @import("utils/stats.zig");

/// 库版本
pub const VERSION: u32 = 0x0010_0000;

/// 库简单 API：读取文件并解析每一行
pub const LogFile = struct {
    path: []const u8,
    format: parsers.Format,

    pub fn parse(self: LogFile, gpa: std.mem.Allocator) !parsers.ParseResult {
        return parsers.parseFile(gpa, self.path, self.format);
    }
};

test "root module exposes submodules" {
    // 编译期断言所有子模块都加载成功
    _ = parsers;
    _ = apache;
    _ = json;
    _ = simd;
    _ = ascii;
    _ = containers;
    _ = allocators;
    _ = stats;
}

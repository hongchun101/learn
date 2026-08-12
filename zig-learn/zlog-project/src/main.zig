//! zlog CLI 入口（0.16 "Juicy Main" 风格）
//!
//! 演示：
//! - 0.16 推荐 main 签名 `fn (init: std.process.Init) !void`
//! - 自动获得 gpa/arena/io
//! - 子命令解析
//! - 调用 zlog 库各模块
//! - 错误传播与展示

const std = @import("std");
const zlog = @import("zlog");

const Args = struct {
    command: Command = .help,
    path: []const u8 = "",
    format: zlog.parsers.Format = .auto,
    top_n: usize = 10,
    show_help: bool = false,

    const Command = enum { help, parse, stats, bench };
};

pub fn main(init: std.process.Init) !void {
    const gpa = init.gpa;
    const arena = init.arena.allocator();

    // 在 juicy main 里，args 不再需要 alloc/free
    const argv = try init.minimal.args.toSlice(arena);

    var parsed: Args = .{};
    var i: usize = 1;
    while (i < argv.len) : (i += 1) {
        const a = argv[i];
        if (std.mem.eql(u8, a, "--help") or std.mem.eql(u8, a, "-h")) {
            parsed.show_help = true;
        } else if (std.mem.eql(u8, a, "parse")) {
            parsed.command = .parse;
        } else if (std.mem.eql(u8, a, "stats")) {
            parsed.command = .stats;
        } else if (std.mem.eql(u8, a, "bench")) {
            parsed.command = .bench;
        } else if (std.mem.startsWith(u8, a, "--format=")) {
            const val = a["--format=".len..];
            parsed.format = std.meta.stringToEnum(zlog.parsers.Format, val) orelse .auto;
        } else if (std.mem.startsWith(u8, a, "--top=")) {
            parsed.top_n = std.fmt.parseInt(usize, a["--top=".len..], 10) catch 10;
        } else if (parsed.path.len == 0) {
            parsed.path = a;
        } else {
            std.debug.print("未知参数: {s}\n", .{a});
        }
    }

    if (parsed.show_help or parsed.command == .help) {
        printUsage();
        return;
    }

    if (parsed.path.len == 0) {
        std.debug.print("错误: 未提供文件路径\n\n", .{});
        printUsage();
        std.process.exit(1);
    }

    switch (parsed.command) {
        .help => printUsage(),
        .parse => try cmdParse(gpa, parsed),
        .stats => try cmdStats(gpa, parsed),
        .bench => try cmdBench(gpa, parsed),
    }
}

fn printUsage() void {
    std.debug.print(
        \\zlog - 高性能日志分析器
        \\
        \\用法:
        \\  zlog parse <file> [--format=auto|line|apache|json]
        \\  zlog stats <file> [--top=N]
        \\  zlog bench <file> [--format=auto|line|apache|json]
        \\  zlog --help
        \\
    , .{});
}

fn cmdParse(alloc: std.mem.Allocator, args: Args) !void {
    const result = try zlog.parsers.parseFile(alloc, args.path, args.format);
    defer {
        for (result.lines) |line| alloc.free(line);
        alloc.free(result.lines);
    }

    std.debug.print("解析完成: {d} 行，{d} 字节\n", .{ result.lines.len, result.bytes_read });
    std.debug.print("格式: {s}\n", .{@tagName(result.detected_format)});

    const max_preview: usize = @min(5, result.lines.len);
    std.debug.print("---\n", .{});
    for (result.lines[0..max_preview], 0..) |line, idx| {
        std.debug.print("[{d:0>3}] {s}\n", .{ idx, line });
    }
    if (result.lines.len > max_preview) {
        std.debug.print("... 还有 {d} 行\n", .{result.lines.len - max_preview});
    }
}

fn cmdStats(alloc: std.mem.Allocator, args: Args) !void {
    const result = try zlog.parsers.parseFile(alloc, args.path, args.format);
    defer {
        for (result.lines) |line| alloc.free(line);
        alloc.free(result.lines);
    }

    std.debug.print("文件: {s}\n", .{args.path});
    std.debug.print("行数: {d}\n", .{result.lines.len});
    std.debug.print("字节: {d}\n", .{result.bytes_read});

    if (result.detected_format == .apache) {
        const parsed_apache = try zlog.apache.parseAll(alloc, result.lines);
        defer alloc.free(parsed_apache);
        const paths = try alloc.alloc([]const u8, parsed_apache.len);
        defer alloc.free(paths);
        for (parsed_apache, 0..) |entry, i| {
            paths[i] = entry.request;
        }
        zlog.stats.printTopPathsSimple(paths, args.top_n);
    } else if (result.detected_format == .json) {
        const parsed_json = try zlog.json.parseAll(alloc, result.lines);
        defer {
            for (parsed_json) |p| p.deinit();
            alloc.free(parsed_json);
        }
        std.debug.print("已解析 {d} 个 JSON 记录\n", .{parsed_json.len});
    } else {
        const s = try zlog.stats.countLevels(alloc, result.lines);
        std.debug.print("INFO: {d}\nWARN: {d}\nERROR: {d}\nDEBUG: {d}\n", .{
            s.info, s.warn, s.err_count, s.debug,
        });
    }
}

fn cmdBench(alloc: std.mem.Allocator, args: Args) !void {
    // 0.16 时间测量
    var threaded: std.Io.Threaded = .init_single_threaded;
    const io = threaded.io();
    const start_t = std.Io.Clock.now(.awake, io);
    const result = try zlog.parsers.parseFile(alloc, args.path, args.format);
    const end_t = std.Io.Clock.now(.awake, io);
    const parse_ns: u64 = @intCast(@max(0, end_t.toNanoseconds() -| start_t.toNanoseconds()));
    defer {
        for (result.lines) |line| alloc.free(line);
        alloc.free(result.lines);
    }
    // SIMD 加速演示：搜索 "ERROR" 关键字
    if (result.lines.len > 0) {
        const s_start = std.Io.Clock.now(.awake, io);
        var hits: usize = 0;
        for (result.lines) |line| {
            if (zlog.simd.indexOf(line, "ERROR") != null) {
                hits += 1;
            }
        }
        const s_end = std.Io.Clock.now(.awake, io);
        const search_ns: u64 = @intCast(@max(0, s_end.toNanoseconds() -| s_start.toNanoseconds()));
        const search_ms: f64 = @as(f64, @floatFromInt(search_ns)) / 1_000_000.0;
        std.debug.print("SIMD 搜索 'ERROR': {d} hits, {d:.2} ms\n", .{ hits, search_ms });
    }

    const fparse_ns: f64 = @floatFromInt(parse_ns);
    const parse_ms = fparse_ns / 1_000_000.0;
    const mb = @as(f64, @floatFromInt(result.bytes_read)) / 1_024.0 / 1_024.0;
    const throughput = mb / (fparse_ns / 1_000_000_000.0);
    std.debug.print("解析: {d} 行 {d} 字节 in {d:.2} ms ({d:.2} MB/s)\n", .{
        result.lines.len,
        result.bytes_read,
        parse_ms,
        throughput,
    });
}

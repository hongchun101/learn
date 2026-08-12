//! zlog 的构建脚本
//!
//! 演示 0.16 build system 的多个核心 API：
//! - createModule 创建可复用模块
//! - addExecutable / addLibrary 产出物
//! - addTest 测试步骤
//! - addTranslateC 翻译 C 头
//! - installArtifact 安装
//! - root_module.linkSystemLibrary 链接系统库（zlib）

const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // ====== C 翻译模块（zlib 接口） ======
    const translate_c = b.addTranslateC(.{
        .root_source_file = b.path("c/zlib.h"),
        .target = target,
        .optimize = optimize,
    });
    const c_zlib_mod = translate_c.createModule();

    // ====== 主库模块（zlog 库） ======
    const zlog_mod = b.createModule(.{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    zlog_mod.addImport("c_zlib", c_zlib_mod);

    // ====== 静态库产物 ======
    const lib = b.addLibrary(.{
        .linkage = .static,
        .name = "zlog",
        .root_module = zlog_mod,
    });
    b.installArtifact(lib);

    // ====== 主可执行 ======
    const exe = b.addExecutable(.{
        .name = "zlog",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    exe.root_module.addImport("zlog", zlog_mod);
    exe.root_module.addImport("c_zlib", c_zlib_mod);

    // 仅在 POSIX 平台链接 z（Windows 改用 zlib1.dll）
    if (target.result.os.tag != .windows) {
        exe.root_module.linkSystemLibrary("z", .{});
    }
    b.installArtifact(exe);

    // ====== 跑 run step ======
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_cmd.addArgs(args);

    const run_step = b.step("run", "运行 zlog");
    run_step.dependOn(&run_cmd.step);

    // ====== 测试 ======
    const lib_tests = b.addTest(.{
        .root_module = zlog_mod,
    });
    lib_tests.root_module.addImport("c_zlib", c_zlib_mod);
    const run_lib_tests = b.addRunArtifact(lib_tests);

    const test_step = b.step("test", "运行单元测试");
    test_step.dependOn(&run_lib_tests.step);
}

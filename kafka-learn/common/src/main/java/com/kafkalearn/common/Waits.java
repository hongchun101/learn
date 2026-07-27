package com.kafkalearn.common;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;

/**
 * 每个实验都使用的简易等待辅助类，避免在每个 Main 中重复相同的
 * {@code while} 循环。
 */
public final class Waits {

    private Waits() {}

    /** 每隔 {@code pollMs} 毫秒轮询条件，最长持续 {@code timeoutMs}。 */
    public static boolean await(String description,
                                BooleanSupplier condition,
                                long timeoutMs,
                                long pollMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) return true;
            try { TimeUnit.MILLISECONDS.sleep(pollMs); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return false; }
        }
        return false;
    }

    /** 响应中断的休眠辅助方法。 */
    public static void sleep(long ms) {
        try { TimeUnit.MILLISECONDS.sleep(ms); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    /** 一次性闩锁。 */
    public static class Latch {
        private final AtomicBoolean done = new AtomicBoolean(false);
        public void release() { done.set(true); }
        public boolean done() { return done.get(); }
    }
}

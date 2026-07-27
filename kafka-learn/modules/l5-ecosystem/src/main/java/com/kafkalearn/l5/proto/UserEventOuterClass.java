package com.kafkalearn.l5.proto;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * {@link UserEvent} 的手写 Protobuf 风格编码器。
 *
 * <p>用于教学，替代由 .proto 生成的 Java 类。线格式遵循 Protobuf 规范：
 * tag = (field_num &lt;&lt; 3) | wire_type。线类型：0 = varint、
 * 1 = 64-bit、2 = 长度分隔、5 = 32-bit。字符串和嵌套消息使用
 * 类型 2（长度分隔）。</p>
 */
public final class UserEventOuterClass {

    private UserEventOuterClass() {}

    public enum EventType {
        UNKNOWN(0), CLICK(1), VIEW(2), PURCHASE(3);
        public final int number;
        EventType(int n) { this.number = n; }
        public static EventType forNumber(int n) {
            for (EventType t : values()) if (t.number == n) return t;
            return UNKNOWN;
        }
    }

    public static final class Builder {
        private String userId = "";
        private EventType type = EventType.UNKNOWN;
        private Double amount = null;
        private String url = null;
        private long ts = 0L;

        public Builder setUserId(String v) { this.userId = v; return this; }
        public Builder setType(EventType v) { this.type = v; return this; }
        public Builder setAmount(double v) { this.amount = v; this.url = null; return this; }
        public Builder setUrl(String v) { this.url = v; this.amount = null; return this; }
        public Builder setTs(long v) { this.ts = v; return this; }

        public UserEvent build() { return new UserEvent(userId, type, amount, url, ts); }
    }

    public static final class UserEvent {
        private final String userId;
        private final EventType type;
        private final Double amount;
        private final String url;
        private final long ts;

        private UserEvent(String userId, EventType type, Double amount, String url, long ts) {
            this.userId = userId; this.type = type;
            this.amount = amount; this.url = url; this.ts = ts;
        }

        public String getUserId() { return userId; }
        public EventType getType() { return type; }
        public Double getAmount() { return amount; }
        public String getUrl() { return url; }
        public long getTs() { return ts; }

        public byte[] toByteArray() {
            ByteBuffer buf = ByteBuffer.allocate(2 + 5 + 2 + 8 + 2 + 256 + 2 + 8);
            writeString(buf, 1, userId);
            writeVarint(buf, 2, type.number);
            if (amount != null) writeFixed64(buf, 3, Double.doubleToRawLongBits(amount));
            if (url != null)    writeString(buf, 4, url);
            writeVarint(buf, 5, ts);
            return Arrays.copyOf(buf.array(), buf.position());
        }

        public int getSerializedSize() { return toByteArray().length; }

        @Override public String toString() {
            return "UserEvent{userId=" + userId + ", type=" + type
                    + (amount != null ? ", amount=" + amount : "")
                    + (url != null ? ", url=" + url : "")
                    + ", ts=" + ts + "}";
        }
    }

    public static Builder newBuilder() { return new Builder(); }

    private static final int WIRE_VARINT = 0;
    private static final int WIRE_64BIT  = 1;
    private static final int WIRE_LEN    = 2;

    /** 写入 tag 和 varint value。 */
    private static void writeVarint(ByteBuffer buf, int field, long value) {
        buf.put((byte) ((field << 3) | WIRE_VARINT));
        long v = value;
        while ((v & ~0x7FL) != 0) {
            buf.put((byte) ((v & 0x7F) | 0x80));
            v >>>= 7;
        }
        buf.put((byte) v);
    }

    /** 写入 tag 和原始 64-bit value。 */
    private static void writeFixed64(ByteBuffer buf, int field, long value) {
        buf.put((byte) ((field << 3) | WIRE_64BIT));
        buf.putLong(value);
    }

    /** 写入 tag 和长度分隔的字符串（线类型 2）。 */
    private static void writeString(ByteBuffer buf, int field, String s) {
        byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
        buf.put((byte) ((field << 3) | WIRE_LEN));
        // 长度是 varint（无 tag）
        int v = bytes.length;
        List<Byte> tmp = new ArrayList<>();
        while ((v & ~0x7F) != 0) {
            tmp.add((byte) ((v & 0x7F) | 0x80));
            v >>>= 7;
        }
        tmp.add((byte) v);
        for (byte b : tmp) buf.put(b);
        buf.put(bytes);
    }
}

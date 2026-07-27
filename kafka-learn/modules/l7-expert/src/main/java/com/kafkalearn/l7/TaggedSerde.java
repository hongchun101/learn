package com.kafkalearn.l7;

import org.apache.kafka.common.errors.SerializationException;
import org.apache.kafka.common.serialization.Deserializer;
import org.apache.kafka.common.serialization.Serde;
import org.apache.kafka.common.serialization.Serializer;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * L7 — 自定义 {@link Serde},在 payload 之前添加一个字节的 *tag*,以便
 * deserializer 能据此选用对应的 codec。
 *
 * <p>在 EOS 端到端示例中使用它,可在同一 topic 上同时传输一种 JSON
 * 事件和另一种自定义二进制事件。</p>
 */
public final class TaggedSerde implements Serde<Object> {

    public static final byte TAG_JSON  = 1;
    public static final byte TAG_OTHER = 2;

    @Override public Serializer<Object> serializer()   { return new TaggedSerializer(); }
    @Override public Deserializer<Object> deserializer(){ return new TaggedDeserializer(); }

    @Override public void configure(Map<String, ?> configs, boolean isKey) {}
    @Override public void close() {}

    static final class TaggedSerializer implements Serializer<Object> {
        @Override public byte[] serialize(String topic, Object data) {
            if (data == null) return null;
            if (data instanceof String) {
                byte[] payload = ((String) data).getBytes(StandardCharsets.UTF_8);
                return ByteBuffer.allocate(1 + payload.length).put(TAG_JSON).put(payload).array();
            }
            throw new SerializationException("Unsupported type: " + data.getClass());
        }
    }

    static final class TaggedDeserializer implements Deserializer<Object> {
        @Override public Object deserialize(String topic, byte[] data) {
            if (data == null || data.length == 0) return null;
            byte tag = data[0];
            byte[] rest = new byte[data.length - 1];
            System.arraycopy(data, 1, rest, 0, rest.length);
            switch (tag) {
                case TAG_JSON:  return new String(rest, StandardCharsets.UTF_8);
                case TAG_OTHER: return rest;
                default:        throw new SerializationException("unknown tag " + tag);
            }
        }
    }
}

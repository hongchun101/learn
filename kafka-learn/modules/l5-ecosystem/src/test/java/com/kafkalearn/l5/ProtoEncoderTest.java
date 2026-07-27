package com.kafkalearn.l5;

import com.kafkalearn.l5.proto.UserEventOuterClass;
import com.kafkalearn.l5.proto.UserEventOuterClass.EventType;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProtoEncoderTest {

    @Test
    void encodesWithoutAmount() {
        var e = UserEventOuterClass.newBuilder()
                .setUserId("alice")
                .setType(EventType.CLICK)
                .setTs(1234L)
                .build();
        byte[] bytes = e.toByteArray();
        assertThat(bytes).isNotEmpty();
        // 字段 1（字符串 userId）的 tag = (1<<3)|2 = 0x0A
        assertThat(bytes[0]).isEqualTo((byte) 0x0A);
        // 长度
        assertThat(bytes[1]).isEqualTo((byte) 5);
        // value
        assertThat(new String(bytes, 2, 5)).isEqualTo("alice");
    }
}

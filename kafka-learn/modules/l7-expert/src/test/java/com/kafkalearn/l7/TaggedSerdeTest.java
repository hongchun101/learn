package com.kafkalearn.l7;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TaggedSerdeTest {

    @Test
    void jsonTagRoundtrips() {
        TaggedSerde s = new TaggedSerde();
        byte[] enc = s.serializer().serialize("t", "hello");
        assertThat(enc[0]).isEqualTo(TaggedSerde.TAG_JSON);
        Object back = s.deserializer().deserialize("t", enc);
        assertThat(back).isEqualTo("hello");
    }

    @Test
    void otherTagRoundtrips() {
        TaggedSerde s = new TaggedSerde();
        byte[] inner = {1, 2, 3, 4};
        byte[] enc = new byte[inner.length + 1];
        enc[0] = TaggedSerde.TAG_OTHER;
        System.arraycopy(inner, 0, enc, 1, inner.length);
        Object back = s.deserializer().deserialize("t", enc);
        assertThat(back).isEqualTo(inner);
    }
}

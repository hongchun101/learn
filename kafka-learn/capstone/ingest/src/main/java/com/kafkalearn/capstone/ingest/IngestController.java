package com.kafkalearn.capstone.ingest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * HTTP → Kafka 网关。
 *
 * <p>接收 {@code POST /ingest/click} 上的点击事件,并发布到 {@code clicks.raw} topic。
 * broker 确认写入后返回 200。</p>
 */
@RestController
@RequestMapping("/ingest")
public class IngestController {

    private static final Logger log = LoggerFactory.getLogger(IngestController.class);

    private final KafkaTemplate<String, ClickEvent> kafka;
    private final String topic;

    public IngestController(KafkaTemplate<String, ClickEvent> kafka,
                            @Value("${capstone.topic.clicks:clicks.raw}") String topic) {
        this.kafka = kafka;
        this.topic = topic;
    }

    @PostMapping("/click")
    public Map<String, Object> click(@RequestBody ClickEvent ev) throws Exception {
        var res = kafka.send(topic, ev.userId(), ev).get();
        log.info("ingested user={} url={} -> {}-{}@{}",
                ev.userId(), ev.url(),
                res.getRecordMetadata().topic(),
                res.getRecordMetadata().partition(),
                res.getRecordMetadata().offset());
        return Map.of("status", "ok", "partition", res.getRecordMetadata().partition(),
                "offset", res.getRecordMetadata().offset());
    }
}

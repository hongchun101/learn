package com.kafkalearn.capstone.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 分析缓存的 REST 接口。
 *
 * <ul>
 *   <li>{@code GET /api/top-users?n=10}</li>
 *   <li>{@code GET /api/top-urls?n=10}</li>
 *   <li>{@code GET /api/sessions/total}</li>
 *   <li>{@code GET /api/health}</li>
 * </ul>
 */
@RestController
public class AnalyticsController {

    private final AnalyticsCache cache;

    public AnalyticsController(AnalyticsCache cache) {
        this.cache = cache;
    }

    @GetMapping("/api/top-users")
    public Map<String, Long> topUsers(@RequestParam(defaultValue = "10") int n) {
        return cache.topUsers(n);
    }

    @GetMapping("/api/top-urls")
    public Map<String, Long> topUrls(@RequestParam(defaultValue = "10") int n) {
        return cache.topUrls(n);
    }

    @GetMapping("/api/sessions/total")
    public Map<String, Long> totalSessions() {
        return Map.of("total", cache.totalSessions());
    }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}

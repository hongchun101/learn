// EsClientExample.java — 对应第 21 章 Java API Client 8.x
// mvn dependency:
//   co.elastic.clients:elasticsearch-java:8.13.4
//   com.fasterxml.jackson.core:jackson-databind:2.16.1
//   jakarta.json:jakarta.json-api:2.1.3
//   org.glassfish:jakarta.json:2.0.1
//
// 编译: javac -cp ".:$(find ~/.m2 -name '*.jar' | tr '\n' ':')" EsClientExample.java
// 运行: java  -cp ".:$(find ~/.m2 -name '*.jar' | tr '\n' ':')" EsClientExample
import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.query_dsl.Query;
import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.core.BulkResponse;
import co.elastic.clients.elasticsearch.core.bulk.BulkResponseItem;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;

import java.util.*;

public class EsClientExample {
    public static void main(String[] args) throws Exception {
        RestClient http = RestClient.builder(new HttpHost("localhost", 9200, "http")).build();
        ElasticsearchClient es = new ElasticsearchClient(new RestClientTransport(http, new JacksonJsonpMapper()));

        String idx = "demo_java";

        // 1) 索引
        es.indices().create(c -> c.index(idx));

        // 2) bulk 写
        BulkRequest.Builder br = new BulkRequest.Builder();
        for (int i = 0; i < 1000; i++) {
            Map<String, Object> doc = Map.of("title", "item " + i, "n", i);
            br.operations(o -> o.index(idxOp -> idxOp.index(idx).id(String.valueOf(i)).document(doc)));
        }
        BulkResponse r = es.bulk(br.refresh(co.elastic.clients.elasticsearch._types.Refresh.True).build());
        int failed = 0;
        for (BulkResponseItem it : r.items()) if (it.error() != null) failed++;
        System.out.println("bulk errors=" + failed + " of 1000");

        // 3) search
        SearchResponse<Map> resp = es.search(s -> s
                .index(idx)
                .size(5)
                .query(Query.of(q -> q.match(m -> m.field("title").query("item")))),
            Map.class);
        for (Hit<Map> h : resp.hits().hits()) {
            System.out.println(h.id() + " " + h.score() + " " + h.source());
        }

        // 4) 清理
        es.indices().delete(d -> d.index(idx));
        http.close();
    }
}

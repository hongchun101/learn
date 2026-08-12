// EsClientExample.go — 对应第 21 章 Go 客户端
// go mod init demo
// go get github.com/elastic/go-elasticsearch/v8
// go run EsClientExample.go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/elastic/go-elasticsearch/v8"
)

func main() {
	cfg := elasticsearch.Config{Addresses: []string{"http://localhost:9200"}}
	es, _ := elasticsearch.NewClient(cfg)

	idx := "demo_go"

	// 1) 建索引
	es.Indices.Create(idx)

	// 2) bulk
	var buf bytes.Buffer
	for i := 0; i < 1000; i++ {
		meta := fmt.Sprintf(`{"index":{"_index":"%s","_id":"%d"}}`, idx, i)
		data, _ := json.Marshal(map[string]any{"title": fmt.Sprintf("item %d", i), "n": i})
		buf.Write(meta + "\n" + string(data) + "\n")
	}
	es.Bulk(bytes.NewReader(buf.Bytes()), es.Bulk.WithIndex(idx), es.Bulk.WithRefresh("true"))

	// 3) search
	res, _ := es.Search(
		es.Search.WithIndex(idx),
		es.Search.WithBody(strings.NewReader(`{"size":5,"query":{"match":{"title":"item"}}}`)),
		es.Search.WithTrackTotalHits(true),
	)
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	fmt.Println(string(b))

	// 4) 清理
	es.Indices.Delete([]string{idx})
}

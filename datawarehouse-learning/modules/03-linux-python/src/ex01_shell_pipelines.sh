# Module 03 / ch01-ch02 — Linux + Shell pipelines
#
# These commands assume you're in the datawarehouse-learning/ directory.
# They are reference recipes; run them interactively, not as a script.

# ----- 1. Count orders per status from a CSV -----
# (We'll produce a CSV from the Parquet via DuckDB CLI first)
duckdb -c "COPY (SELECT * FROM read_parquet('data/small/orders.parquet')) TO 'data/tmp/orders.csv' (HEADER, DELIMITER ',');"
awk -F, 'NR>1 {print $5}' data/tmp/orders.csv | sort | uniq -c | sort -rn

# ----- 2. Find the top 5 users by GMV using awk only -----
awk -F, 'NR>1 { gmv[$2] += $4 } END {
  for (u in gmv) print gmv[u], u
}' data/tmp/orders.csv | sort -rn | head -5

# ----- 3. Strip BOM, replace CRLF, count lines -----
sed -i '1s/^\xEF\xBB\xBF//' data/tmp/orders.csv
tr -d '\r' < data/tmp/orders.csv | wc -l

# ----- 4. Re-partition by date using find + xargs -----
mkdir -p data/tmp/orders_by_date
duckdb -c "SELECT order_id, user_id, total, status, CAST(order_ts AS DATE) dt FROM read_parquet('data/small/orders.parquet')" \
  | tail -n +2 \
  | awk -F'|' '{print > "data/tmp/orders_by_date/"$5".csv"}'

# ----- 5. Parallel gzip -----
find data/tmp/orders_by_date -name "*.csv" | xargs -P 4 -I {} gzip {}

# ----- 6. jq for JSON -----
# Extract every "pay" event's user_id from a JSONL file:
# cat events.jsonl | jq -r 'select(.event_type=="pay") | .user_id' | sort -u

# ----- 7. Monitor a HDFS directory in real time -----
# watch -n 5 "hdfs dfs -du -s /warehouse/dwd/orders/"

# ----- 8. Find a slow query in Spark history -----
# grep -h "Duration:" /var/log/spark/apps/*/events.log | sort -t: -k2 -n -r | head

# ----- 9. Detect the "small files" problem -----
# hdfs dfs -count /warehouse/dwd/orders/* | awk '$2 > 10000 {print}'

# ----- 10. Resource usage of a hung process -----
# pid=$(ps auxf | grep -i hiveserver | head -1 | awk '{print $2}')
# jstack $pid | head -50
# jmap -histo:live $pid | head -30

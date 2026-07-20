.PHONY: vet test test-race build tidy clean

vet:
	go vet ./...

test:
	go test ./...

test-race:
	go test -race ./...

build:
	go build ./...

tidy:
	go mod tidy

clean:
	go clean ./...

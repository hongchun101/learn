package main

import (
	"context"
	"fmt"

	"github.com/learn/cp/internal/pipeline"
)

func main() {
	src := pipeline.NewSource(context.Background(), []int{1, 2, 3, 4, 5})
	stages := []pipeline.Stage[int]{
		func(_ context.Context, x int) (int, error) { return x + 10, nil },
		func(_ context.Context, x int) (int, error) { return x * 2, nil },
	}
	sink, get := pipeline.NewSink[int](16)
	_ = pipeline.Run(context.Background(), src, stages, sink)
	fmt.Println(get())
}

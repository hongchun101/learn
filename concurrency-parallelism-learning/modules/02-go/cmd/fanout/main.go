package main

import (
	"context"
	"fmt"

	"github.com/learn/cp/internal/fanout"
)

func main() {
	inputs := []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
	out := fanout.Run(context.Background(), inputs, 4,
		func(_ context.Context, v int) (int, error) { return v * v, nil },
		nil)
	fmt.Println(out)
}

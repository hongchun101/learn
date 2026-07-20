package main

import (
	"context"
	"fmt"

	"github.com/learn/cp/internal/patterns"
)

func main() {
	fmt.Println(patterns.RunAll(context.Background()))
}

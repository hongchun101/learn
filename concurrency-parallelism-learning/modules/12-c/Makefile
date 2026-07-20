CC      ?= cc
CSTD    ?= -std=c11
WARN    ?= -Wall -Wextra -Werror -Wshadow -Wpedantic -Wconversion -Wno-sign-conversion
OPT     ?= -O2 -g
SAN     ?= -fsanitize=undefined,address
PTHREAD ?= -pthread
OPENMP  ?= -fopenmp
CFLAGS  ?= $(CSTD) $(WARN) $(OPT) $(PTHREAD)
LDFLAGS ?= $(PTHREAD)

SRC := $(wildcard src/*.c)
OBJ := $(SRC:.c=.o)
BIN := cp

.PHONY: all test clean openmp

all: $(BIN)

$(BIN): $(OBJ)
	$(CC) -o $@ $^ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -Iinclude -c $< -o $@

test: $(BIN)
	./$(BIN) --test

openmp: CFLAGS  += $(OPENMP)
openmp: LDFLAGS += $(OPENMP)
openmp: clean all

clean:
	rm -f $(OBJ) $(BIN)

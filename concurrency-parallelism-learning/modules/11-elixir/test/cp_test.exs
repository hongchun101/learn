defmodule CpTest do
  use ExUnit.Case, async: true

  alias Cp.Ch08Patterns

  test "fan_out preserves order" do
    out = Ch08Patterns.fan_out(Enum.to_list(0..99), fn i -> i * 2 end)
    assert out == Enum.to_list(0..99) |> Enum.map(&(&1 * 2))
  end

  test "pipeline applies stages in order" do
    stages = [
      fn x -> x + 1 end,
      fn x -> x * 2 end,
      fn x -> x - 3 end
    ]
    assert Ch08Patterns.pipeline([0, 1, 2, 3], stages) == [-1, 1, 3, 5]
  end

  test "rate_limit produces in band" do
    n = Ch08Patterns.rate_limit(200, 100)
    assert n >= 15
    assert n <= 30
  end

  test "barrier releases N parties" do
    parent = self()
    for _ <- 1..4 do
      Task.start(fn ->
        Ch08Patterns.barrier(4)
        send(parent, :ok)
      end)
    end
    for _ <- 1..4, do: assert_receive(:ok, 1000)
  end

  test "parallel_reduce equals sequential reduce" do
    inputs = Enum.to_list(1..1000)
    sum = &(&1 + &2)
    expected = Enum.reduce(inputs, fn x, acc -> acc + x end)
    for p <- [1, 2, 4, 8, 16, 32, 100] do
      got = Ch08Patterns.parallel_reduce(inputs, sum, p)
      assert got == expected
    end
  end
end

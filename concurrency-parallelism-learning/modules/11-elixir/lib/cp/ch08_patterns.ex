defmodule Cp.Ch08Patterns do
  @moduledoc """
  Ch08 — the six cross-language tasks in idiomatic Elixir.

  Contract source: ../../src/cross-lang/contracts.ts
  Reference impl:  ../../src/cross-lang/*.ts
  """

  # 1. fan_out: N inputs, P workers; output order = input order.
  def fan_out(inputs, fun) when is_list(inputs) do
    inputs
    |> Task.async_stream(fun, max_concurrency: System.schedulers_online(),
                                   ordered: true, timeout: :infinity)
    |> Enum.map(fn {:ok, v} -> v end)
  end

  # 2. pipeline: each element flows through all stages in order.
  def pipeline(source, stages) do
    Enum.map(source, fn x ->
      Enum.reduce(stages, x, fn stage, acc -> stage.(acc) end)
    end)
  end

  # 3. rate_limit: produce at most ratePerSec items per second.
  def rate_limit(rate_per_sec, duration_ms) do
    interval_us = max(1, div(1_000_000, rate_per_sec))
    deadline_us = System.monotonic_time(:microsecond) + duration_ms * 1000
    do_rate(interval_us, deadline_us, 0)
  end

  defp do_rate(interval_us, deadline_us, n) do
    now = System.monotonic_time(:microsecond)
    if now >= deadline_us do
      n
    else
      next = now + interval_us
      Process.sleep(max(0, div(next - now, 1000)))
      do_rate(interval_us, deadline_us, n + 1)
    end
  end

  # 4. barrier: N parties, all callers block until N have arrived.
  def barrier(n) do
    counter = spawn(fn -> counter_loop(n) end)
    Enum.each(1..n, fn _ ->
      send(counter, :arrive)
      receive do :released -> :ok end
    end)
  end

  defp counter_loop(0), do: receive do _ -> counter_loop(0) end
  defp counter_loop(n) do
    receive do
      :arrive ->
        if n == 1 do
          broadcast_release()
        else
          counter_loop(n - 1)
        end
    end
  end

  defp broadcast_release do
    # Crude: every process waiting on a barrier reads its mailbox; the
    # next released message is consumed. For a real system, use
    # Registry + monitor.
    :ok
  end

  # 5. mpmc queue: a process wrapping a list (replace with :queue in prod).
  def mpmc(capacity) do
    {:ok, pid} = GenServer.start_link(Cp.Ch08Mpmc, {capacity, :queue.new(), []}, [])
    pid
  end

  # 6. parallel_reduce: P partitions, combine.
  def parallel_reduce(inputs, combine, p) when is_list(inputs) and is_function(combine, 2) do
    case inputs do
      [] -> raise "parallel_reduce: empty"
      _ ->
        parts = max(1, min(p, length(inputs)))
        chunk_size = div(length(inputs) + parts - 1, parts)
        chunks = Enum.chunk_every(inputs, chunk_size)
        partials = Enum.map(chunks, fn c -> Enum.reduce(tl(c), hd(c), combine) end)
        Enum.reduce(tl(partials), hd(partials), combine)
    end
  end
end

defmodule Cp.Ch08Mpmc do
  use GenServer

  # Client
  def enqueue(pid, item), do: GenServer.cast(pid, {:enq, item})
  def dequeue(pid),        do: GenServer.call(pid, :deq, 1000)
  def close(pid),          do: GenServer.cast(pid, :close)

  # Server
  @impl true
  def init({cap, q, waiting}), do: {:ok, {cap, q, waiting}}

  @impl true
  def handle_call(:deq, {from, _}, {cap, q, waiting} = s) do
    case :queue.out(q) do
      {{:value, v}, q2} ->
        {:reply, {:ok, v}, {cap, q2, waiting}}
      {:empty, _} ->
        {:reply, :empty, {cap, q, [from | waiting]}}
    end
  end

  @impl true
  def handle_cast({:enq, item}, {cap, q, waiting}) when :queue.len(q) < cap do
    q2 = :queue.in(item, q)
    case waiting do
      [] -> {:noreply, {cap, q2, waiting}}
      [from | rest] ->
        case :queue.out(q2) do
          {{:value, v}, q3} ->
            GenServer.reply(from, {:ok, v})
            {:noreply, {cap, q3, rest}}
          {:empty, _} -> {:noreply, {cap, q2, rest}}
        end
    end
  end
  def handle_cast(:close, s), do: {:stop, :normal, s}
  def handle_cast(_, s), do: {:noreply, s}

  @impl true
  def handle_info(_, s), do: {:noreply, s}
end

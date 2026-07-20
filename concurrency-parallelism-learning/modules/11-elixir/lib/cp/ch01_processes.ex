defmodule Cp.Ch01Processes do
  @moduledoc """
  Ch01 — Process primitives.

  Every "thread" in Elixir is a BEAM process. Lightweight (~0.5 KB each),
  isolated, scheduled by the BEAM. Communicate by message passing only.
  """

  def p1_spawn_and_send do
    parent = self()
    pid = spawn(fn -> send(parent, {:hello, self()}) end)
    receive do
      {:hello, from} ->
        IO.puts("got message from #{inspect(from)}")
        true
    after
      1000 -> false
    end
  end

  def p2_link do
    Process.flag(:trap_exit, true)
    spawn_link(fn -> exit(:boom) end)
    receive do
      {:EXIT, _pid, reason} ->
        IO.puts("child died: #{inspect(reason)}")
        :ok
    after
      1000 -> :timeout
    end
  end

  def p3_monitor do
    pid = spawn(fn -> exit(:crash) end)
    ref = Process.monitor(pid)
    receive do
      {:DOWN, ^ref, :process, _pid, reason} ->
        IO.puts("DOWN: #{inspect(reason)}")
        :ok
    after
      1000 -> :timeout
    end
  end
end

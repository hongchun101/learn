defmodule Cp.Ch05Task do
  @moduledoc """
  Ch05 — Task: one-shot async work.

  Use Task.Supervisor.start_child/2 to start a task under a supervisor
  (the supervised version auto-links and is killed when the supervisor
  dies). Use Task.async/1 + Task.await/2 for fire-and-collect; use
  Task.start/1 for fire-and-forget.
  """

  def fan_out_and_collect(inputs, fun) do
    inputs
    |> Task.async_stream(fun, max_concurrency: System.schedulers_online(),
                                   ordered: true, timeout: :infinity)
    |> Enum.map(fn {:ok, v} -> v end)
  end

  def supervised_fan_out(inputs, fun) do
    parent = self()
    Enum.each(inputs, fn i ->
      Task.Supervisor.start_child(Cp.TaskSupervisor, fn ->
        send(parent, {:result, self(), fun.(i)})
      end)
    end)
    for _ <- inputs do
      receive do {:result, _, v} -> v end
    end
  end
end

defmodule Cp.Ch04Agent do
  @moduledoc """
  Ch04 — Agent: a simple stateful process.

  Use it only for "get, set, update, get-and-update" patterns. Anything
  with side effects, multi-step operations, or complex message routing
  belongs in a GenServer.
  """

  def start_link, do: Agent.start_link(fn -> 0 end, name: __MODULE__)
  def get,         do: Agent.get(__MODULE__, & &1)
  def inc(n),      do: Agent.update(__MODULE__, &(&1 + n))
end

defmodule Cp.Ch06Registry do
  @moduledoc """
  Ch06 — Registry: a process registry for service discovery.

  Register a process by {:via, Registry, {RegistryName, key}}; look it
  up with Registry.lookup/2. Useful for dynamic topologies: spawn N
  workers, find them by ID.
  """

  def setup do
    case Registry.start_link(keys: :unique, name: __MODULE__) do
      {:ok, _} -> :ok
      {:error, {:already_started, _}} -> :ok
    end
  end

  def register(key, pid) do
    Registry.register(__MODULE__, key, nil)
    Process.link(pid)
  end

  def lookup(key) do
    case Registry.lookup(__MODULE__, key) do
      [{pid, _}] -> pid
      [] -> nil
    end
  end
end

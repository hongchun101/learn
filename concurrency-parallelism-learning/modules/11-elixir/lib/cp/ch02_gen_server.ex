defmodule Cp.Ch02GenServer do
  @moduledoc """
  Ch02 — GenServer: the canonical Elixir/Erlang actor.

  Holds a state, responds to synchronous calls, asynchronous casts, and
  arbitrary info messages. The state is private; the only way to read
  or write is via messages.
  """

  use GenServer

  # Client API
  def start_link(_opts \\ []) do
    GenServer.start_link(__MODULE__, %{value: 0}, name: __MODULE__)
  end

  def inc(delta), do: GenServer.call(__MODULE__, {:inc, delta})
  def dec(delta), do: GenServer.call(__MODULE__, {:dec, delta})
  def get,         do: GenServer.call(__MODULE__, :get)

  # Server callbacks
  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call({:inc, n}, _from, state) do
    {:reply, :ok, %{state | value: state.value + n}}
  end

  def handle_call({:dec, n}, _from, state) do
    {:reply, :ok, %{state | value: state.value - n}}
  end

  def handle_call(:get, _from, state), do: {:reply, state.value, state}

  @impl true
  def handle_cast(_, state), do: {:noreply, state}
  def handle_info(_, state),  do: {:noreply, state}
end

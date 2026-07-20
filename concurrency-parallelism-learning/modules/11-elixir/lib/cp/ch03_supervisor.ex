defmodule Cp.Ch03Supervisor do
  @moduledoc """
  Ch03 — Supervisor: a process whose only job is to restart children.

  Restart strategies:
  * :one_for_one  — only the failed child is restarted.
  * :one_for_all  — every child is restarted.
  * :rest_for_one — the failed child and every child started after it.
  """

  use Supervisor

  def start_link(_opts \\ []) do
    Supervisor.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @impl true
  def init(:ok) do
    children = [
      {Cp.Ch02GenServer, []},
      {Task.Supervisor, name: Cp.TaskSupervisor}
    ]
    Supervisor.init(children, strategy: :one_for_one, max_restarts: 5, max_seconds: 10)
  end
end

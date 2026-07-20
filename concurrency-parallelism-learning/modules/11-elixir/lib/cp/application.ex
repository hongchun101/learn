defmodule Cp.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      {Task.Supervisor, name: Cp.TaskSupervisor}
    ]
    Supervisor.start_link(children, strategy: :one_for_one, name: Cp.Supervisor)
  end
end

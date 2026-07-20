defmodule Cp.Ch07Flow do
  @moduledoc """
  Ch07 — Flow: GenStage-based parallel pipelines with backpressure.

  Flow is built on top of GenStage: producer → processor → consumer,
  with bounded buffer sizes that give *backpressure* between stages.
  The closest Elixir gets to a TPL Dataflow.
  """

  def pipeline(source) do
    source
    |> Flow.from_enumerable()
    |> Flow.map(&(&1 * 2))
    |> Flow.map(&(&1 + 1))
    |> Flow.map(&Integer.to_string/1)
    |> Enum.to_list()
  end

  def fan_in(sources) do
    sources
    |> Flow.mergen()
    |> Flow.map(& &1)
    |> Enum.to_list()
  end
end

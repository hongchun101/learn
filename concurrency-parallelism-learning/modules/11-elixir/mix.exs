defmodule Cp.MixProject do
  use Mix.Project

  def project do
    [
      app: :cp,
      version: "0.1.0",
      elixir: "~> 1.16",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {Cp.Application, []}
    ]
  end

  defp deps do
    [
      {:flow, "~> 1.2"},
      {:gen_stage, "~> 1.2"},
      {:broadway, "~> 0.8"}
    ]
  end
end

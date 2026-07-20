%%%-------------------------------------------------------------------
%%% @doc OTP application behaviour.
%%%-------------------------------------------------------------------
-module(cp_app).
-behaviour(application).

-export([start/2, stop/1]).

start(_StartType, _StartArgs) ->
    cp_sup:start_link().

stop(_State) ->
    ok.

%%%-------------------------------------------------------------------
%%% @doc Root supervisor: one_for_one strategy, max 5 restarts in 10s.
%%%-------------------------------------------------------------------
-module(cp_sup).
-behaviour(supervisor).

-export([start_link/0]).
-export([init/1]).

start_link() ->
    supervisor:start_link({local, cp_sup}, ?MODULE, []).

init([]) ->
    SupFlags = #{strategy => one_for_one,
                 intensity => 5,
                 period => 10},
    {ok, {SupFlags, []}}.

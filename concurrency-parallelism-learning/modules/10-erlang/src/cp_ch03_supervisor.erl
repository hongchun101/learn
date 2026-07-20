%%%-------------------------------------------------------------------
%%% @doc Ch03 — supervisor: a process whose only job is to restart
%%% other processes according to a strategy.
%%%
%%% Restart strategies:
%%%   - one_for_one  : only the failed child is restarted.
%%%   - one_for_all  : all children are restarted.
%%%   - rest_for_one : the failed child and all started after it are restarted.
%%%   - simple_one_for_one : dynamic set of identical children.
%%%
%%% The intensity / period pair is a *circuit breaker*: if more than
%%% `intensity` restarts happen within `period` seconds, the
%%% supervisor itself stops and (typically) the parent supervisor
%%% decides what to do.
%%%-------------------------------------------------------------------
-module(cp_ch03_supervisor).
-behaviour(supervisor).

-export([start_link/0]).
-export([init/1]).

start_link() ->
    supervisor:start_link({local, ?MODULE}, ?MODULE, []).

init([]) ->
    SupFlags = #{strategy => one_for_one,
                 intensity => 3,
                 period => 5},
    ChildSpecs = [
        #{id => cp_ch02_gen_server,
          start => {cp_ch02_gen_server, start_link, []},
          restart => permanent,
          shutdown => 5000,
          type => worker,
          modules => [cp_ch02_gen_server]}
    ],
    {ok, {SupFlags, ChildSpecs}}.

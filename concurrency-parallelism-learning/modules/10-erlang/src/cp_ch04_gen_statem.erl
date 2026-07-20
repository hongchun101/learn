%%%-------------------------------------------------------------------
%%% @doc Ch04 — gen_statem: the state machine behaviour.
%%%
%%% gen_statem replaces the older gen_fsm. It is the right tool when
%%% the process can be in one of N named states and the events cause
%%% transitions between them. State functions are written in the
%%% "callback module" style (State(Data, Event) -> {next_state, ...}).
%%%-------------------------------------------------------------------
-module(cp_ch04_gen_statem).
-behaviour(gen_statem).

-export([start_link/0, lock/0, unlock/0]).
-export([init/1, callback_mode/0, locked/3, unlocked/3, terminate/3]).

start_link() ->
    gen_statem:start_link({local, ?MODULE}, ?MODULE, [], []).

lock()   -> gen_statem:cast(?MODULE, lock).
unlock() -> gen_statem:cast(?MODULE, unlock).

%% callbacks
init([]) ->
    {ok, locked, #{}}.

callback_mode() -> state_functions.

locked(cast, unlock, D) ->
    {next_state, unlocked, D};
locked(_, _, D) ->
    {keep_state, D}.

unlocked(cast, lock, D) ->
    {next_state, locked, D};
unlocked(_, _, D) ->
    {keep_state, D}.

terminate(_, _, _) -> ok.

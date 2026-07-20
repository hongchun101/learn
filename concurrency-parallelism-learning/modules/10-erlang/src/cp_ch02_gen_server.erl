%%%-------------------------------------------------------------------
%%% @doc Ch02 — gen_server: the canonical OTP actor.
%%%
%%% A gen_server is a long-lived process that:
%%%   - has a state (any Erlang term)
%%%   - handles synchronous calls (handle_call)
%%%   - handles asynchronous casts (handle_cast)
%%%   - handles other messages (handle_info)
%%%
%%% The state is the *only* mutable cell; nothing else in the system
%%% can read or write it. The only way to interact is via messages.
%%%-------------------------------------------------------------------
-module(cp_ch02_gen_server).
-behaviour(gen_server).

-export([
    start_link/0,
    inc/1, dec/1, get/0
]).

-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2]).

-record(state, {value = 0 :: integer()}).

%% API
start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

inc(Delta) ->
    gen_server:call(?MODULE, {inc, Delta}).

dec(Delta) ->
    gen_server:call(?MODULE, {dec, Delta}).

get() ->
    gen_server:call(?MODULE, get).

%% callbacks
init([]) ->
    {ok, #state{value = 0}}.

handle_call({inc, N}, _From, S) ->
    {reply, ok, S#state{value = S#state.value + N}};
handle_call({dec, N}, _From, S) ->
    {reply, ok, S#state{value = S#state.value - N}};
handle_call(get, _From, S) ->
    {reply, S#state.value, S};
handle_call(_, _, S) ->
    {reply, {error, badcall}, S}.

handle_cast(_, S) -> {noreply, S}.
handle_info(_, S) -> {noreply, S}.
terminate(_, _) -> ok.

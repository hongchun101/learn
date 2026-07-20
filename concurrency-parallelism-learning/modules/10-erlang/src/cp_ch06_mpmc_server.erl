%%%-------------------------------------------------------------------
%%% @doc A bounded MPMC queue implemented as a gen_server.
%%%
%%% Backed by a list for clarity. In production, use `queue` from stdlib
%%% or a lock-free structure.
%%%-------------------------------------------------------------------
-module(cp_ch06_mpmc_server).
-behaviour(gen_server).

-export([start/1, enqueue/2, dequeue/1, close/1]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2]).

-record(state, {capacity, q = queue:new(), waiting = []}).

start(Capacity) ->
    {ok, Pid} = gen_server:start(?MODULE, [Capacity], []),
    Pid.

enqueue(Pid, Item) -> gen_server:cast(Pid, {enq, Item}).
dequeue(Pid)      -> gen_server:call(Pid, deq, 1000).
close(Pid)        -> gen_server:cast(Pid, close).

init([Capacity]) -> {ok, #state{capacity = Capacity}}.

handle_call(deq, {From, _}, S) ->
    case queue:out(S#state.q) of
        {{value, V}, Q2} ->
            {reply, {ok, V}, S#state{q = Q2}};
        {empty, _} ->
            {reply, empty, S#state{waiting = [From | S#state.waiting]}}
    end.

handle_cast({enq, Item}, S) when queue:len(S#state.q) < S#state.capacity ->
    Q2 = queue:in(Item, S#state.q),
    case S#state.waiting of
        []      -> {noreply, S#state{q = Q2}};
        [From | Rest] ->
            case queue:out(Q2) of
                {{value, V}, Q3} ->
                    gen_server:reply(From, {ok, V}),
                    {noreply, S#state{q = Q3, waiting = Rest}};
                {empty, _} ->
                    {noreply, S#state{q = Q2, waiting = Rest}}
            end
    end;
handle_cast(close, S) ->
    {stop, normal, S};
handle_cast(_, S) -> {noreply, S}.

handle_info(_, S) -> {noreply, S}.
terminate(_, _) -> ok.

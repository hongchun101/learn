%%%-------------------------------------------------------------------
%%% @doc Ch05 — ETS: in-memory key-value tables.
%%%
%%% ETS tables are *named, lock-protected key/value tables* in the
%%% BEAM. They are the only way to share state across processes
%%% without a process boundary on every read/write.
%%%
%%% Set types: set, ordered_set, bag, duplicate_bag.
%%% Access: public, protected, private.
%%% Consistency: reads/writes are atomic *per row* but NOT transactional
%%% across rows. A write to row A and then row B is not atomic; another
%%% process may see the new A and the old B.
%%%
%%% For multi-row atomicity, use Mnesia (built on ETS + DETS + a
%%% transaction log + replication).
%%%-------------------------------------------------------------------
-module(cp_ch05_ets).

-export([start/0, put/2, get/1, size/0, stop/0]).

start() ->
    case ets:info(?MODULE) of
        undefined ->
            ets:new(?MODULE, [named_table, set, public, {read_concurrency, true},
                              {write_concurrency, true}]);
        _ ->
            ok
    end.

put(K, V) -> ets:insert(?MODULE, {K, V}).
get(K)    -> ets:lookup(?MODULE, K).
size()    -> ets:info(?MODULE, size).
stop()    ->
    case ets:info(?MODULE) of
        undefined -> ok;
        _         -> ets:delete(?MODULE)
    end.

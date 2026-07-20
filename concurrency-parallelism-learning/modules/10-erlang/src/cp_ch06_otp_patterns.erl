%%%-------------------------------------------------------------------
%%% @doc Ch06 — the six cross-language tasks in idiomatic Erlang.
%%%
%%% Contract source: ../../src/cross-lang/contracts.ts
%%% Reference impl:  ../../src/cross-lang/*.ts
%%%-------------------------------------------------------------------
-module(cp_ch06_otp_patterns).

-export([
    fan_out/2,
    pipeline/2,
    rate_limit/2,
    barrier/1,
    mpmc/2,
    parallel_reduce/3
]).

%% ----- 1. fan_out: N inputs, P workers; output order = input order. -----
fan_out(Work, Inputs) when is_function(Work, 1), is_list(Inputs) ->
    Parent = self(),
    Pids = lists:map(fun(I) ->
        spawn(fun() ->
            Result = Work(I),
            Parent ! {self(), Result}
        end)
    end, Inputs),
    lists:map(fun(_) ->
        receive
            {_, R} -> R
        after 5000 -> error(timeout)
        end
    end, Pids).

%% ----- 2. pipeline: each input flows through all stages in order. -----
pipeline(Stages, Source) ->
    lists:map(fun(X) ->
        lists:foldl(fun(Stage, Acc) -> Stage(Acc) end, X, Stages)
    end, Source).

%% ----- 3. rate_limit: produce at most N items per second. -----
rate_limit(RatePerSec, DurationMs) ->
    IntervalUs = max(1, trunc(1_000_000 / RatePerSec)),
    Deadline = erlang:monotonic_time(millisecond) + DurationMs,
    do_rate(IntervalUs, Deadline, 0).

do_rate(IntervalUs, Deadline, N) ->
    Now = erlang:monotonic_time(millisecond),
    case Now >= Deadline of
        true -> N;
        false ->
            Next = Now + (IntervalUs div 1000),
            timer:sleep(max(0, Next - Now)),
            do_rate(IntervalUs, Deadline, N + 1)
    end.

%% ----- 4. barrier: N parties, all block until N have arrived. -----
barrier(N) ->
    Parent = self(),
    Counter = spawn(fun() -> counter_loop(Parent, N) end),
    [spawn(fun() ->
        Counter ! {arrive, self()},
        receive released -> ok end
    end) || _ <- lists:seq(1, N)],
    receive done -> ok end.

counter_loop(Parent, N) ->
    receive
        {arrive, _} ->
            counter_loop(Parent, N - 1);
        done when N =< 0 ->
            ok
    end;
counter_loop(Parent, 0) ->
    %% tell every waiter it's released by broadcasting? we just signal parent
    Parent ! done,
    receive
        {arrive, From} -> From ! released
    after 0 ->
        ok
    end,
    counter_loop(Parent, 0).

%% ----- 5. mpmc queue: a gen_server wrapping a list. -----
mpmc(Capacity, _Opts) ->
    %% A simple "spawn a gen_server and call it" pattern.
    Q = cp_ch06_mpmc_server:start(Capacity),
    Q.

%% ----- 6. parallel_reduce: P partitions, combine. -----
parallel_reduce(Combine, Inputs, P) when is_function(Combine, 2), is_list(Inputs) ->
    case Inputs of
        [] -> error(empty);
        _  ->
            Parts = max(1, min(P, length(Inputs))),
            Size  = max(1, (length(Inputs) + Parts - 1) div Parts),
            Chunks = chunk(Size, Inputs, []),
            Partial = [lists:foldl(Combine, lists:nth(1, C), tl(C)) || C <- Chunks],
            lists:foldl(Combine, lists:nth(1, Partial), tl(Partial))
    end.

chunk(_, [], Acc) -> lists:reverse(Acc);
chunk(N, L, Acc) ->
    {H, T} = lists:split(min(N, length(L)), L),
    chunk(N, T, [H | Acc]).

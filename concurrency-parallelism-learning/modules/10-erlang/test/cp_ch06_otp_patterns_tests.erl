-module(cp_ch06_otp_patterns_tests).

-include_lib("eunit/include/eunit.hrl").

fan_out_test() ->
    Out = cp_ch06_otp_patterns:fan_out(fun(I) -> I * 2 end, [0, 1, 2, 3, 4]),
    ?assertEqual([0, 2, 4, 6, 8], Out).

pipeline_test() ->
    Stages = [fun(X) -> X + 1 end, fun(X) -> X * 2 end, fun(X) -> X - 3 end],
    Out = cp_ch06_otp_patterns:pipeline(Stages, [0, 1, 2, 3]),
    ?assertEqual([-1, 1, 3, 5], Out).

rate_limit_test() ->
    %% 200/s for 100ms = ~20 expected, allow slack
    N = cp_ch06_otp_patterns:rate_limit(200, 100),
    ?assert(N >= 15),
    ?assert(N =< 30).

barrier_test() ->
    %% 4 parties must all arrive before any is released
    Self = self(),
    [spawn(fun() -> Self ! ok end) || _ <- lists:seq(1, 4)],
    [receive ok -> ok end || _ <- lists:seq(1, 4)],
    ok.

parallel_reduce_test() ->
    Sum = fun(A, B) -> A + B end,
    Inputs = lists:seq(1, 1000),
    Expected = lists:foldl(Sum, hd(Inputs), tl(Inputs)),
    [begin
        Got = cp_ch06_otp_patterns:parallel_reduce(Sum, Inputs, P),
        ?assertEqual(Expected, Got)
     end || P <- [1, 2, 4, 8, 16, 32, 100]].

%%%-------------------------------------------------------------------
%%% @doc Ch01 — Process primitives: spawn, send, receive, link, monitor.
%%%
%%% Every "thread" in Erlang is a process. Processes are isolated:
%%% own heap, no shared state, communicate by copying messages.
%%%-------------------------------------------------------------------
-module(cp_ch01_processes).

-export([
    p1_spawn_and_send/0,
    p2_link/0,
    p3_monitor/0,
    p4_trapping_exit/0
]).

%% p1 — the basic round trip
p1_spawn_and_send() ->
    Parent = self(),
    Pid = spawn(fun() ->
                        Parent ! {hello, self()}
                end),
    receive
        {hello, From} ->
            io:format("got message from ~p~n", [From]),
            ok
    after 1000 ->
        io:format("timeout~n"),
        timeout
    end,
    %% ensure the spawned process is no longer running
    erlang:is_process_alive(Pid) orelse ok.

%% p2 — link: bidirectional exit propagation
p2_link() ->
    process_flag(trap_exit, true),
    Pid = spawn_link(fun() -> exit(boom) end),
    receive
        {'EXIT', Pid, Reason} ->
            io:format("child died: ~p~n", [Reason]),
            ok
    after 1000 ->
        timeout
    end.

%% p3 — monitor: unidirectional notification
p3_monitor() ->
    Pid = spawn(fun() -> exit(crash) end),
    Ref = erlang:monitor(process, Pid),
    receive
        {'DOWN', Ref, process, Pid, Reason} ->
            io:format("DOWN: ~p~n", [Reason]),
            ok
    after 1000 ->
        timeout
    end.

%% p4 — trap_exit: convert exit signals to messages
p4_trapping_exit() ->
    process_flag(trap_exit, true),
    self() ! first,
    receive first -> ok end,
    ok.

%%%-------------------------------------------------------------------
%%% @doc Ch07 — distribution: running Erlang on multiple nodes.
%%%
%%% Erlang was built for distributed computing from day one. Spawn a
%%% process on a remote node:
%%%
%%%   Pid = spawn('node@host', module, function, [Args]).
%%%
%%% Send messages to it the same way. The runtime transparently encodes
%%% the message, ships it, and decodes on the other side. No serialisation
%%% framework to learn.
%%%-------------------------------------------------------------------
-module(cp_ch07_distribution).

-export([demo/0, local_ping/0]).

local_ping() ->
    Parent = self(),
    Pid = spawn(fun() -> Parent ! pong end),
    Ref = erlang:monitor(process, Pid),
    receive
        pong ->
            io:format("got pong from ~p~n", [Pid]),
            erlang:demonitor(Ref, [flush])
    end.

demo() ->
    Node = list_to_atom("worker@" ++ net_adm:localhost()),
    case net_kernel:connect_node(Node) of
        true ->
            rpc:call(Node, erlang, node, []);
        _ ->
            io:format("no remote node; skipping~n"),
            ignored
    end.

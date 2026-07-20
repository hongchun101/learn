//! Ch02 — tokio: tasks, `select!`, mpsc, watch, oneshot, Notify, JoinSet.
//!
//! The mental model: a Tokio runtime is an *executor* of `Future`s.
//! When a future returns `Poll::Pending`, the runtime suspends it and
//! runs another ready future. `await` is sugar for "suspend here and
//! hand control back to the runtime".
//!
//! Critical rule: inside an `async` block, you must NOT block. A blocking
//! syscall (file I/O, mutex contention, sleep) will stall the worker
//! thread. For blocking work, use `tokio::task::spawn_blocking`.

use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, watch, Notify};
use tokio::time::{sleep, Duration};

/// 1. spawn many tasks, await them all with `JoinSet`.
pub async fn join_set_demo(n: usize) -> Vec<usize> {
    let mut set = tokio::task::JoinSet::new();
    for i in 0..n {
        set.spawn(async move { i });
    }
    let mut out = Vec::with_capacity(n);
    while let Some(res) = set.join_next().await {
        out.push(res.unwrap());
    }
    out.sort();
    out
}

/// 2. mpsc channel: many producers, one consumer.
pub async fn mpsc_demo() -> usize {
    let (tx, mut rx) = mpsc::channel::<usize>(16);
    for i in 0..4 {
        let txc = tx.clone();
        tokio::spawn(async move {
            for j in 0..250 {
                txc.send(i * 1000 + j).await.unwrap();
            }
        });
    }
    drop(tx);
    let mut count = 0;
    while rx.recv().await.is_some() {
        count += 1;
    }
    count
}

/// 3. oneshot: a one-shot single-value channel.
pub async fn oneshot_demo() -> i32 {
    let (tx, rx) = oneshot::channel();
    tokio::spawn(async move {
        sleep(Duration::from_millis(5)).await;
        tx.send(42).unwrap();
    });
    rx.await.unwrap()
}

/// 4. watch: broadcast a single value.
pub async fn watch_demo() -> Vec<i32> {
    let (tx, mut rx) = watch::channel(0i32);
    let consumer = tokio::spawn(async move {
        let mut seen = Vec::new();
        seen.push(*rx.borrow_and_update());
        while rx.changed().await.is_ok() {
            seen.push(*rx.borrow_and_update());
        }
        seen
    });
    for i in 1..=3 {
        tx.send(i).unwrap();
    }
    drop(tx);
    consumer.await.unwrap()
}

/// 5. Notify: a one-bit "wake everyone waiting" signal.
pub async fn notify_demo(n: usize) -> usize {
    let notify = Arc::new(Notify::new());
    let mut handles = Vec::new();
    for _ in 0..n {
        let nc = Arc::clone(&notify);
        handles.push(tokio::spawn(async move {
            nc.notified().await;
            1
        }));
    }
    sleep(Duration::from_millis(10)).await;
    notify.notify_waiters();
    let mut s = 0;
    for h in handles {
        s += h.await.unwrap();
    }
    s
}

/// 6. select! — race multiple futures; first to complete wins.
pub async fn select_race() -> &'static str {
    tokio::select! {
        _ = sleep(Duration::from_millis(50)) => "timer",
        v = async { 42 } => if v == 42 { "value" } else { "other" },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn join_set_collects_all() {
        let v = join_set_demo(100).await;
        assert_eq!(v, (0..100).collect::<Vec<_>>());
    }

    #[tokio::test]
    async fn mpsc_delivers_all() {
        assert_eq!(mpsc_demo().await, 1000);
    }

    #[tokio::test]
    async fn oneshot_round_trip() {
        assert_eq!(oneshot_demo().await, 42);
    }

    #[tokio::test]
    async fn watch_broadcasts() {
        let v = watch_demo().await;
        assert_eq!(v, vec![0, 1, 2, 3]);
    }

    #[tokio::test]
    async fn notify_wakes_all() {
        assert_eq!(notify_demo(8).await, 8);
    }

    #[tokio::test]
    async fn select_picks_timer() {
        assert_eq!(select_race().await, "timer");
    }
}

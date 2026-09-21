"""Small restart-safe persisted-job worker.

The application still exposes a synchronous pipeline. This companion only
provides the durable claim/lease lifecycle so a future handler can be added
without changing queue semantics or making an idle worker spin.
"""

from __future__ import annotations

import os
import signal
import socket
import time
from collections.abc import Callable
from typing import Any

from cleardraft.store import Store

JobHandler = Callable[[dict[str, Any]], dict[str, Any] | None]


def process_one(store: Store, worker_id: str, *, lease_seconds: float = 30.0,
                handler: JobHandler | None = None) -> bool:
    """Claim and finish one job, returning False when the queue is empty."""
    job = store.claim_job(worker_id, lease_seconds=lease_seconds)
    if job is None:
        return False
    try:
        result = handler(job) if handler is not None else {"status": "accepted", "kind": job["kind"]}
    except Exception as exc:
        store.fail_job(job["id"], worker_id, f"{type(exc).__name__}: {exc}")
    else:
        store.complete_job(job["id"], worker_id, result)
    return True


def run_worker(store: Store, *, worker_id: str | None = None, poll_seconds: float = 2.0,
               lease_seconds: float = 30.0, stop: Callable[[], bool] | None = None,
               handler: JobHandler | None = None) -> None:
    """Poll until stopped; an empty queue sleeps rather than busy looping."""
    if poll_seconds < 0 or lease_seconds <= 0:
        raise ValueError("poll_seconds must be non-negative and lease_seconds must be positive")
    identity = worker_id or f"worker-{socket.gethostname()}-{os.getpid()}"
    should_stop = stop or (lambda: False)
    while not should_stop():
        if not process_one(store, identity, lease_seconds=lease_seconds, handler=handler):
            time.sleep(poll_seconds)


def main() -> int:
    stopping = False

    def stop(_signum: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    store = Store(os.getenv("CLEARDRAFT_DB", "var/cleardraft.db"))
    run_worker(store, poll_seconds=max(0.1, float(os.getenv("WORKER_POLL_SECONDS", "2"))),
               lease_seconds=max(1.0, float(os.getenv("WORKER_LEASE_SECONDS", "30"))),
               worker_id=os.getenv("WORKER_ID"), stop=lambda: stopping)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


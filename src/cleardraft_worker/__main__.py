"""Small restart-safe worker companion.

The current pipeline executes a run synchronously from the API/CLI and stores
the complete run row before returning. This process keeps the Compose topology
ready for queued jobs and provides a clean lifecycle until asynchronous job
claiming is enabled.
"""

from __future__ import annotations

import os
import signal
import time


def main() -> int:
    stopping = False

    def stop(_signum: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    interval = max(1.0, float(os.getenv("WORKER_POLL_SECONDS", "2")))
    while not stopping:
        # A future queue consumer can claim jobs here. Sleeping keeps this
        # companion process idle and deterministic for the synchronous slice.
        time.sleep(interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


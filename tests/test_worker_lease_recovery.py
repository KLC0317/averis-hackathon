"""Comprehensive unit tests for background worker job claims, lease recovery, and heartbeat renewals."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from cleardraft.store import Store


def test_claim_and_complete_job(tmp_path: Path) -> None:
    store = Store(str(tmp_path / "test_worker.db"))
    job_id = store.enqueue_job("process_email", {"email_id": "email_101"})
    assert job_id is not None

    # Worker 1 claims job
    claimed = store.claim_job("worker-1", lease_seconds=10.0)
    assert claimed is not None
    assert claimed["id"] == job_id
    assert claimed["status"] == "RUNNING"
    assert claimed["lease_owner"] == "worker-1"
    assert claimed["attempts"] == 1
    assert claimed["payload"] == {"email_id": "email_101"}

    # Another worker cannot claim while lease is active
    assert store.claim_job("worker-2", lease_seconds=10.0) is None

    # Heartbeat successfully extends lease
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    assert store.heartbeat_job(job_id, "worker-1", lease_seconds=20.0, now=now_iso) is True

    # Complete job
    assert store.complete_job(job_id, "worker-1", {"processed": True}) is True
    finished = store.get_job(job_id)
    assert finished is not None
    assert finished["status"] == "SUCCEEDED"
    assert finished["lease_owner"] is None
    assert finished["result"] == {"processed": True}


def test_worker_lease_expiry_and_claim_recovery(tmp_path: Path) -> None:
    store = Store(str(tmp_path / "test_recovery.db"))
    t0 = datetime(2026, 9, 21, 12, 0, 0, tzinfo=timezone.utc)
    t0_iso = t0.isoformat()
    # available_at must be pinned to the injected clock; the default is the real
    # wall clock, which makes the job unclaimable at t0 once that hour has passed.
    job_id = store.enqueue_job("extract_docs", {"case_id": "case-99"}, max_attempts=3,
                               available_at=t0_iso)

    # Worker 1 claims with 10-second lease
    claimed = store.claim_job("worker-1", lease_seconds=10.0, now=t0_iso)
    assert claimed is not None
    assert claimed["attempts"] == 1

    # At t0 + 5s, lease still active
    t5_iso = (t0 + timedelta(seconds=5)).isoformat()
    assert store.claim_job("worker-2", lease_seconds=10.0, now=t5_iso) is None

    # At t0 + 15s, worker 1's lease expired. Worker 2 claims and atomically recovers the job
    t15_iso = (t0 + timedelta(seconds=15)).isoformat()
    reclaimed = store.claim_job("worker-2", lease_seconds=10.0, now=t15_iso)
    assert reclaimed is not None
    assert reclaimed["id"] == job_id
    assert reclaimed["status"] == "RUNNING"
    assert reclaimed["lease_owner"] == "worker-2"
    assert reclaimed["attempts"] == 2


def test_recover_expired_jobs_explicit_sweep(tmp_path: Path) -> None:
    store = Store(str(tmp_path / "test_sweep.db"))
    t0 = datetime(2026, 9, 21, 14, 0, 0, tzinfo=timezone.utc)
    job_id = store.enqueue_job("sweep_task", {"step": 1}, max_attempts=3,
                               available_at=t0.isoformat())
    claimed = store.claim_job("worker-crashing", lease_seconds=10.0, now=t0.isoformat())
    assert claimed is not None

    # Before expiry, recovery sweeps 0 jobs
    assert store.recover_expired_jobs(now=(t0 + timedelta(seconds=5)).isoformat()) == 0

    # After expiry, recovery sweeps 1 job back to QUEUED
    after_expiry = (t0 + timedelta(seconds=12)).isoformat()
    recovered_count = store.recover_expired_jobs(now=after_expiry)
    assert recovered_count == 1

    job = store.get_job(job_id)
    assert job is not None
    assert job["status"] == "QUEUED"
    assert job["lease_owner"] is None


def test_max_attempts_dead_letter_on_lease_expiry(tmp_path: Path) -> None:
    store = Store(str(tmp_path / "test_dead_letter.db"))
    t0 = datetime(2026, 9, 21, 15, 0, 0, tzinfo=timezone.utc)
    # Single-attempt job
    job_id = store.enqueue_job("fragile_task", {"data": 42}, max_attempts=1,
                               available_at=t0.isoformat())
    claimed = store.claim_job("worker-flaky", lease_seconds=10.0, now=t0.isoformat())
    assert claimed is not None
    assert claimed["attempts"] == 1

    # Worker dies and lease expires; recover should mark FAILED, not re-queue
    t20_iso = (t0 + timedelta(seconds=20)).isoformat()
    assert store.recover_expired_jobs(now=t20_iso) == 1

    job = store.get_job(job_id)
    assert job is not None
    assert job["status"] == "FAILED"
    assert job["last_error"] == "lease expired"
    assert store.claim_job("worker-new", now=t20_iso) is None

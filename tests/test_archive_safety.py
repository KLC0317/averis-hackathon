from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from cleardraft.ingest import validate_archive


def test_archive_traversal_is_rejected_before_materialization(tmp_path: Path) -> None:
    archive = tmp_path / "unsafe.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("../outside.txt", "must not be written")
        bundle.writestr("participant/inbox/email_001.json", "{}")
    with pytest.raises(ValueError, match="unsafe archive path"):
        validate_archive(archive)
    assert not (tmp_path.parent / "outside.txt").exists()


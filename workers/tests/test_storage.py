"""Tests for engine.storage: the Phase 0 local-folder asset store (MinIO replaces it in 1.1 behind the same API)."""
from __future__ import annotations

import os

import pytest

from engine.storage import LocalFolderStore

HELLO_SHA256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"  # sha256(b"hello"), computed independently


def test_put_bytes_then_read_back_identical(tmp_path):
    store = LocalFolderStore(tmp_path / "assets")
    data = bytes(range(256)) * 10
    ref = store.put_bytes(data, kind="stills", ext="png")
    assert store.read_bytes(ref) == data


def test_ref_is_kind_slash_content_hash_dot_ext(tmp_path):
    store = LocalFolderStore(tmp_path / "assets")
    assert store.put_bytes(b"hello", kind="stills", ext="png") == f"stills/{HELLO_SHA256}.png"


def test_same_bytes_twice_give_one_ref_and_one_file(tmp_path):
    store = LocalFolderStore(tmp_path / "assets")
    a = store.put_bytes(b"hello", kind="voice", ext="mp3")
    b = store.put_bytes(b"hello", kind="voice", ext="mp3")
    assert a == b
    assert len(list((tmp_path / "assets" / "voice").iterdir())) == 1


def test_local_path_is_inside_the_store(tmp_path):
    store = LocalFolderStore(tmp_path / "assets")
    ref = store.put_bytes(b"hello", kind="stills", ext="png")
    p = store.local_path(ref)
    assert p == tmp_path / "assets" / "stills" / f"{HELLO_SHA256}.png"
    assert p.read_bytes() == b"hello"


def test_put_file_copies_and_lowercases_the_extension(tmp_path):
    src = tmp_path / "Photo.JPG"
    src.write_bytes(b"hello")
    store = LocalFolderStore(tmp_path / "assets")
    ref = store.put_file(src, kind="uploads")
    assert ref == f"uploads/{HELLO_SHA256}.jpg"
    assert src.read_bytes() == b"hello"
    assert store.read_bytes(ref) == b"hello"


def test_exists_is_false_for_an_unknown_asset(tmp_path):
    store = LocalFolderStore(tmp_path / "assets")
    assert store.exists(f"stills/{HELLO_SHA256}.png") is False


@pytest.mark.parametrize("ref", [
    "/etc/passwd",
    "../outside.png",
    f"stills/../../{HELLO_SHA256}.png",
    f"https://cdn.example.com/stills/{HELLO_SHA256}.png",
    "stills/not-a-hash.png",
    f"Stills/{HELLO_SHA256}.png",
    f"stills/{HELLO_SHA256}",
    f"stills/{HELLO_SHA256}.png\n",
])
def test_unsafe_or_malformed_refs_are_rejected(tmp_path, ref):
    store = LocalFolderStore(tmp_path / "assets")
    for op in (store.read_bytes, store.local_path, store.exists):
        with pytest.raises(ValueError):
            op(ref)


@pytest.mark.parametrize("kind,ext", [("../x", "png"), ("stills", "p/ng"), ("", "png"), ("stills", ""), ("stills\n", "png"), ("stills", "png\n")])
def test_bad_kind_or_extension_is_rejected(tmp_path, kind, ext):
    store = LocalFolderStore(tmp_path / "assets")
    with pytest.raises(ValueError):
        store.put_bytes(b"hello", kind=kind, ext=ext)


def test_a_failed_write_leaves_no_file_behind(tmp_path, monkeypatch):
    store = LocalFolderStore(tmp_path / "assets")

    def boom(src, dst):
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", boom)
    with pytest.raises(OSError):
        store.put_bytes(b"hello", kind="stills", ext="png")
    left = [p for p in (tmp_path / "assets").rglob("*") if p.is_file()]
    assert left == []


def test_put_file_stores_exactly_the_bytes_it_hashed(tmp_path, monkeypatch):
    # If the source changes while it is being stored (a download still flushing), the stored file must still match
    # the hash in its ref: the store reads the source once and hashes what it writes.
    import hashlib
    import io

    import engine.storage as storage

    src = tmp_path / "clip.mp4"
    src.write_bytes(b"version one")
    versions = iter([b"version one", b"version two, longer"])
    monkeypatch.setattr(storage, "open", lambda p, mode="r", *a, **k: io.BytesIO(next(versions)), raising=False)
    store = LocalFolderStore(tmp_path / "assets")
    ref = store.put_file(src, kind="video")
    digest = ref.split("/")[1].split(".")[0]
    assert hashlib.sha256(store.read_bytes(ref)).hexdigest() == digest


def test_a_corrupted_stored_file_is_repaired_by_the_next_put(tmp_path):
    store = LocalFolderStore(tmp_path / "assets")
    ref = store.put_bytes(b"hello", kind="stills", ext="png")
    store.local_path(ref).write_bytes(b"garbage")
    assert store.put_bytes(b"hello", kind="stills", ext="png") == ref
    assert store.read_bytes(ref) == b"hello"


def test_put_file_needs_a_file_extension(tmp_path):
    src = tmp_path / "noextension"
    src.write_bytes(b"hello")
    with pytest.raises(ValueError):
        LocalFolderStore(tmp_path / "assets").put_file(src, kind="uploads")


def test_put_file_of_the_same_bytes_twice_keeps_one_file(tmp_path):
    src = tmp_path / "a.png"
    src.write_bytes(b"hello")
    store = LocalFolderStore(tmp_path / "assets")
    assert store.put_file(src, kind="stills") == store.put_file(src, kind="stills")
    assert len([p for p in (tmp_path / "assets" / "stills").iterdir()]) == 1



def test_an_empty_payload_is_refused(tmp_path):
    store = LocalFolderStore(tmp_path / "assets")
    empty = tmp_path / "empty.mp4"
    empty.write_bytes(b"")
    with pytest.raises(ValueError):
        store.put_bytes(b"", kind="video", ext="mp4")
    with pytest.raises(ValueError):
        store.put_file(empty, kind="video")
    assert [p for p in (tmp_path / "assets").rglob("*") if p.is_file()] == []


def test_a_rejected_ref_is_not_echoed_with_its_credential(tmp_path):
    store = LocalFolderStore(tmp_path / "assets")
    with pytest.raises(ValueError) as err:
        store.local_path("https://cdn.example.com/x.png?key=AIzaSyFAKEFAKEFAKEFAKEFAKE1234")
    assert "AIzaSyFAKE" not in str(err.value)

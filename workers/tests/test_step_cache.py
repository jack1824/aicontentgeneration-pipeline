"""Tests for engine.step_cache (the Phase 0 SQLite step cache: a "submitted" row per paid request) and engine.redact."""
from __future__ import annotations

import sqlite3
import subprocess
import sys
import threading
import time
import unicodedata
from pathlib import Path

import pytest

from engine.redact import redact
from engine.step_cache import AssetNotStored, RequestNotRecorded, StepCache, StepConflict, step_key
from engine.storage import LocalFolderStore

REF_A = "stills/" + "a" * 64 + ".png"
REF_B = "stills/" + "b" * 64 + ".png"


def always(_ref):
    return True


def never(_ref):
    return False


def cache(tmp_path, exists=always, **kw):
    return StepCache(tmp_path / "s.sqlite3", exists=exists, secret_values=kw.pop("secret_values", ()), **kw)


# --- step keys ---

def test_step_key_ignores_key_order():
    assert step_key("tts", {"a": 1, "b": 2}) == step_key("tts", {"b": 2, "a": 1})


def test_step_key_changes_with_the_inputs_or_the_step():
    k = step_key("tts", {"a": 1})
    assert step_key("tts", {"a": 2}) != k
    assert step_key("stills", {"a": 1}) != k


def test_step_key_canonical_form_is_pinned():
    # Frozen: task 1.1 imports Phase 0 rows by this key. Expected value computed independently as
    # sha256('{"inputs":{"n":1,"text":"नमस्ते"},"step":"tts"}'.encode("utf-8")).
    assert step_key("tts", {"text": "नमस्ते", "n": 1}) == (
        "b894a0daa9b72ca6bba9bc068663c2dd97a10fae14e45cbdc6be1fbe7ce86726"
    )


def test_step_key_treats_composed_and_decomposed_text_alike():
    nukta_precomposed = chr(0x958)                  # क़ as one code point
    nukta_decomposed = chr(0x915) + chr(0x93C)      # क + nukta
    assert nukta_precomposed != nukta_decomposed
    assert step_key("tts", {"t": nukta_precomposed}) == step_key("tts", {"t": nukta_decomposed})
    e_acute = "caf" + chr(0xE9)
    assert step_key("tts", {"t": e_acute}) == step_key("tts", {"t": unicodedata.normalize("NFD", e_acute)})


def test_step_key_treats_whole_number_floats_as_ints():
    # Pydantic turns 5 into 5.0 for a float field; the key must not change (a changed key means paying again).
    assert step_key("s", {"d": 5}) == step_key("s", {"d": 5.0})
    assert step_key("s", {"d": 0}) == step_key("s", {"d": -0.0})
    assert step_key("s", {"d": [1.0, 2]}) == step_key("s", {"d": [1, 2]})
    # Expected values computed independently from the canonical text.
    assert step_key("s", {"d": 5.0}) == "d4f9365db0f45fb42bef2b129e9557748c33f7a89bf35ae8c31111320c1ae836"
    assert step_key("s", {"d": 0.5}) == "bb886873d1efdd9034dd39386c1da6c4c8ca1404d73d96a929a45bb607ecaac3"


def test_step_key_number_text_is_pinned():
    # Step keys are computed only by the Python engine (the API sends inputs, never a hash); these pin Python's text
    # for small and large numbers: '{"inputs":{"d":1e-05},"step":"s"}' and '{"inputs":{"d":1000000000000000000000},…'.
    assert step_key("s", {"d": 1e-05}) == "4004c00963bab029254d41471dc2c7f1f7d868860c270f6faf7652cc7fd38970"
    assert step_key("s", {"d": 1e21}) == "13ec95c1d708c1bf906970e009d8a95d0a49e9440d526f27dd8c962cc720817a"


@pytest.mark.parametrize("bad", [b"bytes", {1, 2}, float("nan"), float("inf"), object()])
def test_step_key_rejects_values_that_are_not_plain_json(bad):
    with pytest.raises((TypeError, ValueError)):
        step_key("tts", {"x": bad})


def test_step_key_needs_a_step_name():
    with pytest.raises(ValueError):
        step_key("", {"a": 1})


def test_step_key_rejects_non_string_keys_and_keys_that_collide_after_normalising():
    with pytest.raises(TypeError):
        step_key("tts", {1: "a"})
    with pytest.raises(ValueError):
        step_key("tts", {"caf" + chr(0xE9): 1, "cafe" + chr(0x301): 2})


# --- lookups and transitions ---

def test_an_unknown_key_is_a_miss(tmp_path):
    assert cache(tmp_path).lookup(step_key("stills", {"i": 1})).kind == "miss"


def test_a_submitted_request_resumes_after_reopening_instead_of_paying_again(tmp_path):
    db, k = tmp_path / "steps.sqlite3", step_key("stills", {"i": 1})
    c1 = StepCache(db, exists=always, secret_values=())
    c1.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    c1.close()
    c2 = StepCache(db, exists=always, secret_values=())
    found = c2.lookup(k)
    assert found.kind == "resume"
    assert found.row.request_id == "req-1" and found.row.provider == "higgsfield"


def test_submitting_the_same_request_id_twice_is_harmless(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    assert c.lookup(k).row.attempts == 1


def test_a_second_request_id_while_one_is_in_flight_raises(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    with pytest.raises(StepConflict):
        c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-2")


def test_a_second_paid_request_is_raised_with_its_own_id(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    with pytest.raises(RequestNotRecorded) as err:
        c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-2")
    assert err.value.request_id == "req-2" and err.value.provider == "higgsfield"
    assert "req-2" in str(err.value)


def test_a_paid_request_that_cannot_be_recorded_is_raised_with_its_id(tmp_path, monkeypatch):
    monkeypatch.setattr(StepCache, "BUSY_TIMEOUT_MS", 50)
    db = tmp_path / "s.sqlite3"
    c, k = StepCache(db, exists=always, secret_values=()), step_key("stills", {"i": 1})
    blocker = sqlite3.connect(db, isolation_level=None)
    blocker.execute("BEGIN IMMEDIATE")
    try:
        with pytest.raises(RequestNotRecorded) as err:
            c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-paid-1")
        assert err.value.request_id == "req-paid-1" and err.value.provider == "higgsfield"
    finally:
        blocker.execute("ROLLBACK")
        blocker.close()


def test_any_database_error_on_a_paid_request_is_raised_with_its_id(tmp_path, monkeypatch):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})

    def broken_tx(self):
        raise sqlite3.DatabaseError("file is not a database")

    monkeypatch.setattr(StepCache, "_tx", broken_tx)
    with pytest.raises(RequestNotRecorded) as err:
        c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-paid-2")
    assert err.value.request_id == "req-paid-2"


def test_mark_submitted_requires_a_step_and_a_provider(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    with pytest.raises(ValueError):
        c.mark_submitted(k, step="", provider="higgsfield", request_id="r1")
    with pytest.raises(ValueError):
        c.mark_submitted(k, step="stills", provider="", request_id="r1")


def test_the_cache_still_works_after_close(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_done(k, step="stills", result_ref=REF_A)
    c.close()
    assert c.lookup(k).kind == "hit"


def test_writes_wait_up_to_a_minute_for_the_lock(tmp_path):
    assert cache(tmp_path)._conn().execute("PRAGMA busy_timeout").fetchone()[0] >= 60000


def test_request_ids_must_be_text(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    with pytest.raises(TypeError):
        c.mark_submitted(k, step="stills", provider="higgsfield", request_id=123)
    with pytest.raises(TypeError):
        c.mark_done(k, step="stills", result_ref=REF_A, request_id=123)
    with pytest.raises(TypeError):
        c.mark_failed(k, step="stills", error="x", request_id=123)


def test_mark_done_records_which_request_produced_the_asset(tmp_path):
    c = cache(tmp_path)
    k1, k2 = step_key("tts", {"i": 1}), step_key("stills", {"i": 2})
    c.mark_done(k1, step="tts", result_ref=REF_A, request_id="req-9", provider="elevenlabs")
    row = c.lookup(k1).row
    assert (row.request_id, row.provider) == ("req-9", "elevenlabs")
    c.mark_submitted(k2, step="stills", provider="higgsfield", request_id="req-1")
    c.mark_failed(k2, step="stills", error="timeout", request_id="req-1")
    c.mark_submitted(k2, step="stills", provider="higgsfield", request_id="req-2")
    c.mark_failed(k2, step="stills", error="503", request_id="req-2")
    c.mark_done(k2, step="stills", result_ref=REF_B, request_id="req-1")  # a late success of req-1
    assert c.lookup(k2).row.request_id == "req-1"


def test_mark_failed_records_the_request_when_it_creates_the_row(tmp_path):
    c, k = cache(tmp_path), step_key("tts", {"i": 1})
    c.mark_failed(k, step="tts", error="422", request_id="req-5", provider="elevenlabs")
    row = c.lookup(k).row
    assert (row.request_id, row.provider) == ("req-5", "elevenlabs")


def test_mark_submitted_requires_a_request_id(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    with pytest.raises(ValueError):
        c.mark_submitted(k, step="stills", provider="higgsfield", request_id="")


def test_done_with_its_asset_present_is_a_hit(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    c.mark_done(k, step="stills", result_ref=REF_A, request_id="req-1")
    found = c.lookup(k)
    assert found.kind == "hit" and found.row.result_ref == REF_A


def test_done_whose_asset_was_deleted_later_is_stale_not_a_hit(tmp_path):
    store = LocalFolderStore(tmp_path / "assets")
    c, k = cache(tmp_path, exists=store.exists), step_key("stills", {"i": 1})
    ref = store.put_bytes(b"still", kind="stills", ext="png")
    c.mark_done(k, step="stills", result_ref=ref)
    store.local_path(ref).unlink()
    assert c.lookup(k).kind == "stale"


def test_mark_done_refuses_an_asset_that_is_not_in_the_store(tmp_path):
    c, k = cache(tmp_path, exists=never), step_key("stills", {"i": 1})
    with pytest.raises(AssetNotStored) as err:
        c.mark_done(k, step="stills", result_ref=REF_A)
    assert not isinstance(err.value, OSError), "an adapter's `except OSError` must not turn this into a retry"
    assert c.lookup(k).kind == "miss"


def test_a_refused_mark_done_keeps_the_request_in_flight(tmp_path):
    c, k = cache(tmp_path, exists=never), step_key("stills", {"i": 1})
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    with pytest.raises(AssetNotStored):
        c.mark_done(k, step="stills", result_ref=REF_A, request_id="req-1")
    found = c.lookup(k)
    assert found.kind == "resume" and found.row.request_id == "req-1"


def test_mark_done_with_the_same_ref_twice_is_harmless(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_done(k, step="stills", result_ref=REF_A)
    c.mark_done(k, step="stills", result_ref=REF_A)
    assert c.lookup(k).kind == "hit"


@pytest.mark.parametrize("mark", ["failed", "nsfw"])
def test_failed_and_nsfw_are_misses_and_may_be_submitted_again(tmp_path, mark):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    if mark == "failed":
        c.mark_failed(k, step="stills", error="provider 503", request_id="req-1")
    else:
        c.mark_nsfw(k, step="stills", detail="output flagged", request_id="req-1")
    assert c.lookup(k).kind == "miss"
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-2")
    row = c.lookup(k).row
    assert row.status == "submitted" and row.request_id == "req-2" and row.attempts == 2


@pytest.mark.parametrize("report", ["done", "failed", "nsfw"])
def test_a_report_must_name_the_request_in_flight(tmp_path, report):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    with pytest.raises(StepConflict):
        if report == "done":
            c.mark_done(k, step="stills", result_ref=REF_A)
        elif report == "failed":
            c.mark_failed(k, step="stills", error="x")
        else:
            c.mark_nsfw(k, step="stills", detail="x")
    assert c.lookup(k).kind == "resume"


def test_a_late_report_about_a_replaced_request_cannot_touch_the_one_in_flight(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    c.mark_failed(k, step="stills", error="provider 503", request_id="req-1")
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-2")
    with pytest.raises(StepConflict):
        c.mark_failed(k, step="stills", error="late webhook about req-1", request_id="req-1")
    with pytest.raises(StepConflict):
        c.mark_done(k, step="stills", result_ref=REF_A, request_id="req-1")
    assert [r.request_id for r in c.pending()] == ["req-2"]


@pytest.mark.parametrize("bad", ["https://cdn.higgsfield.ai/out/x.png", "/abs/x.png", "stills/x.png"])
def test_mark_done_refuses_anything_but_a_local_asset_ref(tmp_path, bad):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    with pytest.raises(ValueError):
        c.mark_done(k, step="stills", result_ref=bad)


def test_done_is_final_until_an_explicit_reset(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_done(k, step="stills", result_ref=REF_A)
    with pytest.raises(StepConflict):
        c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-9")
    with pytest.raises(StepConflict):
        c.mark_failed(k, step="stills", error="late failure")
    with pytest.raises(StepConflict):
        c.mark_nsfw(k, step="stills", detail="late flag")
    with pytest.raises(StepConflict):
        c.mark_done(k, step="stills", result_ref=REF_B)
    c.reset(k)
    assert c.lookup(k).kind == "miss"


def test_reset_refuses_a_request_in_flight_unless_forced(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-1")
    with pytest.raises(StepConflict):
        c.reset(k)
    assert c.lookup(k).kind == "resume"
    c.reset(k, force=True)
    assert c.lookup(k).kind == "miss"


def test_done_may_follow_a_failure_and_clears_the_error(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_failed(k, step="stills", error="provider 503")
    c.mark_done(k, step="stills", result_ref=REF_A)
    found = c.lookup(k)
    assert found.kind == "hit" and found.row.error is None


def test_pending_lists_only_requests_in_flight(tmp_path):
    c = cache(tmp_path)
    k1, k2, k3 = (step_key("stills", {"i": i}) for i in (1, 2, 3))
    c.mark_submitted(k1, step="stills", provider="higgsfield", request_id="r1")
    c.mark_submitted(k2, step="stills", provider="higgsfield", request_id="r2")
    c.mark_done(k2, step="stills", result_ref=REF_A, request_id="r2")
    c.mark_submitted(k3, step="video", provider="higgsfield", request_id="r3")
    assert sorted(r.request_id for r in c.pending()) == ["r1", "r3"]


def test_ordinary_error_text_is_kept_as_is(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_failed(k, step="stills", error="provider 503: model busy, retry in 30 s")
    assert c.lookup(k).row.error == "provider 503: model busy, retry in 30 s"


def test_error_text_is_cut_to_500_characters(tmp_path):
    c, k = cache(tmp_path), step_key("stills", {"i": 1})
    c.mark_failed(k, step="stills", error="slow " * 400)
    assert len(c.lookup(k).row.error) == 500


# --- durability and concurrency ---

def test_the_cache_file_uses_wal_and_its_folder_is_created(tmp_path):
    db = tmp_path / "a" / "b" / "steps.sqlite3"
    c = StepCache(db, exists=always, secret_values=())
    c.mark_done(step_key("stills", {"i": 1}), step="stills", result_ref=REF_A)
    c.close()
    with sqlite3.connect(db) as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"


def test_commits_are_flushed_to_disk_fully(tmp_path):
    # A committed "submitted" row must survive a power loss, or the next run pays again.
    c = cache(tmp_path)
    conn = c._conn()
    assert conn.execute("PRAGMA synchronous").fetchone()[0] == 2  # FULL
    assert conn.execute("PRAGMA fullfsync").fetchone()[0] == 1
    assert conn.execute("PRAGMA checkpoint_fullfsync").fetchone()[0] == 1


def test_threads_and_processes_write_300_rows_without_lock_errors(tmp_path):
    db = tmp_path / ".cache" / "steps.sqlite3"
    c = StepCache(db, exists=always, secret_values=())
    errors: list[BaseException] = []

    def worker(t: int) -> None:
        try:
            for i in range(25):
                k = step_key("thread", {"t": t, "i": i})
                c.mark_submitted(k, step="thread", provider="test", request_id=f"t{t}-{i}")
                c.mark_done(k, step="thread", result_ref=REF_A, request_id=f"t{t}-{i}")
        except BaseException as e:  # noqa: BLE001 - collected and asserted below
            errors.append(e)

    code = (
        "import sys\nfrom pathlib import Path\nfrom engine.step_cache import StepCache, step_key\n"
        "p = int(sys.argv[2])\nc = StepCache(Path(sys.argv[1]), exists=lambda r: True, secret_values=())\n"
        "for i in range(50):\n"
        "    k = step_key('proc', {'p': p, 'i': i})\n"
        "    c.mark_submitted(k, step='proc', provider='test', request_id=f'p{p}-{i}')\n"
        f"    c.mark_done(k, step='proc', result_ref={REF_A!r}, request_id=f'p{{p}}-{{i}}')\n"
        "c.close()\n"
    )
    procs = [subprocess.Popen([sys.executable, "-c", code, str(db), str(p)], stderr=subprocess.PIPE) for p in (1, 2)]
    threads = [threading.Thread(target=worker, args=(t,)) for t in range(8)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    outs = [p.communicate(timeout=60) for p in procs]
    c.close()
    assert errors == []
    assert [p.returncode for p in procs] == [0, 0], [o[1].decode()[-500:] for o in outs]
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM steps WHERE status = 'done'").fetchone()[0] == 300


# --- secrets never reach the cache (a provider's error text can echo a key) ---

FAKE_ERRORS = [
    ("GET https://generativelanguage.googleapis.com/v1/models/x:generate?key=AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFA12 -> 429",
     "AIzaSyFAKEFAKE"),
    ("401 from api.higgsfield.ai; request had Authorization: Key 1b4e28ba-2fa1-11d2-883f-0016d3cca427:hfFAKEsecretFAKE",
     "hfFAKEsecretFAKE"),
    ("upstream rejected Bearer gsk_FAKEfakeFAKEfakeFAKEfakeFAKEfake1234 (expired)", "gsk_FAKEfakeFAKE"),
    ("token nvapi-FAKEfakeFAKEfakeFAKEfakeFAKEfakeFAKEfake99 is invalid", "nvapi-FAKEfakeFAKE"),
    ("openrouter said: invalid key sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef", "sk-or-v1-0123456789abcdef"),
    ('provider body: {"api_key": "abcd1234efgh5678", "error": "bad key"}', "abcd1234efgh5678"),
    ("legacy headers {'hf-api-key': 'fakeid12345678', 'hf-secret': 'fakesecret9876543'}", "fakesecret9876543"),
    ("legacy headers {'hf-api-key': 'fakeid12345678', 'hf-secret': 'fakesecret9876543'}", "fakeid12345678"),
    ("could not connect to postgresql://studio:hunter2pass@localhost:5432/studio", "hunter2pass"),
    (r'{"detail": "{\"api_key\": \"abc123secret\"}"}', "abc123secret"),
    (r'{\"hf-secret\": \"fakesecret98765\"}', "fakesecret98765"),
    ("sent Authorization%3A%20Key%20abc%3Asecretvalue1 upstream", "secretvalue1"),
    ("password=12345678 rejected", "12345678"),
    ('{"password": "20261106"}', "20261106"),
    ("api_tokens=mysecretvalue99 refused", "mysecretvalue99"),
    ("refresh_tokens=abcDEF123ghi expired", "abcDEF123ghi"),
    ('{"access_token": "123456789012345"}', "123456789012345"),
    ("session_token=98765432109876 rejected", "98765432109876"),
    ("auth_token: 55554444333322221111", "55554444333322221111"),
]


@pytest.mark.parametrize("raw,secret", FAKE_ERRORS)
def test_secret_shaped_text_in_an_error_never_reaches_the_cache_file(tmp_path, raw, secret):
    db = tmp_path / "s.sqlite3"
    c, k = StepCache(db, exists=always, secret_values=()), step_key("llm", {"i": 1})
    c.mark_failed(k, step="llm", error=raw)
    stored = c.lookup(k).row.error
    assert secret not in stored and "[redacted]" in stored
    c.close()
    for f in tmp_path.iterdir():
        assert secret.encode() not in f.read_bytes(), f.name


def test_known_secret_values_are_redacted_even_when_they_match_no_pattern(tmp_path):
    secret = "plainlooking_value_77"
    c, k = cache(tmp_path, secret_values=[secret]), step_key("stills", {"i": 1})
    c.mark_nsfw(k, step="stills", detail=f"provider echoed {secret} back")
    assert secret not in c.lookup(k).row.error


def test_secret_values_must_be_given_explicitly(tmp_path):
    # Production passes engine.config.secret_values() (the .env and environment values); no hidden default.
    with pytest.raises(TypeError):
        StepCache(tmp_path / "s.sqlite3", exists=always)


# One case per redaction pattern that only that pattern catches, so removing any one of them fails a test.
ONLY_ONE_PATTERN = [
    ("header", "upstream: Authorization: Token abc123def456", "abc123def456"),
    ("query", "GET /v1/files/x?sig=abc123def456ghi&size=2", "abc123def456ghi"),
    ("scheme", "rejected bearer 1a2b3c4d5e6f7g8h9 from upstream", "1a2b3c4d5e6f7g8h9"),
    ("name=value", "config had client_secret=abc123def456 set", "abc123def456"),
    ("prefix", "got AIzaSyFAKEFAKEFAKEFAKE1234 back", "AIzaSyFAKEFAKEFAKEFAKE1234"),
    ("url userinfo", "redis://:hunter2pass@localhost:6379/0 refused", "hunter2pass"),
    ("long token", "opaque 0123456789abcdefABCDEF0123456789abcdefXYZ seen", "0123456789abcdefABCDEF0123456789abcdefXYZ"),
]


@pytest.mark.parametrize("layer,raw,secret", ONLY_ONE_PATTERN)
def test_each_redaction_layer_catches_its_own_shape(layer, raw, secret):
    assert secret not in redact(raw), layer


KEEP_AS_IS = [
    "provider 503: model busy, retry in 30 s",
    "request 1b4e28ba-2fa1-11d2-883f-0016d3cca427 failed",
    "max_tokens=4096 exceeds limit 8192",
    "total_tokens: 1234",
    "prompt_token_count: 812",
    "Key validation failed for this account",
    "Bearer authentication required",
    "asset stills/" + "c" * 64 + ".png missing",
]


@pytest.mark.parametrize("text", KEEP_AS_IS)
def test_ordinary_text_survives_redaction(text):
    assert redact(text) == text


def test_redaction_stays_fast_on_hostile_input():
    started = time.perf_counter()
    redact("token" * 20000)
    assert time.perf_counter() - started < 1.0


@pytest.mark.parametrize("offset", range(8140, 8200, 3))
def test_a_secret_cut_by_the_8_kb_cap_leaves_no_fragment(offset):
    # The key straddles the cap at some of these offsets; no prefix of it may survive anywhere.
    text = ("word " * 2000)[:offset] + " AIzaSyQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ tail"
    assert "AIzaSy" not in redact(text)


def test_a_known_secret_cut_by_the_8_kb_cap_leaves_no_fragment():
    text2 = "x " * 4090 + "plainlooking_value_77"
    assert "plainlookin" not in redact(text2, ["plainlooking_value_77"])


def test_redaction_reads_at_most_8_kb_of_an_error_body():
    # Defence in depth: whatever the patterns do, a huge error body is cut before it is scanned.
    assert len(redact("plain words " * 10000)) <= 8192


# --- 0.1 acceptance smoke test: one asset and one step-cache entry, round trip in a temp folder ---

def test_smoke_asset_and_step_cache_round_trip(tmp_path):
    store = LocalFolderStore(tmp_path / "assets")
    db = tmp_path / ".cache" / "steps.sqlite3"
    data = b"\x89PNG fake still bytes"
    k = step_key("stills", {"prompt_id": "hook-1", "model": "soul-2"})

    c1 = StepCache(db, exists=store.exists, secret_values=())
    c1.mark_submitted(k, step="stills", provider="higgsfield", request_id="req-42")
    ref = store.put_bytes(data, kind="stills", ext="png")
    c1.mark_done(k, step="stills", result_ref=ref, request_id="req-42")
    c1.close()

    c2 = StepCache(db, exists=store.exists, secret_values=())
    found = c2.lookup(k)
    assert found.kind == "hit"
    assert store.read_bytes(found.row.result_ref) == data
    assert Path(store.local_path(found.row.result_ref)).is_relative_to(tmp_path / "assets")

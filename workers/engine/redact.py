"""Remove secrets from text before it is stored or logged (error text, request logs). Lossy on purpose.

Order: percent-escapes are decoded; exact known secret values (from engine.config.secret_values() and the caller)
are replaced on the full text; the text is cut to MAX_INPUT characters, dropping any token cut in half at the edge;
then patterns catch key-shaped text a provider error can echo: credential headers, credential query parameters,
Bearer/Key/Basic tokens, name=value pairs whose name says secret (plain, JSON, dict-repr and backslash-escaped JSON
quoting), known provider prefixes, URL passwords, and any long opaque token.
Kept on purpose: UUID request ids, numeric token *counts* (max_tokens=4096), and the sha256 inside an asset ref.
"""
from __future__ import annotations

import re
from typing import Callable, Iterable, Union
from urllib.parse import unquote

REDACTED = "[redacted]"
MAX_INPUT = 8192
_Replacement = Union[str, Callable[[re.Match[str]], str]]

# Separator between a name and its value, allowing quotes and backslash-escaped quotes:
#   name=value · "name": "value" · 'name': 'value' · \"name\": \"value\"
_Q = r"""\\?["']?\s*[:=]\s*\\?["']?"""
_COUNT_NAME = re.compile(r"(?i)(?:tokens|token_count)$")  # max_tokens, prompt_token_count; not access_token
_SECRETISH_NAME = re.compile(r"(?i)secret|password|passwd|api_?key")
_TRAILING_TOKEN = re.compile(r"[A-Za-z0-9._~+/=:%_-]+$")


def _keep_counts(m: re.Match[str]) -> str:
    name, sep, value = m.group(1), m.group(2), m.group(3)
    if value.isdigit() and _COUNT_NAME.search(name) and not _SECRETISH_NAME.search(name):
        return m.group(0)  # a token count such as max_tokens=4096, not a secret
    return f"{name}{sep}{REDACTED}"


def _keep_asset_hash(m: re.Match[str]) -> str:
    s, text, start, end = m.group(0), m.string, m.start(), m.end()
    is_asset_hash = re.fullmatch(r"[0-9a-f]{64}", s) and text[start - 1:start] == "/" and text[end:end + 1] == "."
    return s if is_asset_hash else REDACTED


_PATTERNS: tuple[tuple[re.Pattern[str], _Replacement], ...] = (
    # Credential headers: the whole value, to the end of the line or the closing (escaped) quote.
    (re.compile(r"(?i)\b((?:proxy-)?authorization|x-api-key|xi-api-key|api-key|hf-api-key|hf-secret)(" + _Q + r")"
                r"[^\r\n\"'\\]+"), rf"\1\2{REDACTED}"),
    # Query parameters that carry credentials.
    (re.compile(r"(?i)([?&](?:key|api_key|apikey|token|access_token|signature|sig)=)[^&\s\"'#]+"), rf"\1{REDACTED}"),
    # Scheme credentials, any case; the token must contain a digit or be 16+ characters ("Key validation" survives).
    (re.compile(r"(?i)\b(bearer|key|basic)\s+(?=[A-Za-z0-9._~+/=:-]*\d|[A-Za-z0-9._~+/=:-]{16,})[A-Za-z0-9._~+/=:-]{8,}"),
     rf"\1 {REDACTED}"),
    # name=value where the name says secret (bounded name length keeps this linear).
    (re.compile(r"(?i)\b([A-Za-z0-9_]{0,40}(?:secret|token|password|passwd|api_?key)[A-Za-z0-9_]{0,40})(" + _Q + r")"
                r"([^\s,;&\"'}\\]+)"), _keep_counts),
    # Known provider prefixes.
    (re.compile(r"\b(?:AIza[0-9A-Za-z_\-]{20,}|gsk_[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_\-]{20,}|sk-or-v1-[A-Za-z0-9]{20,}"
                r"|sk-[A-Za-z0-9_\-]{20,}|sk_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9+/=]{10,})"), REDACTED),
    # Passwords in URLs: scheme://user:password@host and scheme://:password@host.
    (re.compile(r"(://[^/\s:@]*:)[^/\s@]+@"), rf"\1{REDACTED}@"),
    # Any long opaque token (UUID request ids are 36 characters; asset-ref hashes are kept).
    (re.compile(r"(?<![A-Za-z0-9_\-])[A-Za-z0-9_\-]{40,}(?![A-Za-z0-9_\-])"), _keep_asset_hash),
)


def redact(text: str, secret_values: Iterable[str] = ()) -> str:
    out = text or ""
    if "%" in out:
        out = unquote(out)  # "Authorization%3A%20Key%20…" is caught like the decoded header
    for value in sorted({v for v in secret_values if v and len(v) >= 6}, key=len, reverse=True):
        out = out.replace(value, REDACTED)  # on the full text, so the cap below cannot split a known secret
    if len(out) > MAX_INPUT:
        # Cut short enough that the marker still fits, and replace a token cut at the edge (no fragment survives).
        out = _TRAILING_TOKEN.sub(REDACTED, out[:MAX_INPUT - len(REDACTED)])
    for pattern, replacement in _PATTERNS:
        out = pattern.sub(replacement, out)
    return out

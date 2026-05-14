"""Network utilities for bypassing system HTTP proxies.

Academic APIs (OpenAlex, Semantic Scholar, arXiv, Tavily) are generally
reachable without a proxy from mainland China.  When a Clash / V2Ray proxy
is set via ``https_proxy`` / ``http_proxy`` environment variables, the
proxy's TLS interception frequently causes ``SSL: UNEXPECTED_EOF_WHILE_READING``
for these endpoints (~50 % failure rate).

This module provides a context manager that temporarily removes proxy
environment variables, forcing ``urllib`` and the ``requests`` library
to connect directly.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

_PROXY_VARS = ("https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY")


@contextmanager
def bypass_proxy() -> Iterator[None]:
    """Context manager that temporarily clears proxy environment variables.

    Usage::

        with bypass_proxy():
            urllib.request.urlopen(req, timeout=30)

    The original values are restored on exit (including for exceptions).
    """
    saved = {k: os.environ.pop(k, None) for k in _PROXY_VARS}
    try:
        yield
    finally:
        for k, v in saved.items():
            if v is not None:
                os.environ[k] = v

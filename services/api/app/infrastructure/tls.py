"""Verified system trust plus an optional operator-mounted model CA bundle."""

import ssl


def model_ssl_context(ca_bundle: str | None = None) -> ssl.SSLContext:
    context = ssl.create_default_context()
    if ca_bundle:
        # Add reviewed private roots without replacing public system roots.
        # Missing/invalid files fail closed; there is no insecure fallback.
        context.load_verify_locations(cafile=ca_bundle)
    return context

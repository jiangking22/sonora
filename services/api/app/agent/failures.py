"""Content-free error classification shared by chat and explicit diagnostics."""

import ssl

import httpx


def diagnostic_code(error: Exception) -> str:
    cause = error
    for _ in range(8):
        if isinstance(cause, ssl.SSLCertVerificationError):
            return 'tls_verification_failed'
        cause = cause.__cause__ or cause.__context__
        if cause is None:
            break
    if isinstance(error, (ssl.SSLError, FileNotFoundError, PermissionError)):
        return 'tls_configuration_error'
    if isinstance(error, (httpx.TimeoutException, TimeoutError)):
        return 'connection_timeout'
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        return ('authentication_failed' if status in (401, 403) else
                'rate_limited' if status == 429 else 'upstream_error')
    if isinstance(error, httpx.RequestError):
        return 'connection_failed'
    if isinstance(error, (ValueError, TypeError, KeyError)):
        return 'model_output_incompatible'
    return 'upstream_error'

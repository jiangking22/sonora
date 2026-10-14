"""Credential-free TLS probe of the configured model host, inside the API container."""

import json
import socket
import ssl
from urllib.parse import urlsplit

from app.infrastructure.config import get_settings
from app.infrastructure.tls import model_ssl_context


def main():
    settings = get_settings()
    target = urlsplit(settings.llm_base_url)
    if target.scheme != 'https':
        print(json.dumps({'code': 'loopback_http_has_no_tls'}))
        return
    try:
        context = model_ssl_context(settings.llm_ca_bundle)
        print(json.dumps({'system_paths': ssl.get_default_verify_paths()._asdict(),
                          'custom_ca_configured': bool(settings.llm_ca_bundle),
                          'trust_store': context.cert_store_stats()}))
        addresses = sorted({a[4][0] for a in socket.getaddrinfo(
            target.hostname, target.port or 443, type=socket.SOCK_STREAM)})[:4]
        for address in addresses:
            try:
                with (
                    socket.create_connection((address, target.port or 443), timeout=5) as sock,
                    context.wrap_socket(sock, server_hostname=target.hostname) as conn,
                ):
                    cert = conn.getpeercert()
                    print(json.dumps({'address': address, 'verified': True,
                                      'issuer': cert['issuer'], 'expires': cert['notAfter']}))
            except ssl.SSLCertVerificationError as exc:
                print(json.dumps({'address': address, 'code': 'tls_verification_failed',
                                  'verify_code': exc.verify_code}))
            except OSError:
                print(json.dumps({'address': address, 'code': 'connection_failed'}))
    except (OSError, ValueError):
        print(json.dumps({'code': 'trust_or_network_configuration_error'}))


if __name__ == '__main__':
    main()

This self-signed certificate and public test private key exist only for isolated
loopback TLS regression tests (`app.test`, `other.test`). They must never be
installed in a trust store and must never be used by the app.
Production certificates are issued separately by mkcert in protected user data.

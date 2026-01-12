# Custom certificates

You can set custom certificate paths

To use this feature, set the following env vars

```
DOCKMAN_PUB_CERT_PATH=/path/to/cert.pem
DOCKMAN_PRIV_KEY_PATH=/path/to/key.pem
```

Restart the server

## Self-signed

To generate self-signed certs use

```
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj "/CN=localhost"
```


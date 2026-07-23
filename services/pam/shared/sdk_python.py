"""Minimal Python SDK for the KNetraHub PAM secrets API.

Usage:
    from sdk_python import KnetraPamClient
    pam = KnetraPamClient(base_url=os.environ["KNETRA_PAM_URL"], token=os.environ["KNETRA_PAM_TOKEN"])
    secret = pam.get_secret("app/prod/db")
    print(secret["value"])          # value returned once; never cached here

Depends only on the standard library (urllib), so it runs in a bare CI image.
The token is an application-identity api_token issued in the PAM UI.
"""
import json
import urllib.request
import urllib.error


class KnetraPamError(Exception):
    pass


class KnetraPamClient:
    def __init__(self, base_url: str, token: str, timeout: float = 8.0):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def get_secret(self, path: str, version: int | None = None) -> dict:
        body = {"path": path}
        if version is not None:
            body["version"] = version
        req = urllib.request.Request(
            f"{self.base_url}/api/pam/v1/secrets/retrieve",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "authorization": f"Bearer {self.token}",
                "content-type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:200]
            raise KnetraPamError(f"PAM secret retrieval failed (HTTP {e.code}): {detail}") from None

    def get_json(self, path: str, version: int | None = None) -> dict:
        return json.loads(self.get_secret(path, version)["value"])

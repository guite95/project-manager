#!/usr/bin/env python3
"""Refresh OCI's short-lived identity in /run; never export keys off the host."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request

BASE = "http://169.254.169.254/opc/v2/identity/"


def metadata(name):
    request = urllib.request.Request(BASE + name, headers={"Authorization": "Bearer Oracle"})
    # Metadata must not pass through an HTTP proxy or redirect to another host.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=10) as response:
        data = response.read(32769)
    if len(data) > 32768:
        raise ValueError("Identity response too large")
    return data


def openssl(args, data=None):
    return subprocess.run(["openssl", *args], input=data, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, check=True).stdout


def validate_identity(cert, key, ca, subject, ca_hash, root=None):
    root = ca if root is None else root
    ca_der = openssl(["x509", "-outform", "DER"], root)
    if hashlib.sha256(ca_der).hexdigest() != ca_hash:
        raise ValueError("OCI CA changed; review WIF root trust before accepting it")
    dn = openssl(["x509", "-noout", "-subject", "-nameopt", "RFC2253"], cert).decode().strip()
    if dn.split("CN=")[-1] != subject:
        raise ValueError("Unexpected OCI instance identity")
    openssl(["x509", "-checkend", "600", "-noout"], cert)
    cert_public = openssl(["x509", "-pubkey", "-noout"], cert)
    key_public = openssl(["pkey", "-pubout"], key)
    if cert_public != key_public:
        raise ValueError("OCI rotation in progress; certificate/key do not match")
    # Verify the complete chain; intermediate CAs can rotate independently.
    with tempfile.TemporaryDirectory() as directory:
        paths = {name: Path(directory) / name for name in ["root.pem", "ca.pem", "cert.pem"]}
        for name, value in [("root.pem", root), ("ca.pem", ca), ("cert.pem", cert)]:
            paths[name].write_bytes(value)
        openssl(["verify", "-CAfile", str(paths["root.pem"]), "-untrusted",
                 str(paths["ca.pem"]), str(paths["cert.pem"])])
    return hashlib.sha256(openssl(["x509", "-outform", "DER"], cert)).hexdigest()


def refresh(output, subject, ca_hash, adc_template, root_path="/etc/project-management-oci-root.pem"):
    output = Path(output)
    if not str(output).startswith("/run/"):
        raise ValueError("Identity material must remain in /run")
    os.umask(0o077)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    cert, key, ca = metadata("cert.pem"), metadata("key.pem"), metadata("intermediate.pem")
    root = Path(root_path).read_bytes()
    fingerprint = validate_identity(cert, key, ca, subject, ca_hash, root)
    generation = output / "generations" / fingerprint
    generation.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name, data in [("cert.pem", cert + b"\n" + ca), ("key.pem", key)]:
        path = generation / name
        if not path.exists():
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
    # The SDK reads the chain separately. Publish only validated chains atomically;
    # a concurrent rotation may fail one token exchange and retry on the next run.
    fd, temporary = tempfile.mkstemp(dir=output, prefix=".chain-")
    with os.fdopen(fd, "wb") as stream:
        stream.write(ca + b"\n" + root)
    os.replace(temporary, output / "trust-chain.pem")
    # Publish one config referencing immutable generation paths, avoiding torn key/cert reads.
    config = {"cert_configs": {"workload": {
        "cert_path": str(generation / "cert.pem"), "key_path": str(generation / "key.pem")}}}
    fd, temporary = tempfile.mkstemp(dir=output, prefix=".certificate-")
    with os.fdopen(fd, "w") as stream:
        json.dump(config, stream)
    os.replace(temporary, output / "certificate-config.json")
    # The ADC template contains public resource identifiers and paths only.
    adc = json.loads(Path(adc_template).read_text())
    fd, temporary = tempfile.mkstemp(dir=output, prefix=".adc-")
    with os.fdopen(fd, "w") as stream:
        json.dump(adc, stream)
    os.replace(temporary, output / "adc.json")
    # Expired generations are only runtime identity files, never AI session data.
    for old in (output / "generations").iterdir():
        if old == generation or not old.is_dir():
            continue
        check = subprocess.run(["openssl", "x509", "-in", str(old / "cert.pem"),
                                "-checkend", "0", "-noout"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if check.returncode:
            (old / "key.pem").unlink(missing_ok=True)
            (old / "cert.pem").unlink(missing_ok=True)
            old.rmdir()
    print("OCI runtime certificate refreshed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/run/project-management-wif")
    parser.add_argument("--expected-instance", required=True)
    parser.add_argument("--trusted-ca-sha256", required=True)
    parser.add_argument("--adc-template", default="/etc/project-management-wif-adc.json")
    args = parser.parse_args()
    try:
        refresh(args.output_dir, args.expected_instance, args.trusted_ca_sha256, args.adc_template)
    except Exception as error:
        # Do not expose HTTP responses, private key material or subprocess input.
        raise SystemExit("OCI certificate refresh failed: " + type(error).__name__)

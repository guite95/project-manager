import hashlib
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("refresh", Path(__file__).with_name("refresh-oci-certificate.py"))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class IdentityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        p = Path(cls.directory.name)
        for name in ["first", "second"]:
            subprocess.run(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt",
                            "ec_paramgen_curve:P-256", "-nodes", "-subj", "/CN=test-instance",
                            "-days", "1", "-keyout", str(p / (name + ".key")),
                            "-out", str(p / (name + ".pem"))],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.cert = (p / "first.pem").read_bytes()
        cls.key = (p / "first.key").read_bytes()
        cls.other_key = (p / "second.key").read_bytes()
        cls.ca_hash = hashlib.sha256(refresh.openssl(["x509", "-outform", "DER"], cls.cert)).hexdigest()

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def test_accepts_pinned_identity_and_matching_key(self):
        self.assertEqual(refresh.validate_identity(self.cert, self.key, self.cert,
                                                  "test-instance", self.ca_hash), self.ca_hash)

    def test_rejects_different_instance(self):
        with self.assertRaisesRegex(ValueError, "Unexpected OCI instance"):
            refresh.validate_identity(self.cert, self.key, self.cert, "different", self.ca_hash)

    def test_rejects_changed_ca(self):
        with self.assertRaisesRegex(ValueError, "OCI CA changed"):
            refresh.validate_identity(self.cert, self.key, self.cert, "test-instance", "0" * 64)

    def test_rejects_torn_rotation(self):
        with self.assertRaisesRegex(ValueError, "do not match"):
            refresh.validate_identity(self.cert, self.other_key, self.cert, "test-instance", self.ca_hash)

    def test_rejects_durable_identity_directory(self):
        with self.assertRaisesRegex(ValueError, "remain in /run"):
            refresh.refresh("/tmp/identity", "test-instance", self.ca_hash, "/unused")

    def test_accepts_rotating_intermediates_but_rejects_untrusted_chain(self):
        p = Path(self.directory.name)
        def run(*args):
            subprocess.run(["openssl", *map(str, args)], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        (p / "ca.ext").write_text("basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n")
        (p / "leaf.ext").write_text("basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature\n")
        for serial in [10, 20]:
            ca = p / f"ca{serial}"
            leaf = p / f"leaf{serial}"
            for target, subject in [(ca, "intermediate"), (leaf, "test-instance")]:
                run("req", "-new", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256",
                    "-nodes", "-subj", f"/CN={subject}", "-keyout", f"{target}.key", "-out", f"{target}.csr")
            run("x509", "-req", "-in", f"{ca}.csr", "-CA", p / "first.pem", "-CAkey", p / "first.key",
                "-set_serial", serial, "-days", 1, "-extfile", p / "ca.ext", "-out", f"{ca}.pem")
            run("x509", "-req", "-in", f"{leaf}.csr", "-CA", f"{ca}.pem", "-CAkey", f"{ca}.key",
                "-set_serial", serial + 1, "-days", 1, "-extfile", p / "leaf.ext", "-out", f"{leaf}.pem")
            cert, key, intermediate = [Path(name).read_bytes() for name in [f"{leaf}.pem", f"{leaf}.key", f"{ca}.pem"]]
            self.assertTrue(refresh.validate_identity(cert, key, intermediate, "test-instance", self.ca_hash, self.cert))
            with self.assertRaises(subprocess.CalledProcessError):
                refresh.validate_identity(cert, key, (p / "second.pem").read_bytes(),
                                          "test-instance", self.ca_hash, self.cert)


if __name__ == "__main__":
    unittest.main()

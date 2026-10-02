#!/usr/bin/env python3
"""Real API regression tests for a disposable localhost Casdoor instance only.

Run with the repository's init_data.json bootstrap (admin / 123). No production
account or mail service is used; verification mail terminates in an SMTP sink.
"""
import base64
import hashlib
import hmac
import http.cookiejar
import json
import os
import queue
import re
import socketserver
import struct
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get("KANO_TEST_URL", "http://localhost:8011")
if urllib.parse.urlsplit(BASE).hostname not in ("localhost", "127.0.0.1"):
    raise SystemExit("Tests only run against a disposable localhost instance")
PASSWORD = "Local-Portal-2026!"
MAIL = queue.Queue()


class SMTPHandler(socketserver.StreamRequestHandler):
    def handle(self):
        def send(value):
            self.wfile.write((value + "\r\n").encode())
        send("220 localhost test SMTP")
        while line := self.rfile.readline():
            command = line.decode().strip().upper()
            if command.startswith("EHLO"):
                send("250-localhost")
                send("250 AUTH PLAIN")
            elif command.startswith("DATA"):
                send("354 Send mail")
                message = b""
                while (line := self.rfile.readline()) != b".\r\n":
                    if not line:
                        return
                    message += line
                MAIL.put(message.decode())
                send("250 Accepted")
            elif command.startswith("QUIT"):
                send("221 Bye")
                return
            elif command.startswith("AUTH"):
                send("235 Authenticated")
            else:
                send("250 OK")


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, path, data=None, form=False):
        body = None if data is None else (urllib.parse.urlencode(data).encode()
                                        if form else json.dumps(data).encode())
        request = urllib.request.Request(BASE + path, data=body, headers={
            "Content-Type": "application/x-www-form-urlencoded" if form else "application/json",
            "Accept-Language": "en"})
        try:
            response = self.opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        return json.load(response)

    def login(self, name, password=PASSWORD, **extra):
        return self.request("/api/login", dict(application="kano", organization="kano",
                                             username=name, password=password,
                                             autoSignin=True, type="login", **extra))

    def upload(self, query):
        boundary = uuid.uuid4().hex
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=")
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"avatar.png\"\r\n"
                "Content-Type: image/png\r\n\r\n").encode() + png + f"\r\n--{boundary}--\r\n".encode()
        request = urllib.request.Request(BASE + "/api/upload-resource?" + urllib.parse.urlencode(query),
            data=body, headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
        return json.load(self.opener.open(request, timeout=20))


def totp(secret, offset=0):
    counter = struct.pack(">Q", int(time.time() // 30) + offset)
    digest = hmac.new(base64.b32decode(secret), counter, hashlib.sha1).digest()
    start = digest[-1] & 15
    number = struct.unpack(">I", digest[start:start + 4])[0] & 0x7fffffff
    return f"{number % 1000000:06d}"


class PortalTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.smtp = socketserver.ThreadingTCPServer(("127.0.0.1", 0), SMTPHandler)
        threading.Thread(target=cls.smtp.serve_forever, daemon=True).start()
        cls.admin = Client()
        cls.must_ok(cls.admin.request("/api/login", dict(application="app-built-in",
            organization="built-in", username="admin", password="123", autoSignin=True, type="login")))
        organization = cls.admin.request("/api/get-organization?id=admin/built-in")["data"]
        organization.update(name="kano", displayName="Kano 通行证", passwordType="bcrypt",
                            passwordSalt="", defaultApplication="kano", disableConsole=False)
        for item in organization["accountItems"]:
            if item["name"] == "Email":
                item.update(viewRule="Self", modifyRule="Admin")
        current = cls.admin.request("/api/get-organization?id=admin/kano").get("data")
        cls.must_ok(cls.admin.request("/api/update-organization?id=admin/kano" if current
                                     else "/api/add-organization", organization))
        if not cls.admin.request("/api/get-provider?id=admin/kano-test-mail").get("data"):
            cls.must_ok(cls.admin.request("/api/add-provider", dict(owner="admin", name="kano-test-mail",
                category="Email", type="SMTP", host="127.0.0.1", port=cls.smtp.server_address[1],
                sslMode="Disable", clientId2="test@example.com", clientSecret2="Local test",
                title="Verification", content="Your verification code is %s")))
        provider = cls.admin.request("/api/get-provider?id=admin/kano-test-mail")["data"]
        provider["port"] = cls.smtp.server_address[1]
        cls.must_ok(cls.admin.request("/api/update-provider?id=admin/kano-test-mail", provider))
        storage = dict(owner="admin", name="kano-test-storage", category="Storage",
                       type="Local File System", domain=BASE)
        current = cls.admin.request("/api/get-provider?id=admin/kano-test-storage").get("data")
        cls.must_ok(cls.admin.request("/api/update-provider?id=admin/kano-test-storage" if current
                                     else "/api/add-provider", storage))
        builtin = cls.admin.request("/api/get-application?id=admin/app-built-in")["data"]
        signup = [item.copy() for item in builtin["signupItems"]]
        for item in signup:
            if item["name"] in ("Phone", "Agreement"):
                item.update(visible=False, required=False)
        application = dict(owner="admin", name="kano", displayName="Kano 通行证",
            organization="kano", cert=builtin["cert"], enablePassword=True, enableSignUp=True,
            enableSigninSession=True, codeResendTimeout=1, tokenFormat="JWT", tokenSigningMethod="RS256",
            tokenFields=["Owner", "Name", "Id", "Email", "DisplayName"], expireInHours=1,
            grantTypes=["authorization_code", "refresh_token"], redirectUris=["http://localhost:9009/callback"],
            signinMethods=[dict(name="Password", displayName="Password", rule="All")],
            signinItems=builtin["signinItems"], signupItems=signup,
            providers=[dict(name="kano-test-mail", rule="All", canSignUp=True),
                       dict(name="kano-test-storage", rule="All")],
            clientId="kano-local-test-client", clientSecret="kano-local-test-secret")
        current = cls.admin.request("/api/get-application?id=admin/kano").get("data")
        cls.must_ok(cls.admin.request("/api/update-application?id=admin/kano" if current
                                     else "/api/add-application", application))
        cls.application = cls.admin.request("/api/get-application?id=admin/kano")["data"]

    @classmethod
    def tearDownClass(cls):
        cls.smtp.shutdown()
        cls.smtp.server_close()

    @staticmethod
    def must_ok(response):
        if response.get("status") != "ok":
            raise AssertionError(response.get("msg", "API rejected request"))
        return response.get("data")

    def setUp(self):
        while not MAIL.empty():
            MAIL.get_nowait()
        self.name = "portal-" + uuid.uuid4().hex[:12]
        self.must_ok(self.admin.request("/api/add-user", dict(owner="kano", name=self.name,
            id=uuid.uuid4().hex, displayName="Portal tester", email=self.name + "@example.com",
            emailVerified=True, password=PASSWORD, type="normal-user", signupApplication="kano")))
        self.client = Client()
        self.must_ok(self.client.login(self.name))
        self.target = dict(owner="kano", name=self.name, mfaType="app")

    def tearDown(self):
        for attempt in range(3):
            response = self.admin.request("/api/delete-user", dict(owner="kano", name=self.name))
            if "SQLITE_BUSY" not in response.get("msg", ""):
                self.must_ok(response)
                break
            time.sleep(0.2)
        else:
            self.must_ok(response)

    def user(self):
        return self.must_ok(self.client.request("/api/get-user?id=kano/" + self.name))

    def reject(self, response):
        self.assertEqual(response["status"], "error")

    def setup_mfa(self):
        self.must_ok(self.client.request("/api/check-user-password", dict(owner="kano", name=self.name,
                                                                       password=PASSWORD)))
        props = self.must_ok(self.client.request("/api/mfa/setup/initiate", self.target, form=True))
        self.must_ok(self.client.request("/api/mfa/setup/verify",
            dict(self.target, secret=props["secret"], passcode=totp(props["secret"])), form=True))
        self.must_ok(self.client.request("/api/mfa/setup/enable",
            dict(self.target, secret=props["secret"], recoveryCodes="client-tampered-code"), form=True))
        return props

    def test_profile_and_email_policy(self):
        before = self.user()
        self.must_ok(self.client.request("/api/update-user?id=kano/" + self.name + "&columns=displayName",
                                         dict(displayName="New nickname")))
        after = self.user()
        self.assertEqual(after["displayName"], "New nickname")
        self.assertEqual(after["id"], before["id"])
        self.assertEqual(after["email"], before["email"])
        for field, value in (("email", "changed@example.com"), ("emailVerified", False),
                             ("id", "changed-id"), ("name", "other"), ("isAdmin", True),
                             ("totpSecret", "BYPASS")):
            self.reject(self.client.request("/api/update-user?id=kano/" + self.name + "&columns=" + field,
                                             {field: value}))
        self.reject(self.client.request("/api/reset-email-or-phone", dict(type="email",
            dest="changed@example.com", code="000000"), form=True))
        self.reject(Client().request("/api/update-user?id=kano/" + self.name + "&columns=displayName",
                                     dict(displayName="Unauthenticated")))
        self.reject(self.client.request("/api/update-user?id=built-in/admin&columns=displayName",
                                        dict(displayName="Cross user")))

    def test_password_change(self):
        payload = dict(userOwner="kano", userName=self.name, newPassword="Updated-2026!", oldPassword="wrong")
        self.reject(self.client.request("/api/set-password", payload, form=True))
        payload["oldPassword"] = PASSWORD
        self.must_ok(self.client.request("/api/set-password", payload, form=True))
        self.reject(Client().login(self.name))
        self.must_ok(Client().login(self.name, "Updated-2026!"))

    def mail_code(self, client, method):
        self.must_ok(client.request("/api/send-verification-code", dict(dest=self.name + "@example.com",
            type="email", applicationId="admin/kano", method=method, checkUser=self.name,
            captchaType="none"), form=True))
        message = MAIL.get(timeout=10)
        return re.search(r"code is (\d{6})", message).group(1)

    def test_forgot_password(self):
        client = Client()
        code = self.mail_code(client, "forget")
        payload = dict(application="kano", organization="kano", username=self.name + "@example.com",
                       name=self.name, code="wrong", type="login")
        self.reject(client.request("/api/verify-code", payload))
        reset = dict(userOwner="kano", userName=self.name, newPassword="Recovered-2026!", code=code)
        self.reject(client.request("/api/set-password", reset, form=True))
        payload["code"] = code
        self.must_ok(client.request("/api/verify-code", payload))
        self.reject(Client().request("/api/verify-code", payload))
        self.must_ok(client.request("/api/set-password", reset, form=True))
        self.reject(Client().login(self.name))
        self.must_ok(Client().login(self.name, "Recovered-2026!"))

    def test_avatar_upload_and_scope(self):
        query = dict(owner="kano", user=self.name, application="kano", tag="avatar",
                     fullFilePath="avatar/kano/" + self.name + ".png")
        response = self.client.upload(query)
        url = self.must_ok(response)
        self.assertEqual(self.user()["avatar"], url)
        self.assertIn("/files/avatar/kano/", url)
        self.assertEqual(self.client.opener.open(url, timeout=10).status, 200)
        self.reject(self.client.upload(dict(query, fullFilePath="avatar/kano/another-user.png")))

    def test_same_organization_mfa_scope(self):
        self.setup_mfa()
        peer_name = "peer-" + uuid.uuid4().hex[:12]
        self.must_ok(self.admin.request("/api/add-user", dict(owner="kano", name=peer_name,
            id=uuid.uuid4().hex, displayName="Peer", email=peer_name + "@example.com",
            password=PASSWORD, signupApplication="kano", type="normal-user")))
        try:
            peer = Client()
            self.must_ok(peer.login(peer_name))
            for endpoint, body in (("check-user-password", dict(self.target, password=PASSWORD)),
                                   ("mfa/setup/initiate", self.target),
                                   ("delete-mfa", dict(self.target, password=PASSWORD, recoveryCode="wrong")),
                                   ("set-preferred-mfa", self.target)):
                self.reject(peer.request("/api/" + endpoint, body, form=endpoint != "check-user-password"))
        finally:
            self.must_ok(self.admin.request("/api/delete-user", dict(owner="kano", name=peer_name)))

    def test_existing_email_factor_removal(self):
        self.must_ok(self.admin.request("/api/update-user?id=kano/" + self.name + "&columns=mfaEmailEnabled,preferredMfaType",
            dict(mfaEmailEnabled=True, preferredMfaType="email")))
        code = self.mail_code(self.client, "mfaAuth")
        self.reject(self.client.request("/api/delete-mfa", dict(owner="kano", name=self.name,
            mfaType="email", password=PASSWORD, passcode="wrong"), form=True))
        self.must_ok(self.client.request("/api/delete-mfa", dict(owner="kano", name=self.name,
            mfaType="email", password=PASSWORD, passcode=code), form=True))
        self.assertFalse(any(item["enabled"] for item in self.user()["multiFactorAuths"]))

    def test_mfa_setup_and_removal(self):
        self.reject(self.client.request("/api/mfa/setup/initiate", self.target, form=True))
        self.must_ok(self.client.request("/api/check-user-password",
            dict(owner="kano", name=self.name, password=PASSWORD)))
        props = self.must_ok(self.client.request("/api/mfa/setup/initiate", self.target, form=True))
        enable = dict(self.target, secret=props["secret"], recoveryCodes="tampered")
        self.reject(self.client.request("/api/mfa/setup/enable", enable, form=True))
        for code in ("invalid", totp(props["secret"], -10)):
            self.reject(self.client.request("/api/mfa/setup/verify",
                dict(self.target, secret=props["secret"], passcode=code), form=True))
        self.must_ok(self.client.request("/api/mfa/setup/verify",
            dict(self.target, secret=props["secret"], passcode=totp(props["secret"])), form=True))
        self.must_ok(self.client.request("/api/mfa/setup/enable", enable, form=True))
        self.reject(self.client.request("/api/mfa/setup/enable", enable, form=True))
        attacker = Client()
        self.assertEqual(attacker.login(self.name)["data"], "NextMfa")
        self.reject(attacker.request("/api/login", dict(application="kano", organization="kano",
            type="login", mfaType="app", passcode="wrong")))
        self.must_ok(attacker.request("/api/login", dict(application="kano", organization="kano",
            type="login", mfaType="app", passcode=totp(props["secret"]))))
        for extras in (dict(password="wrong", passcode=totp(props["secret"])),
                       dict(password=PASSWORD, passcode="wrong"), dict(password=PASSWORD),
                       dict(password=PASSWORD, recoveryCode="tampered")):
            self.reject(self.client.request("/api/delete-mfa", dict(self.target, **extras), form=True))
        self.must_ok(self.client.request("/api/delete-mfa",
            dict(self.target, password=PASSWORD, passcode=totp(props["secret"])), form=True))
        self.assertFalse(any(item["enabled"] for item in self.user()["multiFactorAuths"]))

    def test_lost_authenticator_recovery(self):
        props = self.setup_mfa()
        client = Client()
        self.assertEqual(client.login(self.name)["data"], "NextMfa")
        recovery = props["recoveryCodes"][0]
        self.must_ok(client.request("/api/login", dict(application="kano", organization="kano",
            type="login", recoveryCode=recovery)))
        other = Client()
        other.login(self.name)
        self.reject(other.request("/api/login", dict(application="kano", organization="kano",
            type="login", recoveryCode=recovery)))
        self.must_ok(client.request("/api/delete-mfa",
            dict(self.target, password=PASSWORD, recoveryCode=recovery), form=True))
        self.reject(client.request("/api/delete-mfa",
            dict(self.target, password=PASSWORD, recoveryCode=recovery), form=True))

    def test_oidc_state_pkce_and_subject(self):
        verifier = "a" * 64
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        query = urllib.parse.urlencode(dict(clientId=self.application["clientId"], responseType="code",
            redirectUri="http://localhost:9009/callback", scope="openid profile email",
            state="kano-regression-state", nonce="kano-regression-nonce", code_challenge=challenge,
            code_challenge_method="S256"))
        response = self.client.request("/api/login?" + query, dict(application="kano", organization="kano",
            username=self.name, password=PASSWORD, autoSignin=True, type="code"))
        code = self.must_ok(response)
        token = self.client.request("/api/login/oauth/access_token", dict(grant_type="authorization_code",
            client_id=self.application["clientId"], client_secret=self.application["clientSecret"],
            code=code, code_verifier=verifier), form=True)
        self.assertIn("id_token", token)
        claims = json.loads(base64.urlsafe_b64decode(token["id_token"].split(".")[1] + "=="))
        self.assertEqual(claims["sub"], self.user()["id"])
        self.assertEqual(claims["nonce"], "kano-regression-nonce")

    def test_signup_email_verification(self):
        client = Client()
        email = "signup-" + uuid.uuid4().hex[:12] + "@example.com"
        self.must_ok(client.request("/api/send-verification-code", dict(dest=email, type="email",
            applicationId="admin/kano", method="signup", captchaType="none"), form=True))
        message = MAIL.get(timeout=10)
        code = re.search(r"code is (\d{6})", message).group(1)
        signup = dict(application="kano", organization="kano", username=email.split("@")[0],
            name="Signup test", password=PASSWORD, email=email, emailCode="invalid")
        self.reject(client.request("/api/signup", signup))
        signup["emailCode"] = code
        self.must_ok(client.request("/api/signup", signup))
        self.reject(client.request("/api/signup", signup))
        self.must_ok(client.login(signup["username"]))
        user = self.must_ok(client.request("/api/get-user?id=kano/" + signup["username"]))
        self.assertTrue(user["emailVerified"])
        self.must_ok(self.admin.request("/api/delete-user", dict(owner="kano", name=signup["username"])))


if __name__ == "__main__":
    unittest.main(verbosity=2)

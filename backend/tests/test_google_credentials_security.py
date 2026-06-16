import json
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.api.settings import (
    GoogleCredentialImport,
    SettingUpdate,
    import_google_credentials,
    update_settings,
)
from app.api.websites import create_website
from app.models.setting import SystemSetting
from app.models.website import Website
from app.schemas.website import WebsiteCreate
from app.services.secret_storage import (
    is_protected_secret,
    migrate_legacy_secrets,
    protect_secret,
    reveal_secret,
)


def _encryption_environment() -> dict[str, str]:
    if os.name == "nt":
        return {}
    from cryptography.fernet import Fernet
    return {"CREDENTIAL_ENCRYPTION_KEY": Fernet.generate_key().decode("ascii")}


class SecretStorageTests(unittest.TestCase):
    def test_google_private_key_is_not_stored_as_plaintext(self) -> None:
        private_key = "-----BEGIN PRIVATE KEY-----\nvery-sensitive-value\n-----END PRIVATE KEY-----\n"
        with patch.dict(os.environ, _encryption_environment(), clear=False):
            protected = protect_secret(private_key)
            self.assertTrue(is_protected_secret(protected))
            self.assertNotIn("very-sensitive-value", protected)
            self.assertEqual(private_key, reveal_secret(protected))


class _FakeResult:
    def __init__(self, value=None, values=None) -> None:
        self._value = value
        self._values = values or []

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        return self._values


class _FakeSession:
    def __init__(self) -> None:
        self.settings = {}
        self.websites = []

    async def execute(self, statement):
        if not hasattr(statement, "column_descriptions"):
            for website in self.websites:
                website.gsc_verified_at = None
            return _FakeResult()
        entity = statement.column_descriptions[0].get("entity")
        parameters = list(statement.compile().params.values())
        if entity is Website:
            return _FakeResult(values=self.websites)
        if parameters and isinstance(parameters[0], list):
            values = [self.settings[key] for key in parameters[0] if key in self.settings]
            return _FakeResult(values=values)
        key = parameters[0]
        return _FakeResult(self.settings.get(key))

    def add(self, setting) -> None:
        self.settings[setting.key] = setting

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        return None


class _WebsiteCreateSession:
    def __init__(self) -> None:
        self.created = None

    async def execute(self, statement):
        return _FakeResult()

    def add(self, value) -> None:
        self.created = value

    async def flush(self) -> None:
        return None

    async def refresh(self, value) -> None:
        return None


class _FakeSessionContext:
    def __init__(self, session: _FakeSession) -> None:
        self.session = session

    async def __aenter__(self) -> _FakeSession:
        return self.session

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        return None


class SettingsWriteBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_private_key_cannot_be_written_through_general_settings_endpoint(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            await update_settings(
                [SettingUpdate(key="GOOGLE_PRIVATE_KEY", value="plaintext-private-key")],
                api_key="test",
                db=None,
            )

        self.assertEqual(400, raised.exception.status_code)

    async def test_other_setting_secrets_are_protected_before_storage(self) -> None:
        db = _FakeSession()
        secret_settings = {
            "GOOGLE_PSI_API_KEY": "psi-plaintext-secret",
            "DINGTALK_WEBHOOK_URL": "https://dingtalk.example/send?access_token=plain-secret",
            "WECOM_WEBHOOK_URL": "https://wecom.example/send?key=plain-secret",
        }

        with patch.dict(os.environ, _encryption_environment(), clear=False):
            await update_settings(
                [SettingUpdate(key=key, value=value) for key, value in secret_settings.items()],
                api_key="test",
                db=db,
            )

            for key, value in secret_settings.items():
                stored_value = db.settings[key].value
                self.assertTrue(is_protected_secret(stored_value))
                self.assertNotIn("plain-secret", stored_value)
                self.assertEqual(value, reveal_secret(stored_value))

    async def test_website_cms_secrets_are_protected_before_storage(self) -> None:
        db = _WebsiteCreateSession()

        with patch.dict(os.environ, _encryption_environment(), clear=False):
            await create_website(
                WebsiteCreate(
                    name="Protected CMS",
                    domain="example.com",
                    site_type="wordpress",
                    shopify_access_token="shopify-plaintext-secret",
                    wp_app_password="wordpress-plaintext-secret",
                ),
                api_key="test",
                db=db,
            )

            for field, expected in (
                ("shopify_access_token", "shopify-plaintext-secret"),
                ("wp_app_password", "wordpress-plaintext-secret"),
            ):
                stored_value = getattr(db.created, field)
                self.assertTrue(is_protected_secret(stored_value))
                self.assertNotIn("plaintext-secret", stored_value)
                self.assertEqual(expected, reveal_secret(stored_value))

    async def test_json_import_stores_only_a_protected_private_key(self) -> None:
        generated_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_key = generated_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("ascii")
        credential_json = json.dumps({
            "type": "service_account",
            "project_id": "credential-test",
            "private_key_id": "test-key",
            "private_key": private_key,
            "client_email": "test@credential-test.iam.gserviceaccount.com",
            "client_id": "123456",
            "token_uri": "https://oauth2.googleapis.com/token",
        })
        db = _FakeSession()

        with (
            patch.dict(os.environ, _encryption_environment(), clear=False),
            patch("app.api.settings.google_api_client.clear_cache"),
        ):
            result = await import_google_credentials(
                GoogleCredentialImport(credentials_json=credential_json),
                api_key="test",
                db=db,
            )
            stored_key = db.settings["GOOGLE_PRIVATE_KEY"].value
            self.assertEqual("credential-test", result["project_id"])
            self.assertEqual("https://oauth2.googleapis.com/token", db.settings["GOOGLE_TOKEN_URI"].value)
            self.assertTrue(is_protected_secret(stored_key))
            self.assertNotEqual(private_key, stored_key)
            self.assertEqual(private_key, reveal_secret(stored_key))

    async def test_legacy_database_secrets_are_migrated_to_protected_storage(self) -> None:
        private_key = "legacy-plaintext-private-key"
        db = _FakeSession()
        db.settings["GOOGLE_PRIVATE_KEY"] = SystemSetting(key="GOOGLE_PRIVATE_KEY", value=private_key)
        db.settings["GOOGLE_PSI_API_KEY"] = SystemSetting(key="GOOGLE_PSI_API_KEY", value="legacy-psi-key")
        db.websites.append(
            Website(
                name="Legacy CMS",
                domain="legacy.example.com",
                site_type="wordpress",
                shopify_access_token="legacy-shopify-token",
                wp_app_password="legacy-wp-password",
            )
        )

        with (
            patch.dict(os.environ, _encryption_environment(), clear=False),
            patch("app.database.async_session", return_value=_FakeSessionContext(db)),
        ):
            migrated = await migrate_legacy_secrets()
            stored_key = db.settings["GOOGLE_PRIVATE_KEY"].value
            self.assertEqual(4, migrated)
            self.assertTrue(is_protected_secret(stored_key))
            self.assertNotEqual(private_key, stored_key)
            self.assertEqual(private_key, reveal_secret(stored_key))
            self.assertEqual("legacy-psi-key", reveal_secret(db.settings["GOOGLE_PSI_API_KEY"].value))
            self.assertEqual("legacy-shopify-token", reveal_secret(db.websites[0].shopify_access_token))
            self.assertEqual("legacy-wp-password", reveal_secret(db.websites[0].wp_app_password))


if __name__ == "__main__":
    unittest.main()

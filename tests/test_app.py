import ipaddress
import unittest
from unittest.mock import patch
from urllib.parse import quote

from app import (
    AXE_SCRIPT,
    ScanError,
    URLValidationError,
    _playwright_error_message,
    app,
    validate_public_url,
)


def dns_record(address):
    return (ipaddress.ip_address(address).version, 1, 6, "", (address, 0))


class PublicURLValidationTests(unittest.TestCase):
    def test_normalizes_public_url(self):
        with patch("app.socket.getaddrinfo", return_value=[dns_record("93.184.216.34")]):
            self.assertEqual(
                validate_public_url("HTTPS://Example.COM"),
                "https://example.com/",
            )

    def test_rejects_private_ip_literals(self):
        for url in ("http://127.0.0.1", "http://10.0.0.4", "http://[::1]"):
            with self.subTest(url=url), self.assertRaises(URLValidationError):
                validate_public_url(url)

    def test_rejects_internal_hostname(self):
        with self.assertRaises(URLValidationError):
            validate_public_url("http://printer.local")

    def test_rejects_hostname_with_any_non_public_dns_answer(self):
        records = [dns_record("93.184.216.34"), dns_record("192.168.1.8")]
        with patch("app.socket.getaddrinfo", return_value=records):
            with self.assertRaisesRegex(URLValidationError, "private or non-public"):
                validate_public_url("https://example.com")

    def test_rejects_non_standard_scheme_port_combination(self):
        with patch("app.socket.getaddrinfo", return_value=[dns_record("93.184.216.34")]):
            with self.assertRaisesRegex(URLValidationError, "standard HTTP"):
                validate_public_url("https://example.com:80")


class BrowserErrorGuidanceTests(unittest.TestCase):
    def test_explains_browser_connection_timeout(self):
        message = _playwright_error_message(
            RuntimeError("Page.goto: net::ERR_CONNECTION_TIMED_OUT")
        )

        self.assertIn("did not respond", message)
        self.assertIn("automated browsers", message)

    def test_explains_hostname_resolution_failure(self):
        message = _playwright_error_message(
            RuntimeError("Page.goto: net::ERR_NAME_NOT_RESOLVED")
        )

        self.assertIn("resolve", message)
        self.assertIn("DNS", message)

    def test_explains_content_security_policy_failure(self):
        message = _playwright_error_message(
            RuntimeError("This document requires 'TrustedScript' assignment")
        )

        self.assertIn("Content Security Policy", message)
        self.assertIn("cannot be scanned", message)


class AxeInjectionTests(unittest.TestCase):
    def test_axe_runs_on_a_page_with_strict_script_csp(self):
        from playwright.sync_api import sync_playwright

        html = (
            "<!doctype html><meta http-equiv=\"Content-Security-Policy\" "
            "content=\"default-src 'none'; script-src 'none'; "
            "require-trusted-types-for 'script'\">"
            "<html lang=\"en\"><head><title>Fixture</title></head>"
            "<body><h1>Fixture</h1></body></html>"
        )
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                context = browser.new_context()
                context.add_init_script(path=str(AXE_SCRIPT))
                page = context.new_page()
                page.goto(f"data:text/html,{quote(html)}", wait_until="domcontentloaded")
                result = page.evaluate(
                    """async () => ({
                        loaded: typeof axe === "object",
                        passes: (await axe.run(document)).passes.length
                    })"""
                )
            finally:
                browser.close()

        self.assertTrue(result["loaded"])
        self.assertGreater(result["passes"], 0)


class ScanEndpointTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_rejects_private_url_before_starting_a_scan(self):
        with patch("app.scan_website") as scan_website:
            response = self.client.post(
                "/api/scan",
                json={"url": "http://127.0.0.1"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("private", response.get_json()["error"].lower())
        scan_website.assert_not_called()

    def test_requires_json_input(self):
        response = self.client.post("/api/scan", data="url=https://example.com")

        self.assertEqual(response.status_code, 415)

    def test_returns_actionable_browser_failure(self):
        with (
            patch("app.validate_public_url", return_value="https://example.com/"),
            patch(
                "app.scan_website",
                side_effect=ScanError("The site did not respond to the scanner."),
            ),
        ):
            response = self.client.post(
                "/api/scan",
                json={"url": "https://example.com"},
            )

        self.assertEqual(response.status_code, 502)
        self.assertIn("did not respond", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()

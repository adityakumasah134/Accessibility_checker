import ipaddress
import re
import socket
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from flask import Flask, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
AXE_SCRIPT = BASE_DIR / "node_modules" / "axe-core" / "axe.min.js"
BLOCKED_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".lan",
    ".home",
    ".test",
    ".invalid",
    ".onion",
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024


class URLValidationError(ValueError):
    """The submitted URL or a browser request is not safe to scan."""


class ScanError(RuntimeError):
    """A website could not be scanned successfully."""


def _playwright_error_message(error: Exception) -> str:
    message = str(error).lower()
    if "err_name_not_resolved" in message:
        return (
            "The browser could not resolve this website's hostname. Check the URL, "
            "DNS, and internet connection."
        )
    if "err_connection_timed_out" in message or "timeout" in message:
        return (
            "The website did not respond to the scanner before the timeout. It may be "
            "slow, temporarily unavailable, blocking automated browsers, or unreachable "
            "from this network. Try again or scan another public page."
        )
    if "err_cert" in message or "certificate" in message:
        return (
            "Chromium rejected the website's security certificate. Check the site's "
            "HTTPS configuration and try again later."
        )
    if "trustedscript" in message or "trusted types" in message:
        return (
            "The website's Content Security Policy stopped the accessibility script "
            "from running. This page cannot be scanned with its current browser policy."
        )
    if "err_tunnel_connection_failed" in message or "proxy" in message:
        return (
            "The browser could not connect through this network's proxy. Check the "
            "proxy or firewall settings, then try again."
        )
    if "err_connection_refused" in message or "err_connection_reset" in message:
        return (
            "The website closed or refused the browser connection. It may be temporarily "
            "unavailable or may not accept automated scanning."
        )
    if "err_aborted" in message or "err_blocked_by_client" in message:
        return (
            "The browser navigation was stopped. The site may have redirected to a "
            "blocked address or stopped the automated request."
        )
    return (
        "The browser could not load or scan this website. It may require a sign-in, "
        "human verification, or browser access that this scanner cannot provide."
    )


def _validate_host(hostname: str, port: int) -> str:
    host = hostname.rstrip(".").lower()
    if not host or "%" in host or host.endswith(BLOCKED_SUFFIXES):
        raise URLValidationError("Use a public website address, not a local or internal host.")

    try:
        ip_address = ipaddress.ip_address(host)
    except ValueError:
        ip_address = None

    if ip_address is not None:
        if not ip_address.is_global:
            raise URLValidationError("Private, reserved, and local IP addresses cannot be scanned.")
        return ip_address.compressed

    try:
        ascii_host = host.encode("idna").decode("ascii")
    except UnicodeError as error:
        raise URLValidationError("The website hostname is invalid.") from error

    if (
        len(ascii_host) > 253
        or "." not in ascii_host
        or not re.fullmatch(
            r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
            r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+",
            ascii_host,
        )
    ):
        raise URLValidationError("Enter a valid public website hostname.")

    try:
        addresses = socket.getaddrinfo(
            ascii_host,
            port,
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as error:
        raise URLValidationError("The website hostname could not be resolved.") from error

    resolved_addresses = {record[4][0].split("%", 1)[0] for record in addresses}
    if not resolved_addresses:
        raise URLValidationError("The website hostname did not resolve to an address.")

    try:
        is_public = all(
            ipaddress.ip_address(address).is_global for address in resolved_addresses
        )
    except ValueError as error:
        raise URLValidationError("The website hostname resolved to an invalid address.") from error
    if not is_public:
        raise URLValidationError(
            "The website hostname resolves to a private or non-public address."
        )

    return ascii_host


def validate_public_url(raw_url: str) -> str:
    """Validate a public HTTP(S) URL and return its normalized form."""
    if not isinstance(raw_url, str):
        raise URLValidationError("Enter a website URL.")

    value = raw_url.strip()
    if not value or any(character.isspace() or ord(character) < 32 for character in value):
        raise URLValidationError("Enter a valid website URL without spaces or control characters.")

    try:
        parts = urlsplit(value)
        hostname = parts.hostname
        port = parts.port
    except ValueError as error:
        raise URLValidationError("The website URL is malformed.") from error

    scheme = parts.scheme.lower()
    if scheme not in {"http", "https"} or not hostname:
        raise URLValidationError("Enter a complete website URL starting with http:// or https://.")
    if parts.username is not None or parts.password is not None:
        raise URLValidationError("Website URLs must not include a username or password.")

    expected_port = 443 if scheme == "https" else 80
    effective_port = port if port is not None else expected_port
    if effective_port != expected_port:
        raise URLValidationError(
            "Only standard HTTP (port 80) and HTTPS (port 443) URLs are allowed."
        )

    normalized_host = _validate_host(hostname, effective_port)
    if ":" in normalized_host:
        normalized_host = f"[{normalized_host}]"
    netloc = normalized_host if port is None else f"{normalized_host}:{port}"

    return urlunsplit((scheme, netloc, parts.path or "/", parts.query, parts.fragment))


def _axe_violations(results: dict) -> list[dict]:
    violations = []
    for violation in results["violations"]:
        nodes = []
        for node in violation["nodes"]:
            checks = node.get("any", []) + node.get("all", []) + node.get("none", [])
            nodes.append(
                {
                    "target": node.get("target", []),
                    "html": node.get("html", ""),
                    "failureSummary": node.get("failureSummary"),
                    "suggestions": [
                        check["message"] for check in checks if check.get("message")
                    ],
                }
            )

        violations.append(
            {
                "id": violation["id"],
                "impact": violation.get("impact") or "unknown",
                "description": violation["description"],
                "help": violation["help"],
                "helpUrl": violation["helpUrl"],
                "nodes": nodes,
            }
        )
    return violations


def scan_website(url: str) -> dict:
    if not AXE_SCRIPT.is_file():
        raise ScanError(
            "axe-core is not installed. Run `npm install` in the project folder, then try again."
        )

    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright

    def guard_request(route):
        target = route.request.url
        try:
            validate_public_url(target)
        except URLValidationError:
            app.logger.warning("Blocked a non-public browser request during accessibility scan.")
            route.abort()
            return
        route.continue_()

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                context = browser.new_context(
                    accept_downloads=False,
                    ignore_https_errors=False,
                    service_workers="block",
                )
                context.add_init_script(path=str(AXE_SCRIPT))
                context.route("**/*", guard_request)
                page = context.new_page()
                page.set_default_navigation_timeout(45_000)
                page.set_default_timeout(30_000)

                response = page.goto(url, wait_until="commit")
                if response is None:
                    raise ScanError("The website did not return a page that could be scanned.")
                if response.status >= 400:
                    raise ScanError(f"The website returned HTTP {response.status}.")

                try:
                    page.wait_for_load_state("domcontentloaded", timeout=15_000)
                except PlaywrightTimeoutError as error:
                    raise ScanError(
                        "The website responded, but its initial page did not finish loading. "
                        "It may be slow or may require browser features this scanner cannot provide."
                    ) from error

                try:
                    page.wait_for_load_state("load", timeout=8_000)
                except PlaywrightTimeoutError:
                    app.logger.debug("Scanning after the page load event timed out.")

                try:
                    page.wait_for_load_state("networkidle", timeout=3_000)
                except PlaywrightTimeoutError:
                    app.logger.debug("Continuing the scan while the page still has network activity.")

                axe_results = page.evaluate(
                    """async () => {
                        const result = await axe.run(document);
                        return {
                            violations: result.violations,
                            passes: result.passes.length,
                            incomplete: result.incomplete.length
                        };
                    }"""
                )
                violations = _axe_violations(axe_results)
                impact_counts = {
                    severity: sum(
                        violation["impact"] == severity for violation in violations
                    )
                    for severity in ("critical", "serious", "moderate", "minor")
                }
                return {
                    "url": page.url,
                    "title": page.title(),
                    "summary": {
                        "violations": len(violations),
                        **impact_counts,
                        "passes": axe_results["passes"],
                        "incomplete": axe_results["incomplete"],
                    },
                    "violations": violations,
                }
            finally:
                browser.close()
    except ScanError:
        raise
    except PlaywrightTimeoutError as error:
        raise ScanError(_playwright_error_message(error)) from error
    except PlaywrightError as error:
        app.logger.warning(
            "Playwright could not scan the requested website (error type: %s).",
            type(error).__name__,
        )
        raise ScanError(_playwright_error_message(error)) from error


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/scan")
def scan():
    if not request.is_json:
        return jsonify({"error": "Send the website URL as JSON."}), 415

    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("url"), str):
        return jsonify({"error": "Enter a website URL to scan."}), 400
    if len(data["url"]) > 2048:
        return jsonify({"error": "The website URL must be 2,048 characters or fewer."}), 400

    try:
        url = validate_public_url(data["url"])
        result = scan_website(url)
    except URLValidationError as error:
        return jsonify({"error": str(error)}), 400
    except ScanError as error:
        return jsonify({"error": str(error)}), 502

    return jsonify(result)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)

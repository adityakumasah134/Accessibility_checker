# AccessiCheck

AccessiCheck is a college-project website accessibility checker. Enter a public website URL and the Flask server opens it in a headless Playwright Chromium browser, runs the real [axe-core](https://github.com/dequelabs/axe-core) rules against the page, and displays the reported violations, impact, affected elements, rule guidance, and axe-core fix suggestions.

The report is written for non-technical readers: it explains issues in everyday language, suggests what to do next, and hides raw page code and scan details behind an optional expandable section. The summary shows issues to fix, the most important ones, checks passed, and checks a person should review. Results come from the live scan; the app does not use sample or hardcoded scan results. Scanning is best-effort: it works on public pages the browser can reach, but no automated scanner can guarantee access to every site.

The dashboard uses a dark editorial theme with warm orange accents and round-based section labels. It includes a staggered cinematic hero entrance, a CSS-built 3D accessibility illustration with pointer-responsive tilt on mouse devices, floating motion, animated scan feedback, and staggered scan results. The layout is responsive, and motion follows the operating system's reduced-motion preference.

The dashboard includes an About section explaining the project's purpose and how it helps people understand scan findings. The page ends with an animated, 3D Team Galaxy credit card that responds to pointer movement on desktop. Motion respects reduced-motion preferences.

## Requirements

- Python 3.10 or later
- Node.js 18 or later (includes npm)
- Internet access to install packages and scan public websites

## Install and run (Windows PowerShell)

Run these commands from the folder containing `app.py`.

1. Create a virtual environment:

   ```powershell
   py -m venv .venv
   ```

2. Activate it:

   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```

   If PowerShell blocks activation, open Command Prompt and run:

   ```bat
   .venv\Scripts\activate.bat
   ```

3. Install the Python packages:

   ```powershell
   python -m pip install -r requirements.txt
   ```

4. Install Playwright's Chromium browser:

   ```powershell
   python -m playwright install chromium
   ```

5. Install axe-core:

   ```powershell
   npm install
   ```

6. Start the application:

   ```powershell
   python app.py
   ```

7. Open **http://127.0.0.1:5000** in your browser and submit a public website URL, such as `https://www.example.com`.

The app listens only on the local computer. Stop it with **Ctrl+C** in the terminal.

## Run the tests

With the virtual environment active, run:

```powershell
python -m unittest discover -s tests -v
```

## Install and run (macOS / Linux)

From the project folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m playwright install chromium
npm install
python app.py
```

Then open **http://127.0.0.1:5000**.

## How the scan works

1. The server validates the URL and resolves its hostname before scanning.
2. Playwright loads the site in Chromium; browser requests, including redirects and subresources, are checked too.
3. The locally installed axe-core script runs against the rendered page.
4. The browser returns axe-core's violations, passing checks, and incomplete checks to the dashboard.

The browser waits for the initial document and gives pages additional time to finish loading before it runs axe-core. Playwright loads the local axe-core script at document initialization, so pages with restrictive script-tag policies can still be inspected without adding a remote script to the site. If navigation fails, the dashboard reports likely causes such as a timeout, DNS issue, certificate problem, or refused connection.

The page's violation descriptions, affected selectors, HTML snippets, help links, and remediation messages come from axe-core's scan output. Automated checks cannot identify every accessibility barrier; keyboard, screen-reader, and user testing remain important.

Some public websites cannot be scanned automatically. They may block headless browsers, require a login or CAPTCHA, depend on browser features unavailable to this scanner, or be unreachable due to network, firewall, DNS, or certificate problems. Access controls are not bypassed. The scanner evaluates the submitted page URL only; it does not crawl every page on a site.

## URL safety

- Only HTTP and HTTPS URLs on standard ports (80 and 443) are accepted.
- Local, private, reserved, and non-public IP addresses are rejected.
- Local/internal hostnames and hostnames that resolve to any non-public address are rejected.
- Browser requests are checked as the page loads, so redirects and subresources targeting non-public addresses are blocked.
- The browser can scan only pages that are publicly reachable and permit its automated request; public availability does not guarantee automated access.

This is a local educational prototype, not a hardened public scanning service. Do not expose it to the internet: a production service also needs authentication, rate and resource limits, isolation, and infrastructure-level egress restrictions.

## Project structure

```text
app.py                  Flask routes, URL checks, and Playwright/axe-core scan
templates/index.html    Dashboard markup
static/css/style.css    Responsive dashboard styles
static/js/app.js        Scan form and live report rendering
static/favicon.svg      Dashboard favicon
tests/test_app.py       URL-safety and scan-endpoint tests
requirements.txt        Python dependencies
package.json            axe-core dependency
package-lock.json       Locked npm dependency versions
```

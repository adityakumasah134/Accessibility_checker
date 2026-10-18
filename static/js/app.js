const form = document.querySelector("#scan-form");
const urlInput = document.querySelector("#website-url");
const scanButton = document.querySelector("#scan-button");
const formError = document.querySelector("#form-error");
const progress = document.querySelector("#scan-progress");
const progressMessage = document.querySelector("#progress-message");
const issueList = document.querySelector("#issue-list");
const emptyState = document.querySelector("#empty-state");
const severityFilter = document.querySelector("#severity-filter");
const accessVisual = document.querySelector("#access-visual");
const teamSignoffStage = document.querySelector("#team-signoff-stage");
const teamSignoffObject = teamSignoffStage?.querySelector(".team-signoff-object");

const metrics = {
  total: document.querySelector("#metric-total"),
  priority: document.querySelector("#metric-priority"),
  passes: document.querySelector("#metric-passes"),
  incomplete: document.querySelector("#metric-incomplete"),
};

document.documentElement.classList.add("hero-motion");

const aboutRevealItems = document.querySelectorAll(".about-reveal");
if (
  aboutRevealItems.length &&
  "IntersectionObserver" in window &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  document.documentElement.classList.add("about-motion");
  const aboutObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -32px 0px" });
  aboutRevealItems.forEach((item) => aboutObserver.observe(item));
}

if (
  teamSignoffStage &&
  teamSignoffObject &&
  window.matchMedia("(pointer: fine)").matches &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  let teamTiltFrame = 0;
  teamSignoffStage.addEventListener("pointermove", (event) => {
    const bounds = teamSignoffStage.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;

    cancelAnimationFrame(teamTiltFrame);
    teamTiltFrame = requestAnimationFrame(() => {
      teamSignoffObject.style.setProperty("--team-tilt-y", `${(horizontal * 16).toFixed(2)}deg`);
      teamSignoffObject.style.setProperty("--team-tilt-x", `${(vertical * -12).toFixed(2)}deg`);
    });
  });

  teamSignoffStage.addEventListener("pointerleave", () => {
    cancelAnimationFrame(teamTiltFrame);
    teamSignoffObject.style.setProperty("--team-tilt-x", "0deg");
    teamSignoffObject.style.setProperty("--team-tilt-y", "0deg");
  });
}

let currentViolations = [];

const plainLanguage = {
  "region": {
    title: "Some content is outside a named page section",
    description: "People using a screen reader can move between areas like the menu, main content, and footer. Some content is outside those areas.",
    fix: "Put this content in the right named area of the page, such as the main content, menu, or footer.",
  },
  "landmark-one-main": {
    title: "The page needs a main content area",
    description: "A clearly marked main area helps people using a screen reader jump straight to the most important part of a page.",
    fix: "Mark the central content of the page as its main area. Each page should have one main area.",
  },
  "landmark-unique": {
    title: "Two page areas have the same name",
    description: "People using a screen reader use area names to find their way around. Each area should be easy to tell apart.",
    fix: "Give each menu, main area, or other page section a clear name that makes it different from the others.",
  },
  "bypass": {
    title: "Visitors need a way to skip repeated content",
    description: "A skip link lets keyboard and screen-reader users move past repeated menus and get to the main content faster.",
    fix: "Add a visible-on-focus “Skip to main content” link near the top of the page.",
  },
  "color-contrast": {
    title: "Some text is hard to read",
    description: "Some text does not stand out enough from its background. This can make it difficult to read, especially for people with low vision.",
    fix: "Make the text darker or its background lighter so the words are easier to see.",
  },
  "image-alt": {
    title: "An image needs a description",
    description: "A person who cannot see an image may miss its meaning if the image has no text description.",
    fix: "Add a short description of what the image communicates. If it is only decoration, mark it as decorative instead.",
  },
  "button-name": {
    title: "A button needs a clear name",
    description: "Some visitors use a screen reader, which reads button names aloud. This button does not have a clear name.",
    fix: "Give the button a short, helpful name that explains what happens when someone selects it.",
  },
  "link-name": {
    title: "A link needs clearer words",
    description: "People should be able to understand where a link goes from its words, even when they hear the links on a page by themselves.",
    fix: "Change the link text to describe its destination or what it will do.",
  },
  "label": {
    title: "A form question needs a label",
    description: "People need to know what information to enter in this box. The question or label is missing or unclear.",
    fix: "Add a visible question or label next to the box, such as “Email address”.",
  },
  "html-has-lang": {
    title: "The page language is not set",
    description: "Screen readers use the page language to pronounce words correctly. This page has not clearly stated its language.",
    fix: "Set the page language, for example English, in the page settings.",
  },
  "document-title": {
    title: "The page needs a useful title",
    description: "A clear page title helps people know which page they opened, especially when using browser tabs or a screen reader.",
    fix: "Give this page a short title that describes what the page is about.",
  },
  "heading-order": {
    title: "The page headings are out of order",
    description: "Headings work like a contents list. The order should make it easy to understand how the page is organized.",
    fix: "Arrange headings in order: use a main heading first, then smaller headings for sections beneath it.",
  },
  "page-has-heading-one": {
    title: "The page needs a main heading",
    description: "A main heading tells visitors what the page is about and helps screen-reader users understand its structure.",
    fix: "Add one clear main heading near the start of the page.",
  },
  "frame-title": {
    title: "An embedded window needs a title",
    description: "The title helps visitors understand what content an embedded window contains before they open it.",
    fix: "Give the embedded window a short title that describes its content, such as “Map of the campus”.",
  },
  "list": {
    title: "A group of items is not marked as a list",
    description: "Lists help visitors understand that several items belong together and how many there are.",
    fix: "Mark these related items as a numbered or bulleted list.",
  },
  "meta-viewport": {
    title: "Visitors may not be able to zoom in",
    description: "Zooming helps people enlarge text and page content so it is easier to see.",
    fix: "Allow visitors to zoom in using their browser settings.",
  },
  "link-in-text-block": {
    title: "A link is hard to spot in the text",
    description: "Links should be visually distinct so visitors can tell them apart from the surrounding words.",
    fix: "Make the link stand out with more than just a color change, for example by underlining it.",
  },
  "input-button-name": {
    title: "A button needs a clear name",
    description: "Some visitors use a screen reader, which reads button names aloud. This button does not have a clear name.",
    fix: "Give the button a short, helpful name that explains what happens when someone selects it.",
  },
  "select-name": {
    title: "A menu needs a clear label",
    description: "Visitors need to know what they are choosing from this menu, including when they use a screen reader.",
    fix: "Add a visible label that explains what the menu is for.",
  },
  "duplicate-id": {
    title: "Two parts of the page have the same identifier",
    description: "Some page controls rely on each part having its own unique name. Repeated names can send visitors to the wrong place.",
    fix: "Give each affected part of the page its own unique identifier.",
  },
  "aria-hidden-focus": {
    title: "A hidden item can still receive keyboard focus",
    description: "This item is hidden from some visitors but can still be reached with the keyboard, which can be confusing.",
    fix: "Make the item available to everyone, or make sure hidden items cannot be reached with the keyboard.",
  },
};

const friendlyImpact = {
  critical: "Fix first",
  serious: "High priority",
  moderate: "Worth fixing",
  minor: "Small improvement",
  unknown: "Please review",
};

if (accessVisual && window.matchMedia("(pointer: fine)").matches) {
  let pointerFrame = 0;

  accessVisual.addEventListener("pointermove", (event) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(pointerFrame);
    pointerFrame = requestAnimationFrame(() => {
      const bounds = accessVisual.getBoundingClientRect();
      const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
      const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
      accessVisual.style.setProperty("--pointer-x", `${(horizontal * 10).toFixed(2)}deg`);
      accessVisual.style.setProperty("--pointer-y", `${(vertical * -8).toFixed(2)}deg`);
    });
  });

  accessVisual.addEventListener("pointerleave", () => {
    cancelAnimationFrame(pointerFrame);
    accessVisual.style.setProperty("--pointer-x", "0deg");
    accessVisual.style.setProperty("--pointer-y", "0deg");
  });
}

function setLoading(isLoading) {
  scanButton.disabled = isLoading;
  scanButton.classList.toggle("is-loading", isLoading);
  scanButton.querySelector(".button-label").textContent = isLoading ? "Scanning…" : "Scan website";
  progress.hidden = !isLoading;
  if (isLoading) {
    progressMessage.textContent = "Scanning, this can take up to a minute.";
    formError.hidden = true;
    formError.textContent = "";
  }
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderSummary(summary) {
  const values = {
    total: summary.violations,
    priority: summary.critical + summary.serious,
    passes: summary.passes,
    incomplete: summary.incomplete,
  };
  for (const [name, value] of Object.entries(values)) {
    const metric = metrics[name];
    metric.textContent = value;
    metric.classList.remove("metric-updated");
    void metric.offsetWidth;
    metric.classList.add("metric-updated");
  }
  document.querySelector("#issue-count").textContent =
    `${summary.violations} ${summary.violations === 1 ? "issue" : "issues"}`;
}

function makeHelpLink(violation) {
  const link = makeElement("a", "issue-help");
  let helpUrl;
  try {
    helpUrl = new URL(violation.helpUrl);
  } catch {
    return null;
  }
  if (helpUrl.protocol !== "https:" && helpUrl.protocol !== "http:") return null;
  link.href = helpUrl.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.append(document.createTextNode("Read rule guidance"));
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M6 3h7v7m0-7L6.5 9.5M11 9v4H3V5h4");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.4");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  icon.append(path);
  link.append(icon);
  return link;
}

function renderViolation(violation) {
  const guidance = plainLanguage[violation.id];
  const card = makeElement("article", "issue-card");
  const header = makeElement("div", "issue-card-header");
  const heading = makeElement("div", "issue-heading");
  heading.append(
    makeElement(
      "h4",
      "issue-title",
      guidance?.title || "This part of the page may be difficult for some people to use",
    ),
  );
  const impactLabel = friendlyImpact[violation.impact] || friendlyImpact.unknown;
  header.append(heading, makeElement("span", `severity-badge severity-${violation.impact}`, impactLabel));
  card.append(
    header,
    makeElement(
      "p",
      "issue-description",
      guidance?.description || "An automatic check found a possible barrier. A website specialist can help review this item.",
    ),
  );

  const fix = makeElement("div", "plain-fix");
  fix.append(
    makeElement("strong", "", "What to do"),
    makeElement(
      "p",
      "",
      guidance?.fix || "Ask a website developer or accessibility specialist to review this item.",
    ),
  );
  card.append(fix);
  const nodeCount = violation.nodes.length;
  if (nodeCount) {
    card.append(
      makeElement(
        "p",
        "affected-count",
        `Found in ${nodeCount} ${nodeCount === 1 ? "place" : "places"} on this page.`,
      ),
    );
  }

  const technical = makeElement("details", "technical-details");
  technical.append(makeElement("summary", "", "Show technical details (optional)"));
  technical.append(makeElement("p", "technical-rule", `Check name: ${violation.id}`));
  for (const [nodeIndex, node] of violation.nodes.entries()) {
    const nodeCard = makeElement("section", "node-card");
    nodeCard.style.setProperty("--item-index", Math.min(nodeIndex, 8));
    nodeCard.append(makeElement("p", "technical-label", `Affected item ${nodeIndex + 1}`));
    const selector = makeElement("p", "node-selector");
    selector.append(document.createTextNode("Page location: "));
    selector.append(makeElement("code", "", node.target.join(", ") || "Not provided"));
    nodeCard.append(selector);

    if (node.html) nodeCard.append(makeElement("code", "node-html", node.html));
    if (node.failureSummary) {
      nodeCard.append(makeElement("p", "node-fix", node.failureSummary));
    }
    if (node.suggestions.length) {
      const suggestions = makeElement("ul", "suggestion-list");
      for (const suggestion of node.suggestions) {
        suggestions.append(makeElement("li", "", suggestion));
      }
      const suggestionBlock = makeElement("div", "node-suggestion");
      suggestionBlock.append(makeElement("strong", "", "More suggestions"));
      suggestionBlock.append(suggestions);
      nodeCard.append(suggestionBlock);
    }
    technical.append(nodeCard);
  }
  const helpLink = makeHelpLink(violation);
  if (helpLink) {
    helpLink.firstChild.textContent = "Open the full accessibility guide";
    technical.append(helpLink);
  }
  card.append(technical);
  return card;
}

function renderViolations() {
  issueList.replaceChildren();
  const selectedSeverity = severityFilter.value;
  const visibleViolations = currentViolations.filter(
    (violation) => selectedSeverity === "all" || violation.impact === selectedSeverity,
  );

  if (!visibleViolations.length) {
    const state = emptyState.cloneNode(true);
    state.id = "filtered-empty-state";
    state.classList.add("is-success");
    state.querySelector("h4").textContent =
      currentViolations.length && selectedSeverity !== "all"
        ? "No issues at this severity"
        : "No accessibility violations found";
    state.querySelector("p").textContent =
      currentViolations.length && selectedSeverity !== "all"
        ? "Try another severity filter to see the other findings."
        : "Great news! The automatic checks did not find any issues. A person should still try the site with a keyboard and screen reader.";
    issueList.append(state);
    return;
  }

  for (const [issueIndex, violation] of visibleViolations.entries()) {
    const card = renderViolation(violation);
    card.style.setProperty("--item-index", Math.min(issueIndex, 8));
    issueList.append(card);
  }
}

function renderReport(report) {
  renderSummary(report.summary);
  currentViolations = report.violations;
  severityFilter.disabled = false;
  severityFilter.value = "all";
  document.querySelector("#scanned-url").textContent = report.title
    ? `${report.title} · ${report.url}`
    : report.url;
  document.querySelector("#scan-site").hidden = false;
  emptyState.remove();
  renderViolations();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  setLoading(true);
  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlInput.value }),
    });
    const responseText = await response.text();
    let body = null;
    if (responseText) {
      try {
        body = JSON.parse(responseText);
      } catch {
        if (response.ok) {
          throw new Error("The scan server returned an invalid response. Please try again.");
        }
      }
    }
    if (!response.ok) {
      const message = typeof body?.error === "string"
        ? body.error
        : `The scan server returned HTTP ${response.status} without an error message. It may have timed out or restarted during the scan. Try again or scan a simpler public page.`;
      throw new Error(message);
    }
    if (!body || typeof body !== "object") {
      throw new Error("The scan server returned an empty response. Please try again.");
    }
    renderReport(body);
  } catch (error) {
    showError(error instanceof Error ? error.message : "The scan could not be completed.");
  } finally {
    setLoading(false);
  }
});

severityFilter.addEventListener("change", renderViolations);

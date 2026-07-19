/**
 * Renders the Projects grid.
 *
 * Firestore is the single source of truth — there is no static fallback
 * data. If Firebase isn't configured, the request fails, or the
 * "projects" collection is empty, the grid shows a clear "no projects
 * yet" message instead of any hardcoded/sample content.
 */
(function () {
  const grid = document.getElementById("projects-grid");
  if (!grid) return;

  // Same escaping approach as admin/admin.js — project data ultimately
  // comes from Firestore, and raw interpolation into innerHTML would let a
  // stray "<", ">", or '"' in a title/description/tag break the markup or
  // corrupt an attribute (e.g. src/href) instead of just displaying as text.
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str ?? "").replace(/"/g, "&quot;");
  }

  function renderEmptyState(message) {
    grid.innerHTML = `
      <div class="projects-empty">
        <i class="fas fa-folder-open"></i>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  function renderProjects(projects) {
    if (!projects || projects.length === 0) {
      renderEmptyState("No projects published yet — check back soon.");
      return;
    }

    const sorted = [...projects].sort(
      (a, b) => (a.order ?? 999) - (b.order ?? 999)
    );

    grid.innerHTML = sorted
      .map(
        (p) => `
      <div class="project-card">
        <div class="project-image">
          <img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.title)}" loading="lazy" />
          <div class="project-overlay">
            <a href="${escapeAttr(p.link)}" class="project-link" target="_blank" rel="noopener">View Details</a>
          </div>
        </div>
        <div class="project-info">
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.description)}</p>
          <div class="project-tags">
            ${(p.tags || [])
              .slice(0, 5)
              .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
              .join("")}
          </div>
        </div>
      </div>
    `
      )
      .join("");
  }

  // If Firebase isn't loaded/configured on this page, there's nothing to
  // show — the developer hasn't set up Firestore yet.
  if (
    typeof firebase === "undefined" ||
    typeof FIREBASE_CONFIG === "undefined" ||
    FIREBASE_CONFIG.apiKey === "YOUR_API_KEY"
  ) {
    renderEmptyState("No projects published yet — check back soon.");
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    const db = firebase.firestore();

    db.collection("projects")
      .get()
      .then((snapshot) => {
        if (snapshot.empty) {
          renderEmptyState("No projects published yet — check back soon.");
          return;
        }
        const projects = snapshot.docs.map((doc) => doc.data());
        renderProjects(projects);
      })
      .catch((err) => {
        console.warn("Failed to load projects from Firestore:", err);
        renderEmptyState("Couldn't load projects right now — please try again later.");
      });
  } catch (err) {
    console.warn("Failed to load projects from Firestore:", err);
    renderEmptyState("Couldn't load projects right now — please try again later.");
  }
})();

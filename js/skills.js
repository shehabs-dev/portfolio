/**
 * Renders the Skills section (Main + Additional groups) from Firestore.
 *
 * Firestore is the single source of truth, same as js/projects.js — no
 * hardcoded skill list. Skills live in the "skills" collection; each
 * document has: { name, icon (Cloudinary URL), group: "main"|"additional",
 * order }.
 *
 * If Firebase isn't configured, the request fails, or a group has no
 * skills yet, that group's grid shows a small "no skills added yet"
 * note instead of anything hardcoded.
 */
(function () {
  const mainGrid = document.getElementById("skills-main-grid");
  const additionalGrid = document.getElementById("skills-additional-grid");
  if (!mainGrid || !additionalGrid) return;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str ?? "").replace(/"/g, "&quot;");
  }

  function renderEmpty(grid, message) {
    grid.innerHTML = `<p class="skills-empty">${escapeHtml(message)}</p>`;
  }

  function renderGroup(grid, skills, emptyMessage) {
    if (!skills || skills.length === 0) {
      renderEmpty(grid, emptyMessage);
      return;
    }
    const sorted = [...skills].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    grid.innerHTML = sorted
      .map(
        (s) => `
      <div class="skill-item">
        <img class="skill" src="${escapeAttr(s.icon)}" alt="${escapeAttr(s.name)}" loading="lazy" />
        <p class="skill-name">${escapeHtml(s.name)}</p>
      </div>
    `
      )
      .join("");

    // js/main.js sets up its scroll fade-in observer on DOMContentLoaded,
    // which fires before this async Firestore render completes — so the
    // ".skill" icons it finds at that point don't exist yet. Re-apply the
    // same fade-in treatment here, now that the icons are actually in the
    // DOM, so the effect still works instead of silently no-oping.
    const newSkillEls = grid.querySelectorAll(".skill");
    if (window.IntersectionObserver) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.style.opacity = "1";
              entry.target.style.transform = "translateY(0)";
            }
          });
        },
        { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
      );
      newSkillEls.forEach((el) => {
        el.style.opacity = "0";
        el.style.transform = "translateY(20px)";
        el.style.transition = "all 0.5s ease";
        observer.observe(el);
      });
    }
  }

  function renderAll(skills) {
    const main = skills.filter((s) => s.group === "main");
    const additional = skills.filter((s) => s.group === "additional");
    renderGroup(mainGrid, main, "No main skills added yet.");
    renderGroup(additionalGrid, additional, "No additional skills added yet.");
  }

  if (
    typeof firebase === "undefined" ||
    typeof FIREBASE_CONFIG === "undefined" ||
    FIREBASE_CONFIG.apiKey === "YOUR_API_KEY"
  ) {
    renderEmpty(mainGrid, "No main skills added yet.");
    renderEmpty(additionalGrid, "No additional skills added yet.");
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    const db = firebase.firestore();

    db.collection("skills")
      .get()
      .then((snapshot) => {
        if (snapshot.empty) {
          renderEmpty(mainGrid, "No main skills added yet.");
          renderEmpty(additionalGrid, "No additional skills added yet.");
          return;
        }
        const skills = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderAll(skills);
      })
      .catch((err) => {
        console.warn("Failed to load skills from Firestore:", err);
        renderEmpty(mainGrid, "Couldn't load skills right now.");
        renderEmpty(additionalGrid, "Couldn't load skills right now.");
      });
  } catch (err) {
    console.warn("Failed to load skills from Firestore:", err);
    renderEmpty(mainGrid, "Couldn't load skills right now.");
    renderEmpty(additionalGrid, "Couldn't load skills right now.");
  }
})();

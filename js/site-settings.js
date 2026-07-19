/**
 * Loads hero title, description, and image from Firestore
 * (settings/hero) and overwrites the hardcoded HTML if present.
 *
 * Same safe pattern as js/projects.js: if Firebase isn't configured,
 * or the document doesn't exist yet, or the request fails for any
 * reason, this does nothing at all. The hardcoded text and image
 * already in index.html act as the fallback, so the hero section is
 * never blank.
 */
(function () {
  const titleEl = document.getElementById("hero-title");
  const descEl = document.getElementById("hero-description");
  const imgEl = document.getElementById("hero-image");
  if (!titleEl || !descEl || !imgEl) return;

  if (
    typeof firebase === "undefined" ||
    typeof FIREBASE_CONFIG === "undefined" ||
    FIREBASE_CONFIG.apiKey === "YOUR_API_KEY"
  ) {
    return; // Not configured yet — keep the hardcoded hero as-is.
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    const db = firebase.firestore();

    db.collection("settings")
      .doc("hero")
      .get()
      .then((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        if (data.title) titleEl.textContent = data.title;
        if (data.description) descEl.textContent = data.description;
        if (data.image) imgEl.src = data.image;
      })
      .catch((err) => {
        console.warn("Keeping hardcoded hero content:", err);
      });
  } catch (err) {
    console.warn("Keeping hardcoded hero content:", err);
  }
})();

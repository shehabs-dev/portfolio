/**
 * Admin panel logic: sign in, and add/edit/delete/reorder projects in
 * Firestore, with image uploads handled by Cloudinary (unsigned upload).
 *
 * This page is not linked from anywhere on the public site and isn't
 * indexed by search engines (see the <meta name="robots"> tag), but it
 * is still reachable by anyone who knows the URL. The real protection is
 * Firestore Security Rules (see /firestore.rules) — only a signed-in
 * user can write to the "projects" collection. Reads stay public so the
 * homepage can display projects without logging in.
 */

if (
  typeof FIREBASE_CONFIG === "undefined" ||
  FIREBASE_CONFIG.apiKey === "YOUR_API_KEY"
) {
  document.body.innerHTML =
    '<div class="admin-panel"><div class="admin-card">' +
    "<h1>Firebase not configured yet</h1>" +
    "<p class=\"admin-sub\">Fill in js/firebase-config.js with your real Firebase project values first. See admin/README.md for step-by-step setup.</p>" +
    "</div></div>";
  throw new Error("Firebase not configured");
}

// ---------- Cloudinary config ----------
// Unsigned upload: safe to keep these values in client-side code. Access
// control for what gets uploaded lives in the preset's settings on
// Cloudinary's side (folder, formats, size limits), not in this file.
const CLOUDINARY_CLOUD_NAME = "dlhyyfozv";
const CLOUDINARY_UPLOAD_PRESET = "projects_images";
const CLOUDINARY_FOLDER = "portfolio/projects_images";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_TAGS = 5;
const TARGET_RATIO = 16 / 10; // matches .project-image on the live site
const RATIO_TOLERANCE = 0.03; // ~3% wiggle room before we call it a mismatch

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------- Element refs ----------
const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const statCount = document.getElementById("stat-count");

const projectForm = document.getElementById("project-form");
const formTitle = document.getElementById("form-title");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const projectsList = document.getElementById("projects-list");
const searchInput = document.getElementById("search-input");

const descInput = document.getElementById("description");
const descCounter = document.getElementById("desc-counter");

const dropzone = document.getElementById("dropzone");
const dropzoneIdle = document.getElementById("dropzone-idle");
const dropzoneProgress = document.getElementById("dropzone-progress");
const dropzoneProgressText = document.getElementById("dropzone-progress-text");
const dropzoneError = document.getElementById("dropzone-error");
const imageFileInput = document.getElementById("image-file-input");
const imagePreview = document.getElementById("image-preview");
const imagePreviewImg = document.getElementById("image-preview-img");
const imageRemoveBtn = document.getElementById("image-remove-btn");
const imageFitBadge = document.getElementById("image-fit-badge");
const toggleUrlModeBtn = document.getElementById("toggle-url-mode-btn");
const imageUrlWrap = document.getElementById("image-url-wrap");
const imageUrlInput = document.getElementById("image-url-input");

const tagInputWrap = document.getElementById("tag-input-wrap");
const tagChipsEl = document.getElementById("tag-chips");
const tagInput = document.getElementById("tag-input");

const confirmModal = document.getElementById("confirm-modal");
const confirmModalText = document.getElementById("confirm-modal-text");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");

const toastContainer = document.getElementById("toast-container");

const fields = {
  id: document.getElementById("project-id"),
  title: document.getElementById("title"),
  description: descInput,
  image: document.getElementById("image"), // hidden input holding the final image URL
  link: document.getElementById("link"),
};

// ---------- State ----------
let currentTags = [];
let allProjects = []; // cache of the last loaded snapshot, for search + reorder + preview
let pendingDeleteId = null;
let authResolved = false;

// Hide both views until Firebase tells us whether we're signed in, so a
// still-logged-in user doesn't see a flash of the login page on every
// navigation between admin pages while the session check is in flight.
loginView.style.display = "none";
dashboardView.style.display = "none";

// ============================================================
// Toasts
// ============================================================
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = "toast" + (type === "error" ? " toast--error" : "");
  const icon = type === "error" ? "fa-circle-exclamation" : "fa-circle-check";
  toast.innerHTML = `<i class="fas ${icon}"></i><span></span>`;
  toast.querySelector("span").textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = "opacity 0.2s ease";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// ============================================================
// Auth
// ============================================================
auth.onAuthStateChanged((user) => {
  authResolved = true;
  if (user) {
    loginView.style.display = "none";
    dashboardView.style.display = "block";
    loadProjects();
  } else {
    // Clear the inline style (don't set "block") so the CSS rule
    // .admin-panel--centered { display: flex; ... } takes over again —
    // otherwise an inline display:block beats it and the card loses
    // its centering, collapsing to the top-left.
    loginView.style.display = "";
    dashboardView.style.display = "none";
  }
});

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  auth.signInWithEmailAndPassword(email, password).catch((err) => {
    loginError.textContent = "Sign-in failed: " + err.message;
  });
});

logoutBtn.addEventListener("click", () => auth.signOut());

// ============================================================
// Load + render project list
// ============================================================
function loadProjects() {
  projectsList.innerHTML = '<p class="admin-hint">Loading…</p>';

  db.collection("projects")
    .orderBy("order")
    .get()
    .then((snapshot) => {
      allProjects = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      statCount.textContent = String(allProjects.length);
      renderProjectsList(allProjects);
    })
    .catch((err) => {
      projectsList.innerHTML =
        '<p class="admin-error">Failed to load projects: ' + escapeHtml(err.message) + "</p>";
    });
}

function renderProjectsList(projects) {
  if (projects.length === 0) {
    projectsList.innerHTML =
      '<div class="empty-state"><i class="fas fa-layer-group"></i><p>No projects yet. Add your first one on the left.</p></div>';
    return;
  }

  projectsList.innerHTML = "";
  projects.forEach((p, index) => {
    const row = document.createElement("div");
    row.className = "admin-project-row";
    row.innerHTML = `
      <img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.title)}" onerror="this.style.opacity=0" />
      <div class="apr-info">
        <h4>${escapeHtml(p.title)}</h4>
        <p>${escapeHtml(p.description)}</p>
      </div>
      <div class="apr-order">
        <button type="button" data-action="move-up" title="Move up" ${index === 0 ? "disabled" : ""}>
          <i class="fas fa-chevron-up"></i>
        </button>
        <button type="button" data-action="move-down" title="Move down" ${index === projects.length - 1 ? "disabled" : ""}>
          <i class="fas fa-chevron-down"></i>
        </button>
      </div>
      <div class="apr-actions">
        <button type="button" data-action="edit">Edit</button>
        <button type="button" data-action="delete" class="danger">Delete</button>
      </div>
    `;
    row.querySelector('[data-action="edit"]').addEventListener("click", () => startEdit(p));
    row.querySelector('[data-action="delete"]').addEventListener("click", () => openDeleteModal(p.id, p.title));
    row.querySelector('[data-action="move-up"]').addEventListener("click", () => moveProject(p.id, -1));
    row.querySelector('[data-action="move-down"]').addEventListener("click", () => moveProject(p.id, 1));
    projectsList.appendChild(row);
  });
}

// ---------- Search filter (client-side, over the cached list) ----------
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderProjectsList(allProjects);
    return;
  }
  const filtered = allProjects.filter((p) => {
    const haystack = [p.title, p.description, ...(p.tags || [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
  renderProjectsList(filtered);
});

// ---------- Reordering ----------
// Swaps the "order" value with the adjacent project and writes both back.
function moveProject(id, direction) {
  const index = allProjects.findIndex((p) => p.id === id);
  const swapIndex = index + direction;
  if (index === -1 || swapIndex < 0 || swapIndex >= allProjects.length) return;

  const a = allProjects[index];
  const b = allProjects[swapIndex];
  const aOrder = a.order ?? index + 1;
  const bOrder = b.order ?? swapIndex + 1;

  const batch = db.batch();
  batch.update(db.collection("projects").doc(a.id), { order: bOrder });
  batch.update(db.collection("projects").doc(b.id), { order: aOrder });

  batch
    .commit()
    .then(() => {
      loadProjects();
    })
    .catch((err) => {
      showToast("Failed to reorder: " + err.message, "error");
    });
}

// ============================================================
// Description char counter
// ============================================================
descInput.addEventListener("input", () => {
  const len = descInput.value.length;
  descCounter.textContent = `${len} / 140`;
  descCounter.classList.toggle("char-counter--warn", len > 140);
});

// ============================================================
// Tag chips
// ============================================================
function renderTagChips() {
  tagChipsEl.innerHTML = "";
  currentTags.forEach((tag, i) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.innerHTML = `<span></span><button type="button" aria-label="Remove tag">&times;</button>`;
    chip.querySelector("span").textContent = tag;
    chip.querySelector("button").addEventListener("click", () => {
      currentTags.splice(i, 1);
      renderTagChips();
    });
    tagChipsEl.appendChild(chip);
  });
}

function addTagFromInput() {
  const raw = tagInput.value.trim().replace(/,+$/, "");
  if (!raw) return;
  if (currentTags.length >= MAX_TAGS) {
    showToast(`Max ${MAX_TAGS} tags per project.`, "error");
    tagInput.value = "";
    return;
  }
  if (!currentTags.some((t) => t.toLowerCase() === raw.toLowerCase())) {
    currentTags.push(raw);
    renderTagChips();
  }
  tagInput.value = "";
}

tagInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addTagFromInput();
  } else if (e.key === "Backspace" && tagInput.value === "" && currentTags.length > 0) {
    currentTags.pop();
    renderTagChips();
  }
});

tagInput.addEventListener("blur", addTagFromInput);

tagInputWrap.addEventListener("click", () => tagInput.focus());

// ============================================================
// Image upload (Cloudinary) + drag & drop
// ============================================================
let usingUrlMode = false;

function setDropzoneState(state) {
  // state: "idle" | "uploading" | "preview"
  dropzoneIdle.style.display = state === "idle" ? "flex" : "none";
  dropzoneProgress.style.display = state === "uploading" ? "flex" : "none";
  imagePreview.style.display = state === "preview" ? "flex" : "none";
  dropzone.classList.toggle("dropzone--has-image", state === "preview");
}

function resetImageField() {
  fields.image.value = "";
  imagePreviewImg.src = "";
  setDropzoneState("idle");
  dropzoneError.style.display = "none";
  imageFitBadge.style.display = "none";
}

// Reads the real pixel dimensions of whatever image is now showing in the
// preview and tells the user whether it matches the live card's 16:10
// shape, so they can catch a bad crop before publishing.
function checkImageFit() {
  const img = imagePreviewImg;
  if (!img.naturalWidth || !img.naturalHeight) {
    imageFitBadge.style.display = "none";
    return;
  }

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const ratio = w / h;
  const isGoodFit = Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO <= RATIO_TOLERANCE;

  imageFitBadge.style.display = "flex";
  imageFitBadge.classList.toggle("fit-good", isGoodFit);
  imageFitBadge.classList.toggle("fit-warn", !isGoodFit);

  if (isGoodFit) {
    imageFitBadge.innerHTML = `<i class="fas fa-circle-check"></i> ${w}×${h}px — fits the card perfectly, no letterboxing`;
  } else {
    const suggested = ratio > TARGET_RATIO
      ? `crop to ${Math.round(h * TARGET_RATIO)}×${h}px`
      : `crop to ${w}×${Math.round(w / TARGET_RATIO)}px`;
    imageFitBadge.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${w}×${h}px — doesn't match the card's 16:10 shape, will show empty bars (try ${suggested}, or ~800×500)`;
  }
}

// Sets the preview image and reliably triggers the fit check, even if the
// browser has this exact URL cached and wouldn't otherwise refire "load".
function setPreviewImage(url) {
  imagePreviewImg.src = url;
  if (imagePreviewImg.complete) {
    checkImageFit();
  }
}

imagePreviewImg.addEventListener("load", checkImageFit);

dropzone.addEventListener("click", (e) => {
  if (e.target.closest("#image-remove-btn")) return;
  if (dropzone.classList.contains("dropzone--has-image")) return;
  imageFileInput.click();
});

dropzone.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && !dropzone.classList.contains("dropzone--has-image")) {
    e.preventDefault();
    imageFileInput.click();
  }
});

imageFileInput.addEventListener("change", () => {
  const file = imageFileInput.files[0];
  if (file) uploadImage(file);
});

["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dropzone.classList.contains("dropzone--has-image")) {
      dropzone.classList.add("dropzone--dragover");
    }
  });
});

["dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dropzone--dragover");
  });
});

dropzone.addEventListener("drop", (e) => {
  if (dropzone.classList.contains("dropzone--has-image")) return;
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) uploadImage(file);
});

imageRemoveBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  resetImageField();
  imageFileInput.value = "";
});

function uploadImage(file) {
  dropzoneError.style.display = "none";

  if (!file.type.startsWith("image/")) {
    dropzoneError.textContent = "That file isn't an image.";
    dropzoneError.style.display = "block";
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    dropzoneError.textContent = "Image is too large — please keep it under 8MB.";
    dropzoneError.style.display = "block";
    return;
  }

  setDropzoneState("uploading");
  dropzoneProgressText.textContent = "Uploading…";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", CLOUDINARY_FOLDER);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", CLOUDINARY_UPLOAD_URL);

  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      dropzoneProgressText.textContent = `Uploading… ${pct}%`;
    }
  });

  xhr.onload = () => {
    let response;
    try {
      response = JSON.parse(xhr.responseText);
    } catch (_err) {
      response = null;
    }

    if (xhr.status >= 200 && xhr.status < 300 && response && response.secure_url) {
      fields.image.value = response.secure_url;
      setPreviewImage(response.secure_url);
      setDropzoneState("preview");
      showToast("Image uploaded.");
    } else {
      const message =
        (response && response.error && response.error.message) ||
        "Upload failed. Check your Cloudinary preset settings.";
      dropzoneError.textContent = message;
      dropzoneError.style.display = "block";
      setDropzoneState("idle");
      showToast("Image upload failed.", "error");
    }
  };

  xhr.onerror = () => {
    dropzoneError.textContent = "Upload failed — check your connection and try again.";
    dropzoneError.style.display = "block";
    setDropzoneState("idle");
    showToast("Image upload failed.", "error");
  };

  xhr.send(formData);
}

// ---------- URL fallback mode ----------
toggleUrlModeBtn.addEventListener("click", () => {
  usingUrlMode = !usingUrlMode;
  imageUrlWrap.style.display = usingUrlMode ? "block" : "none";
  toggleUrlModeBtn.innerHTML = usingUrlMode
    ? '<i class="fas fa-xmark"></i> Cancel, upload a file instead'
    : '<i class="fas fa-link"></i> Paste an image URL instead';
  if (usingUrlMode) {
    imageUrlInput.focus();
  }
});

imageUrlInput.addEventListener("input", () => {
  const url = imageUrlInput.value.trim();
  fields.image.value = url;
  if (url) {
    setPreviewImage(url);
    setDropzoneState("preview");
  } else {
    setDropzoneState("idle");
    imageFitBadge.style.display = "none";
  }
});

// ============================================================
// Add / Update
// ============================================================
projectForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (!fields.image.value.trim()) {
    showToast("Please add an image before saving.", "error");
    return;
  }

  const id = fields.id.value;
  const isNew = !id;

  const data = {
    title: fields.title.value.trim(),
    description: fields.description.value.trim(),
    image: fields.image.value.trim(),
    tags: currentTags.slice(0, MAX_TAGS),
    link: fields.link.value.trim(),
  };

  const submitBtn = projectForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  let save;
  if (isNew) {
    // New projects go to the end of the list.
    const nextOrder =
      allProjects.reduce((max, p) => Math.max(max, p.order ?? 0), 0) + 1;
    save = db.collection("projects").add({ ...data, order: nextOrder });
  } else {
    save = db.collection("projects").doc(id).update(data);
  }

  save
    .then(() => {
      showToast(isNew ? "Project added." : "Project updated.");
      resetForm();
      loadProjects();
    })
    .catch((err) => {
      showToast("Error: " + err.message, "error");
    })
    .finally(() => {
      submitBtn.disabled = false;
    });
});

function startEdit(p) {
  fields.id.value = p.id;
  fields.title.value = p.title || "";
  fields.description.value = p.description || "";
  fields.link.value = p.link || "";

  descInput.dispatchEvent(new Event("input"));

  currentTags = (p.tags || []).slice(0, MAX_TAGS);
  renderTagChips();

  fields.image.value = p.image || "";
  if (p.image) {
    setPreviewImage(p.image);
    setDropzoneState("preview");
  } else {
    setDropzoneState("idle");
  }
  usingUrlMode = false;
  imageUrlWrap.style.display = "none";
  imageUrlInput.value = "";
  toggleUrlModeBtn.innerHTML = '<i class="fas fa-link"></i> Paste an image URL instead';

  formTitle.innerHTML = '<i class="fas fa-pen"></i> Edit Project';
  cancelEditBtn.style.display = "inline-flex";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

cancelEditBtn.addEventListener("click", resetForm);

function resetForm() {
  projectForm.reset();
  fields.id.value = "";
  currentTags = [];
  renderTagChips();
  resetImageField();
  imageFileInput.value = "";
  usingUrlMode = false;
  imageUrlWrap.style.display = "none";
  imageUrlInput.value = "";
  toggleUrlModeBtn.innerHTML = '<i class="fas fa-link"></i> Paste an image URL instead';
  descCounter.textContent = "0 / 140";
  descCounter.classList.remove("char-counter--warn");
  formTitle.innerHTML = '<i class="fas fa-plus"></i> Add a Project';
  cancelEditBtn.style.display = "none";
}

// ============================================================
// Delete (with confirmation modal)
// ============================================================
function openDeleteModal(id, title) {
  pendingDeleteId = id;
  confirmModalText.textContent = `Delete "${title}"? This can't be undone.`;
  confirmModal.style.display = "flex";
}

function closeDeleteModal() {
  pendingDeleteId = null;
  confirmModal.style.display = "none";
}

confirmCancelBtn.addEventListener("click", closeDeleteModal);

confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeDeleteModal();
});

confirmDeleteBtn.addEventListener("click", () => {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  confirmDeleteBtn.disabled = true;

  // Note: this only removes the Firestore document. The image itself
  // stays in Cloudinary — deleting it requires your Cloudinary API
  // secret, which can't safely live in this browser-side file. The
  // orphaned file is harmless and free at this scale; if you ever want
  // automatic cleanup, that needs a small server-side function (e.g. a
  // Cloud Function) that holds the secret instead.
  db.collection("projects")
    .doc(id)
    .delete()
    .then(() => {
      showToast("Project deleted.");
      closeDeleteModal();
      loadProjects();
    })
    .catch((err) => {
      showToast("Failed to delete: " + err.message, "error");
    })
    .finally(() => {
      confirmDeleteBtn.disabled = false;
    });
});

// ============================================================
// Utilities
// ============================================================
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str ?? "").replace(/"/g, "&quot;");
}

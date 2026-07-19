/**
 * Site Content admin page: sign in, then edit the hero title,
 * description, and image stored in Firestore at settings/hero.
 *
 * Image uploads reuse the same Cloudinary account and unsigned preset
 * as the Projects page (see admin.js) rather than Firebase Storage, to
 * avoid moving onto Firebase's pay-as-you-go tier. Uploads land in the
 * same Cloudinary account under a separate folder so they don't mix
 * with project images in your media library.
 *
 * This page is not linked from the public site and isn't indexed (see
 * the <meta name="robots"> tag), but the real protection is Firestore
 * Security Rules (see /firestore.rules) — only a signed-in user can
 * write to "settings". Reads stay public so the homepage can display
 * hero content without logging in.
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

// ---------- Cloudinary config (same account as Projects, separate folder) ----------
const CLOUDINARY_CLOUD_NAME = "dlhyyfozv";
const CLOUDINARY_UPLOAD_PRESET = "projects_images";
const CLOUDINARY_FOLDER = "portfolio/hero_images";
const CLOUDINARY_SKILLS_FOLDER = "portfolio/skill_icons";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_ICON_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB
const TARGET_RATIO = 1500 / 1310;
const RATIO_TOLERANCE = 0.03;

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------- Element refs ----------
const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const statUpdated = document.getElementById("stat-updated");
const toastContainer = document.getElementById("toast-container");

const heroForm = document.getElementById("hero-form");
const titleInput = document.getElementById("hero-title-input");
const descInput = document.getElementById("hero-description-input");
const descCounter = document.getElementById("hero-desc-counter");
const heroImageField = document.getElementById("hero-image");

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
const imageUrlInput = document.getElementById("hero-image-url-input");

// Hide both views until Firebase tells us whether we're signed in, so a
// still-logged-in user doesn't see a flash of the login page on every
// navigation between admin pages while the session check is in flight.
loginView.style.display = "none";
dashboardView.style.display = "none";

// ============================================================
// Toasts (identical pattern to admin.js)
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
  if (user) {
    loginView.style.display = "none";
    dashboardView.style.display = "block";
    loadSettings();
    loadSkills();
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
// Load current hero settings
// ============================================================
function loadSettings() {
  db.collection("settings")
    .doc("hero")
    .get()
    .then((doc) => {
      if (!doc.exists) {
        statUpdated.textContent = "Not saved yet";
        return;
      }
      const data = doc.data();
      titleInput.value = data.title || "";
      descInput.value = data.description || "";
      heroImageField.value = data.image || "";
      updateDescCounter();

      if (data.image) {
        setPreviewImage(data.image);
        setDropzoneState("preview");
      }

      if (data.updatedAt && data.updatedAt.toDate) {
        statUpdated.textContent =
          "Updated " + data.updatedAt.toDate().toLocaleDateString();
      } else {
        statUpdated.textContent = "Saved";
      }
    })
    .catch((err) => {
      showToast("Failed to load current settings: " + err.message, "error");
    });
}

// ============================================================
// Char counter
// ============================================================
function updateDescCounter() {
  const len = descInput.value.length;
  descCounter.textContent = `${len} / 160`;
  descCounter.classList.toggle("char-counter--warn", len > 160);
}

descInput.addEventListener("input", updateDescCounter);

// ============================================================
// Image upload (Cloudinary) + drag & drop
// identical mechanics to admin.js, scoped to the hero image field
// ============================================================
let usingUrlMode = false;

function setDropzoneState(state) {
  dropzoneIdle.style.display = state === "idle" ? "flex" : "none";
  dropzoneProgress.style.display = state === "uploading" ? "flex" : "none";
  imagePreview.style.display = state === "preview" ? "flex" : "none";
  dropzone.classList.toggle("dropzone--has-image", state === "preview");
}

function resetImageField() {
  heroImageField.value = "";
  imagePreviewImg.src = "";
  setDropzoneState("idle");
  dropzoneError.style.display = "none";
  imageFitBadge.style.display = "none";
}

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
    imageFitBadge.innerHTML = `<i class="fas fa-circle-check"></i> ${w}×${h}px — sharp on modern screens`;
  } else if (w < 1000 || h < 875) {
    imageFitBadge.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${w}×${h}px is on the small side — aim for at least 1000×875, ideally 1500×1310`;
  } else {
    imageFitBadge.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${w}×${h}px doesn't quite match the hero shape, but resolution looks fine`;
  }
}

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
      heroImageField.value = response.secure_url;
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
  heroImageField.value = url;
  if (url) {
    setPreviewImage(url);
    setDropzoneState("preview");
  } else {
    setDropzoneState("idle");
    imageFitBadge.style.display = "none";
  }
});

// ============================================================
// Save
// ============================================================
heroForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const data = {
    title: titleInput.value.trim(),
    description: descInput.value.trim(),
    image: heroImageField.value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (!data.image) {
    showToast("Please add a hero image before saving.", "error");
    return;
  }

  db.collection("settings")
    .doc("hero")
    .set(data, { merge: true })
    .then(() => {
      showToast("Hero section updated.");
      statUpdated.textContent = "Updated just now";
    })
    .catch((err) => {
      showToast("Save failed: " + err.message, "error");
    });
});

// ============================================================
// Settings sub-navigation (Hero / Skills panels)
// ============================================================
const subnavBtns = document.querySelectorAll(".settings-subnav-btn");
const heroPanel = document.getElementById("hero-panel");
const skillsPanel = document.getElementById("skills-panel");

subnavBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    subnavBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.target;
    heroPanel.style.display = target === "hero-panel" ? "block" : "none";
    skillsPanel.style.display = target === "skills-panel" ? "block" : "none";
  });
});

// ============================================================
// Skills management: add / edit / delete / reorder, grouped
// into "main" and "additional", stored in Firestore's "skills"
// collection. Icons are uploaded to Cloudinary (same pattern as
// hero/project images) under a separate folder.
// ============================================================
const skillForm = document.getElementById("skill-form");
const skillFormTitle = document.getElementById("skill-form-title");
const skillIdField = document.getElementById("skill-id");
const skillNameField = document.getElementById("skill-name");
const skillGroupField = document.getElementById("skill-group");
const skillIconField = document.getElementById("skill-icon");
const cancelSkillEditBtn = document.getElementById("cancel-skill-edit-btn");

const skillGroupToggle = document.getElementById("skill-group-toggle");
const segmentedBtns = skillGroupToggle.querySelectorAll(".segmented-btn");

const mainSkillsList = document.getElementById("main-skills-list");
const additionalSkillsList = document.getElementById("additional-skills-list");
const mainSkillsCount = document.getElementById("main-skills-count");
const additionalSkillsCount = document.getElementById("additional-skills-count");

const iconDropzone = document.getElementById("icon-dropzone");
const iconDropzoneIdle = document.getElementById("icon-dropzone-idle");
const iconDropzoneProgress = document.getElementById("icon-dropzone-progress");
const iconDropzoneProgressText = document.getElementById("icon-dropzone-progress-text");
const iconDropzoneError = document.getElementById("icon-dropzone-error");
const iconFileInput = document.getElementById("icon-file-input");
const iconPreview = document.getElementById("icon-preview");
const iconPreviewImg = document.getElementById("icon-preview-img");
const iconRemoveBtn = document.getElementById("icon-remove-btn");

const toggleIconUrlModeBtn = document.getElementById("toggle-icon-url-mode-btn");
const iconUrlWrap = document.getElementById("icon-url-wrap");
const iconUrlInput = document.getElementById("skill-icon-url-input");

const confirmSkillModal = document.getElementById("confirm-skill-modal");
const confirmSkillModalText = document.getElementById("confirm-skill-modal-text");
const confirmSkillCancelBtn = document.getElementById("confirm-skill-cancel-btn");
const confirmSkillDeleteBtn = document.getElementById("confirm-skill-delete-btn");

let allSkills = []; // cache of last loaded snapshot, for reorder + list rendering
let pendingDeleteSkillId = null;
let usingIconUrlMode = false;

// ---------- Group segmented control ----------
segmentedBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    segmentedBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    skillGroupField.value = btn.dataset.group;
  });
});

function setSkillGroupUI(group) {
  segmentedBtns.forEach((b) => b.classList.toggle("active", b.dataset.group === group));
  skillGroupField.value = group;
}

// ---------- Load + render ----------
function loadSkills() {
  mainSkillsList.innerHTML = '<p class="admin-hint">Loading…</p>';
  additionalSkillsList.innerHTML = '<p class="admin-hint">Loading…</p>';

  db.collection("skills")
    .orderBy("order")
    .get()
    .then((snapshot) => {
      allSkills = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderSkillsLists();
    })
    .catch((err) => {
      const msg = '<p class="admin-error">Failed to load skills: ' + escapeHtml(err.message) + "</p>";
      mainSkillsList.innerHTML = msg;
      additionalSkillsList.innerHTML = msg;
    });
}

function renderSkillsLists() {
  const main = allSkills.filter((s) => s.group === "main");
  const additional = allSkills.filter((s) => s.group === "additional");

  mainSkillsCount.textContent = `${main.length} skill${main.length === 1 ? "" : "s"}`;
  additionalSkillsCount.textContent = `${additional.length} skill${additional.length === 1 ? "" : "s"}`;

  renderSkillGroup(mainSkillsList, main, "No main skills yet. Add one on the left.");
  renderSkillGroup(additionalSkillsList, additional, "No additional skills yet. Add one on the left.");
}

function renderSkillGroup(container, skills, emptyText) {
  if (skills.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-icons"></i><p>${escapeHtml(emptyText)}</p></div>`;
    return;
  }

  container.innerHTML = "";
  skills.forEach((s, index) => {
    const row = document.createElement("div");
    row.className = "admin-skill-row";
    row.innerHTML = `
      <img src="${escapeAttr(s.icon)}" alt="${escapeAttr(s.name)}" onerror="this.style.opacity=0" />
      <span class="asr-name">${escapeHtml(s.name)}</span>
      <div class="asr-order">
        <button type="button" data-action="move-up" title="Move up" ${index === 0 ? "disabled" : ""}>
          <i class="fas fa-chevron-up"></i>
        </button>
        <button type="button" data-action="move-down" title="Move down" ${index === skills.length - 1 ? "disabled" : ""}>
          <i class="fas fa-chevron-down"></i>
        </button>
      </div>
      <div class="asr-actions">
        <button type="button" data-action="edit" title="Edit"><i class="fas fa-pen"></i></button>
        <button type="button" data-action="delete" class="danger" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    `;
    row.querySelector('[data-action="edit"]').addEventListener("click", () => startSkillEdit(s));
    row.querySelector('[data-action="delete"]').addEventListener("click", () => openSkillDeleteModal(s.id, s.name));
    row.querySelector('[data-action="move-up"]').addEventListener("click", () => moveSkill(s, -1));
    row.querySelector('[data-action="move-down"]').addEventListener("click", () => moveSkill(s, 1));
    container.appendChild(row);
  });
}

// ---------- Reordering (swap order within the same group) ----------
function moveSkill(skill, direction) {
  const groupSkills = allSkills
    .filter((s) => s.group === skill.group)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  const currentIndex = groupSkills.findIndex((s) => s.id === skill.id);
  const swapIndex = currentIndex + direction;
  if (swapIndex < 0 || swapIndex >= groupSkills.length) return;

  const a = groupSkills[currentIndex];
  const b = groupSkills[swapIndex];
  const aOrder = a.order ?? 0;
  const bOrder = b.order ?? 0;

  const batch = db.batch();
  batch.update(db.collection("skills").doc(a.id), { order: bOrder });
  batch.update(db.collection("skills").doc(b.id), { order: aOrder });

  batch
    .commit()
    .then(() => loadSkills())
    .catch((err) => showToast("Failed to reorder: " + err.message, "error"));
}

// ---------- Icon dropzone (drag & drop + click, mirrors hero image dropzone) ----------
function setIconDropzoneState(state) {
  iconDropzoneIdle.style.display = state === "idle" ? "flex" : "none";
  iconDropzoneProgress.style.display = state === "uploading" ? "flex" : "none";
  iconPreview.style.display = state === "preview" ? "flex" : "none";
  iconDropzone.classList.toggle("dropzone--has-image", state === "preview");
}

function resetIconField() {
  skillIconField.value = "";
  iconPreviewImg.src = "";
  setIconDropzoneState("idle");
  iconDropzoneError.style.display = "none";
}

function setIconPreview(url) {
  iconPreviewImg.src = url;
}

iconDropzone.addEventListener("click", (e) => {
  if (e.target.closest("#icon-remove-btn")) return;
  if (iconDropzone.classList.contains("dropzone--has-image")) return;
  iconFileInput.click();
});

iconDropzone.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && !iconDropzone.classList.contains("dropzone--has-image")) {
    e.preventDefault();
    iconFileInput.click();
  }
});

iconFileInput.addEventListener("change", () => {
  const file = iconFileInput.files[0];
  if (file) uploadIcon(file);
});

["dragenter", "dragover"].forEach((evt) => {
  iconDropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!iconDropzone.classList.contains("dropzone--has-image")) {
      iconDropzone.classList.add("dropzone--dragover");
    }
  });
});

["dragleave", "drop"].forEach((evt) => {
  iconDropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    iconDropzone.classList.remove("dropzone--dragover");
  });
});

iconDropzone.addEventListener("drop", (e) => {
  if (iconDropzone.classList.contains("dropzone--has-image")) return;
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) uploadIcon(file);
});

iconRemoveBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  resetIconField();
  iconFileInput.value = "";
});

function uploadIcon(file) {
  iconDropzoneError.style.display = "none";

  if (!file.type.startsWith("image/")) {
    iconDropzoneError.textContent = "That file isn't an image.";
    iconDropzoneError.style.display = "block";
    return;
  }
  if (file.size > MAX_ICON_UPLOAD_BYTES) {
    iconDropzoneError.textContent = "Icon is too large — please keep it under 2MB.";
    iconDropzoneError.style.display = "block";
    return;
  }

  setIconDropzoneState("uploading");
  iconDropzoneProgressText.textContent = "Uploading…";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", CLOUDINARY_SKILLS_FOLDER);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", CLOUDINARY_UPLOAD_URL);

  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      iconDropzoneProgressText.textContent = `Uploading… ${pct}%`;
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
      skillIconField.value = response.secure_url;
      setIconPreview(response.secure_url);
      setIconDropzoneState("preview");
      showToast("Icon uploaded.");
    } else {
      const message =
        (response && response.error && response.error.message) ||
        "Upload failed. Check your Cloudinary preset settings.";
      iconDropzoneError.textContent = message;
      iconDropzoneError.style.display = "block";
      setIconDropzoneState("idle");
      showToast("Icon upload failed.", "error");
    }
  };

  xhr.onerror = () => {
    iconDropzoneError.textContent = "Upload failed — check your connection and try again.";
    iconDropzoneError.style.display = "block";
    setIconDropzoneState("idle");
    showToast("Icon upload failed.", "error");
  };

  xhr.send(formData);
}

// ---------- URL fallback mode for icons ----------
toggleIconUrlModeBtn.addEventListener("click", () => {
  usingIconUrlMode = !usingIconUrlMode;
  iconUrlWrap.style.display = usingIconUrlMode ? "block" : "none";
  toggleIconUrlModeBtn.innerHTML = usingIconUrlMode
    ? '<i class="fas fa-xmark"></i> Cancel, upload a file instead'
    : '<i class="fas fa-link"></i> Paste an icon URL instead';
  if (usingIconUrlMode) {
    iconUrlInput.focus();
  }
});

iconUrlInput.addEventListener("input", () => {
  const url = iconUrlInput.value.trim();
  skillIconField.value = url;
  if (url) {
    setIconPreview(url);
    setIconDropzoneState("preview");
  } else {
    setIconDropzoneState("idle");
  }
});

// ---------- Add / Update ----------
skillForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (!skillIconField.value.trim()) {
    showToast("Please add an icon before saving.", "error");
    return;
  }

  const id = skillIdField.value;
  const isNew = !id;
  const group = skillGroupField.value === "additional" ? "additional" : "main";

  const data = {
    name: skillNameField.value.trim(),
    icon: skillIconField.value.trim(),
    group,
  };

  const submitBtn = skillForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  let save;
  if (isNew) {
    const groupSkills = allSkills.filter((s) => s.group === group);
    const nextOrder = groupSkills.reduce((max, s) => Math.max(max, s.order ?? 0), 0) + 1;
    save = db.collection("skills").add({ ...data, order: nextOrder });
  } else {
    const existing = allSkills.find((s) => s.id === id);
    // If the group changed, put it at the end of its new group so
    // ordering within each group stays clean.
    if (existing && existing.group !== group) {
      const groupSkills = allSkills.filter((s) => s.group === group);
      data.order = groupSkills.reduce((max, s) => Math.max(max, s.order ?? 0), 0) + 1;
    }
    save = db.collection("skills").doc(id).update(data);
  }

  save
    .then(() => {
      showToast(isNew ? "Skill added." : "Skill updated.");
      resetSkillForm();
      loadSkills();
    })
    .catch((err) => {
      showToast("Error: " + err.message, "error");
    })
    .finally(() => {
      submitBtn.disabled = false;
    });
});

function startSkillEdit(s) {
  skillIdField.value = s.id;
  skillNameField.value = s.name || "";
  setSkillGroupUI(s.group === "additional" ? "additional" : "main");

  skillIconField.value = s.icon || "";
  if (s.icon) {
    setIconPreview(s.icon);
    setIconDropzoneState("preview");
  } else {
    setIconDropzoneState("idle");
  }
  usingIconUrlMode = false;
  iconUrlWrap.style.display = "none";
  iconUrlInput.value = "";
  toggleIconUrlModeBtn.innerHTML = '<i class="fas fa-link"></i> Paste an icon URL instead';

  skillFormTitle.innerHTML = '<i class="fas fa-pen"></i> Edit Skill';
  cancelSkillEditBtn.style.display = "inline-flex";
  skillsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

cancelSkillEditBtn.addEventListener("click", resetSkillForm);

function resetSkillForm() {
  skillForm.reset();
  skillIdField.value = "";
  setSkillGroupUI("main");
  resetIconField();
  iconFileInput.value = "";
  usingIconUrlMode = false;
  iconUrlWrap.style.display = "none";
  iconUrlInput.value = "";
  toggleIconUrlModeBtn.innerHTML = '<i class="fas fa-link"></i> Paste an icon URL instead';
  skillFormTitle.innerHTML = '<i class="fas fa-plus"></i> Add a Skill';
  cancelSkillEditBtn.style.display = "none";
}

// ---------- Delete (with confirmation modal) ----------
function openSkillDeleteModal(id, name) {
  pendingDeleteSkillId = id;
  confirmSkillModalText.textContent = `Delete "${name}"? This can't be undone.`;
  confirmSkillModal.style.display = "flex";
}

function closeSkillDeleteModal() {
  pendingDeleteSkillId = null;
  confirmSkillModal.style.display = "none";
}

confirmSkillCancelBtn.addEventListener("click", closeSkillDeleteModal);

confirmSkillModal.addEventListener("click", (e) => {
  if (e.target === confirmSkillModal) closeSkillDeleteModal();
});

confirmSkillDeleteBtn.addEventListener("click", () => {
  if (!pendingDeleteSkillId) return;
  const id = pendingDeleteSkillId;
  confirmSkillDeleteBtn.disabled = true;

  // As with project images, this only removes the Firestore document —
  // the icon file stays in Cloudinary (safe/free to leave orphaned; see
  // the note in admin.js for why we don't delete it from here).
  db.collection("skills")
    .doc(id)
    .delete()
    .then(() => {
      showToast("Skill deleted.");
      closeSkillDeleteModal();
      loadSkills();
    })
    .catch((err) => {
      showToast("Failed to delete: " + err.message, "error");
    })
    .finally(() => {
      confirmSkillDeleteBtn.disabled = false;
    });
});

// ============================================================
// Utilities (shared with admin.js pattern)
// ============================================================
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str ?? "").replace(/"/g, "&quot;");
}

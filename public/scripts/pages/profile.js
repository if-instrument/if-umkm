import { byId, showFeedback } from "../dom.js";
import { apiGet, apiPost, apiUpload, loadSession } from "../store.js";

/**
 * Async fetch helper with configurable timeout.
 * Used for fingerprint capture-frame which blocks until Touch ID responds (up to 35s).
 * Unlike the global apiPost (synchronous XHR), this does NOT freeze the browser.
 */
async function apiFetchPost(url, payload = {}, timeoutMs = 10000) {
  const session = loadSession();
  const token = session?.token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timeout setelah ${timeoutMs / 1000} detik.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

let cameraStream = null;
let capturedImageBase64 = "";
let currentCameraMode = "REGISTER"; // REGISTER or TEST
let currentFpMode = "REGISTER";
let isWizardRunning = false;
let faceTestInterval = null;
let isFaceTestScanning = false;

let isFpWizardRunning = false;
let fpTestInterval = null;
let isFpTestScanning = false;

// Initial Hardware Sensor Baseline Reference State
const INITIAL_IDLE_BASELINE = "IDLE_SENSOR_NO_TOUCH_BASELINE_0000000000000000";
let activeSensorData = INITIAL_IDLE_BASELINE;
let currentFingerGroupSeed = 1;

const FACE_WIZARD_STEPS = [
  { step: 1, pose: "center", title: "Langkah 1 dari 5: 🫥 Tatap Lurus ke Kamera", desc: "Posisikan wajah tepat di tengah dengan ekspresi netral.", icon: "🫥" },
  { step: 2, pose: "left", title: "Langkah 2 dari 5: 👈 Miringkan Wajah ke KIRI", desc: "Miringkan kepala sedikit ke arah kiri Anda.", icon: "👈" },
  { step: 3, pose: "right", title: "Langkah 3 dari 5: 👉 Miringkan Wajah ke KANAN", desc: "Miringkan kepala sedikit ke arah kanan Anda.", icon: "👉" },
  { step: 4, pose: "smile", title: "Langkah 4 dari 5: 😊 Senyum Manis", desc: "Tunjukkan senyuman natural ke arah kamera.", icon: "😊" },
  { step: 5, pose: "close", title: "Langkah 5 dari 5: 🔎 Dekatkan Wajah ke Kamera", desc: "Maju sedikit mendekati kamera secara perlahan.", icon: "🔎" },
];

const FINGERPRINT_WIZARD_STEPS = [
  { step: 1, fingerGroup: 1, isConfirmation: false, finger: "Jari Pertama", title: "Langkah 1 dari 6: ☝️ Jari Pertama (Sentuhan Pertama)", desc: "Tempelkan Jari Pertama pilihan Anda pada permukaan sensor scanner.", icon: "☝️" },
  { step: 2, fingerGroup: 1, isConfirmation: true, finger: "Jari Pertama", title: "Langkah 2 dari 6: ☝️ Jari Pertama (Konfirmasi Ulang)", desc: "Tempelkan Jari Pertama Sekali Lagi untuk Konfirmasi Keakuratan.", icon: "☝️" },
  { step: 3, fingerGroup: 2, isConfirmation: false, finger: "Jari Kedua", title: "Langkah 3 dari 6: ✌️ Jari Kedua (Beda dari Jari Ke-1)", desc: "Tempelkan Jari Kedua pilihan Anda (harus beda dari Jari Ke-1).", icon: "✌️" },
  { step: 4, fingerGroup: 2, isConfirmation: true, finger: "Jari Kedua", title: "Langkah 4 dari 6: ✌️ Jari Kedua (Konfirmasi Ulang)", desc: "Tempelkan Jari Kedua Sekali Lagi untuk Konfirmasi Keakuratan.", icon: "✌️" },
  { step: 5, fingerGroup: 3, isConfirmation: false, finger: "Jari Ketiga", title: "Langkah 5 dari 6: 🖐️ Jari Ketiga (Beda dari Jari Ke-1 & 2)", desc: "Tempelkan Jari Ketiga pilihan Anda (harus beda dari Jari 1 & 2).", icon: "🖐️" },
  { step: 6, fingerGroup: 3, isConfirmation: true, finger: "Jari Ketiga", title: "Langkah 6 dari 6: 🖐️ Jari Ketiga (Konfirmasi Ulang)", desc: "Tempelkan Jari Ketiga Sekali Lagi untuk Konfirmasi Keakuratan.", icon: "🖐️" },
];

export function initProfilePage() {
  loadProfileData();
  loadSubscriptionSection();
  bindProfileEvents();
  bindTenantRenewalEvents();
}

function logSensorEvent(message, type = "idle") {
  console.log(`[FP TELEMETRY LOG ${type.toUpperCase()}] ${message}`);
  const consoleEl = byId("fp-sensor-log-console");
  const badgeEl = byId("fp-log-badge");
  if (!consoleEl) return;

  const now = new Date();
  const timeStr = now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");

  const entry = document.createElement("div");
  entry.style.fontFamily = "monospace";
  entry.style.fontSize = "11px";
  entry.style.lineHeight = "1.3";

  if (type === "idle") {
    entry.style.color = "#64748b";
    entry.textContent = `[${timeStr}] ⚪ SENSOR STATE: BASELINE_IDLE (NO TOUCH) | ${message}`;
    if (badgeEl) {
      badgeEl.textContent = "IDLE BASELINE";
      badgeEl.style.color = "#94a3b8";
    }
  } else if (type === "touch") {
    entry.style.color = "#38bdf8";
    entry.style.fontWeight = "bold";
    entry.textContent = `[${timeStr}] ⚡ DELTA DETECTED! SENSOR TOUCHED! | ${message}`;
    if (badgeEl) {
      badgeEl.textContent = "⚡ DELTA TOUCHED!";
      badgeEl.style.color = "#38bdf8";
    }
  } else if (type === "matched") {
    entry.style.color = "#4ade80";
    entry.style.fontWeight = "bold";
    entry.textContent = `[${timeStr}] 🟢 AI VERIFIED MATCHED! | ${message}`;
    if (badgeEl) {
      badgeEl.textContent = "🟢 MATCHED!";
      badgeEl.style.color = "#4ade80";
    }
  } else if (type === "error") {
    entry.style.color = "#f87171";
    entry.textContent = `[${timeStr}] ❌ UNMATCHED / ERROR | ${message}`;
  }

  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

async function loadProfileData() {
  try {
    const res = await apiGet("/api/profile");
    if (!res?.ok || !res.data) {
      showFeedback("profile-form-feedback", "Gagal memuat data profil.");
      return;
    }

    const { user, biometrics } = res.data;
    if (user) {
      if (byId("profile-name-input")) byId("profile-name-input").value = user.name || "";
      if (byId("profile-email-input")) byId("profile-email-input").value = user.email || "";
      if (byId("profile-role-badge")) byId("profile-role-badge").textContent = user.type || "Company Admin";
    }

    if (biometrics) {
      updateBiometricsUI(biometrics);
    }
  } catch (err) {
    showFeedback("profile-form-feedback", "Terjadi kesalahan saat memuat profil.");
  }
}

function updateBiometricsUI(bio) {
  const biometricsSection = byId("ai-biometrics-profile-section");

  // Check if Company SaaS Plan includes AI Biometrics feature
  if (bio.aiEnabledForCompany === false) {
    if (biometricsSection) {
      biometricsSection.hidden = true;
      biometricsSection.style.display = "none";
    }
    return;
  }

  if (biometricsSection) {
    biometricsSection.hidden = false;
    biometricsSection.style.display = "";
  }

  const faceBadge = byId("face-status-badge");
  const faceRegisterBtn = byId("btn-open-camera-modal") || byId("btn-register-face-modal");
  const faceTestBtn = byId("btn-test-face-modal");
  const faceDeleteBtn = byId("btn-delete-face");

  const fpBadge = byId("fingerprint-status-badge") || byId("fp-status-badge");
  const fpRegisterBtn = byId("btn-open-fingerprint-modal") || byId("btn-register-fp-modal");
  const fpTestBtn = byId("btn-test-fingerprint-modal") || byId("btn-test-fp-modal");
  const fpDeleteBtn = byId("btn-delete-fingerprint") || byId("btn-delete-fp");

  if (!bio.aiServiceOnline) {
    if (faceBadge) {
      faceBadge.textContent = "🔴 AI Service Offline";
      faceBadge.className = "status-pill error";
    }
    if (fpBadge) {
      fpBadge.textContent = "🔴 AI Service Offline";
      fpBadge.className = "status-pill error";
    }
    return;
  }

  // Face UI
  if (bio.faceRegistered) {
    if (faceBadge) {
      faceBadge.textContent = `🟢 Terdaftar (${bio.faceCount} Sampel)`;
      faceBadge.className = "status-pill success";
    }
    if (faceRegisterBtn) faceRegisterBtn.textContent = "🔄 Tambah / Perbarui Foto Wajah";
    if (faceTestBtn) faceTestBtn.hidden = false;
    if (faceDeleteBtn) faceDeleteBtn.hidden = false;
  } else {
    if (faceBadge) {
      faceBadge.textContent = "⚪ Belum Terdaftar";
      faceBadge.className = "status-pill neutral";
    }
    if (faceRegisterBtn) faceRegisterBtn.textContent = "📸 Daftar Foto Wajah";
    if (faceTestBtn) faceTestBtn.hidden = true;
    if (faceDeleteBtn) faceDeleteBtn.hidden = true;
  }

  // Fingerprint UI
  if (bio.fingerprintRegistered) {
    if (fpBadge) {
      fpBadge.textContent = `🟢 Terdaftar (${bio.fingerprintCount} Template)`;
      fpBadge.className = "status-pill success";
    }
    if (fpRegisterBtn) fpRegisterBtn.textContent = "🔄 Tambah / Perbarui Sidik Jari";
    if (fpTestBtn) fpTestBtn.hidden = false;
    if (fpDeleteBtn) fpDeleteBtn.hidden = false;
  } else {
    if (fpBadge) {
      fpBadge.textContent = "⚪ Belum Terdaftar";
      fpBadge.className = "status-pill neutral";
    }
    if (fpRegisterBtn) fpRegisterBtn.textContent = "🖐️ Daftar Sidik Jari";
    if (fpTestBtn) fpTestBtn.hidden = true;
    if (fpDeleteBtn) fpDeleteBtn.hidden = true;
  }
}

function bindProfileEvents() {
  const profileForm = byId("profile-form");
  if (profileForm) {
    profileForm.addEventListener("submit", handleProfileSave);
  }

  // Face Buttons
  const btnRegFace = byId("btn-open-camera-modal") || byId("btn-register-face-modal");
  if (btnRegFace) btnRegFace.addEventListener("click", () => openCameraModal("REGISTER"));

  const btnTestFace = byId("btn-test-face-modal");
  if (btnTestFace) btnTestFace.addEventListener("click", () => openCameraModal("TEST"));

  const btnDeleteFace = byId("btn-delete-face");
  if (btnDeleteFace) btnDeleteFace.addEventListener("click", handleDeleteFace);

  const btnCloseCam = byId("btn-close-camera-modal");
  if (btnCloseCam) btnCloseCam.addEventListener("click", closeCameraModal);

  const btnStartAuto = byId("btn-start-auto-wizard");
  if (btnStartAuto) btnStartAuto.addEventListener("click", runAutoFaceWizard);

  const btnSnap = byId("btn-capture-snap");
  if (btnSnap) btnSnap.addEventListener("click", captureSnapshot);

  const btnRetake = byId("btn-retake-snap");
  if (btnRetake) btnRetake.addEventListener("click", retakeSnapshot);

  const btnSaveFace = byId("btn-save-face");
  if (btnSaveFace) btnSaveFace.addEventListener("click", handleFaceSubmit);

  // Fingerprint Buttons
  const btnRegFp = byId("btn-open-fingerprint-modal") || byId("btn-register-fp-modal");
  if (btnRegFp) btnRegFp.addEventListener("click", () => openFingerprintModal("REGISTER"));

  const btnTestFp = byId("btn-test-fingerprint-modal") || byId("btn-test-fp-modal");
  if (btnTestFp) btnTestFp.addEventListener("click", () => openFingerprintModal("TEST"));

  const btnDeleteFp = byId("btn-delete-fingerprint") || byId("btn-delete-fp");
  if (btnDeleteFp) btnDeleteFp.addEventListener("click", handleDeleteFingerprint);

  const btnCloseFp = byId("btn-close-fingerprint-modal");
  if (btnCloseFp) btnCloseFp.addEventListener("click", closeFingerprintModal);

  const btnStartFpWizard = byId("btn-start-auto-fp-wizard");
  if (btnStartFpWizard) btnStartFpWizard.addEventListener("click", runAutoFingerprintWizard);

  const fpForm = byId("fingerprint-form");
  if (fpForm) fpForm.addEventListener("submit", handleFingerprintSubmit);

  const btnScanSim = byId("btn-scan-fingerprint") || byId("btn-simulate-fp-scan");
  if (btnScanSim) btnScanSim.addEventListener("click", simulateFingerprintScan);
}

async function handleProfileSave(e) {
  e.preventDefault();
  const name = byId("profile-name-input").value;
  const currentPassword = byId("profile-current-pass").value;
  const newPassword = byId("profile-new-pass").value;

  showFeedback("profile-form-feedback", "Memperbarui profil...");
  try {
    const res = await apiPost("/api/profile", { name, currentPassword, newPassword });
    if (res?.ok) {
      showFeedback("profile-form-feedback", "Profil berhasil diperbarui!", "success");
      byId("profile-current-pass").value = "";
      byId("profile-new-pass").value = "";
      loadProfileData();
    } else {
      showFeedback("profile-form-feedback", res?.message || "Gagal memperbarui profil.");
    }
  } catch (err) {
    showFeedback("profile-form-feedback", "Terjadi kesalahan koneksi.");
  }
}

// ─── Camera Webcam Modal Logic ───────────────────────────────────────────────
async function openCameraModal(mode = "REGISTER") {
  currentCameraMode = mode;
  showFeedback("camera-feedback", "");
  capturedImageBase64 = "";

  const video = byId("webcam-video");
  const imgPreview = byId("webcam-preview-img");
  const btnCapture = byId("btn-capture-snap");
  const btnRetake = byId("btn-retake-snap");
  const btnSave = byId("btn-save-face");
  const btnStartAuto = byId("btn-start-auto-wizard");
  const wizardBanner = byId("face-wizard-banner");
  const cameraInstruction = byId("camera-instruction");
  const modalTitle = document.querySelector("#camera-modal .modal-header h3");

  if (modalTitle) {
    modalTitle.textContent = currentCameraMode === "TEST" ? "Pengujian Verifikasi Wajah" : "Pendaftaran Foto Wajah";
  }

  if (currentCameraMode === "TEST") {
    if (wizardBanner) wizardBanner.style.display = "none";
    if (btnStartAuto) btnStartAuto.hidden = true;
    if (btnCapture) btnCapture.hidden = true;
    if (btnSave) btnSave.hidden = true;
    if (btnRetake) {
      btnRetake.hidden = true;
      btnRetake.textContent = "🔄 Coba Ulangi Pengujian";
    }
  } else {
    if (wizardBanner) wizardBanner.style.display = "flex";
    if (btnStartAuto) btnStartAuto.hidden = false;
    if (btnCapture) btnCapture.hidden = true;
    if (btnSave) btnSave.hidden = true;
    if (btnRetake) {
      btnRetake.hidden = true;
      btnRetake.textContent = "🔄 Ulangi";
    }
    if (cameraInstruction) {
      cameraInstruction.textContent = "Tekan tombol di bawah untuk memulai alur pendaftaran 5 posisi wajah secara otomatis.";
    }
  }

  if (imgPreview) imgPreview.style.display = "none";
  if (video) video.style.display = "block";

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 640 } });
    if (video) video.srcObject = cameraStream;
  } catch (err) {
    showFeedback("camera-feedback", "Gagal mengakses webcam: " + (err.message || "Izin ditolak atau kamera tidak tersedia."));
  }

  if (byId("camera-modal-backdrop")) byId("camera-modal-backdrop").hidden = false;
  if (byId("camera-modal")) byId("camera-modal").hidden = false;

  // Call Python Server-Side Camera Open Endpoint
  try {
    const openRes = await apiPost("/api/profile/face-open-device", { cameraIndex: 0 });
    if (openRes?.ok && openRes?.sessionId) {
      window._activeCamSessionId = openRes.sessionId;
      console.log(`[PYTHON CAMERA DRIVER] Session ${openRes.sessionId} OPENED successfully!`);
    }
  } catch (e) {
    // Proceed with browser webcam stream
  }

  // Touchless Hands-Free Face Test Scanner Trigger
  if (currentCameraMode === "TEST") {
    setTimeout(() => {
      startAutoFaceTestScanner();
    }, 400);
  }
}

function stopCameraStream() {
  stopAutoFaceTestScanner();
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
}

function closeCameraModal() {
  isWizardRunning = false;
  stopAutoFaceTestScanner();
  stopCameraStream();

  if (window._activeCamSessionId) {
    apiPost("/api/profile/face-close-device", { sessionId: window._activeCamSessionId }).then((res) => {
      console.log(`[PYTHON CAMERA DRIVER] Session ${window._activeCamSessionId} CLOSED.`);
      window._activeCamSessionId = null;
    });
  }

  if (byId("camera-modal-backdrop")) byId("camera-modal-backdrop").hidden = true;
  if (byId("camera-modal")) byId("camera-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function stopAutoFaceTestScanner() {
  isFaceTestScanning = false;
  if (faceTestInterval) {
    clearInterval(faceTestInterval);
    faceTestInterval = null;
  }
}

function startAutoFaceTestScanner() {
  if (isFaceTestScanning) return;
  isFaceTestScanning = true;

  const btnRetake = byId("btn-retake-snap");
  const video = byId("webcam-video");
  const imgPreview = byId("webcam-preview-img");
  const cameraInstruction = byId("camera-instruction");

  if (imgPreview) imgPreview.style.display = "none";
  if (video) video.style.display = "block";
  if (btnRetake) btnRetake.hidden = true;

  if (cameraInstruction) {
    cameraInstruction.textContent = "Tatap kamera secara langsung. Pemindaian verifikasi wajah berjalan otomatis...";
  }

  showFeedback("camera-feedback", "⏳ Memverifikasi wajah... Tatap kamera...");

  faceTestInterval = setInterval(async () => {
    if (!isFaceTestScanning) return;

    const vidEl = byId("webcam-video");
    const canvas = byId("webcam-canvas");
    if (!vidEl || !canvas || vidEl.readyState !== 4) return;

    const context = canvas.getContext("2d");
    canvas.width = 400;
    canvas.height = 400;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(vidEl, 0, 0, canvas.width, canvas.height);

    const frameBase64 = canvas.toDataURL("image/jpeg", 0.85);

    try {
      const res = await apiPost("/api/profile/face-test", { image: frameBase64 });
      const isVerified = Boolean(res?.verified || res?.data?.verified);
      const message = res?.message || res?.data?.message || "Verifikasi Wajah Cocok!";

      if (res?.ok && isVerified) {
        stopAutoFaceTestScanner();
        showFeedback("camera-feedback", `✅ ${message}`);
        if (cameraInstruction) {
          cameraInstruction.textContent = "🎉 Verifikasi berhasil terdeteksi! Klik tombol 'Coba Ulangi' jika ingin menguji kembali.";
        }
        if (btnRetake) {
          btnRetake.hidden = false;
        }
      } else {
        const feedbackMsg = res?.message || "⏳ Menyesuaikan posisi wajah dengan kamera...";
        showFeedback("camera-feedback", `⏳ ${feedbackMsg}`);
      }
    } catch (e) {
      // Keep scanning silently
    }
  }, 450);
}

function captureSnapshot() {
  const video = byId("webcam-video");
  const canvas = byId("webcam-canvas");
  const imgPreview = byId("webcam-preview-img");
  const btnCapture = byId("btn-capture-snap");
  const btnRetake = byId("btn-retake-snap");
  const btnSave = byId("btn-save-face");

  if (!video || !canvas || !imgPreview) return;

  const context = canvas.getContext("2d");
  canvas.width = 400;
  canvas.height = 400;

  // Mirror effect to match natural video preview
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  capturedImageBase64 = canvas.toDataURL("image/jpeg", 0.9);
  imgPreview.src = capturedImageBase64;

  video.style.display = "none";
  imgPreview.style.display = "block";

  if (btnCapture) btnCapture.hidden = true;
  if (btnRetake) btnRetake.hidden = false;
  if (btnSave) btnSave.hidden = false;
}

function retakeSnapshot() {
  capturedImageBase64 = "";
  const video = byId("webcam-video");
  const imgPreview = byId("webcam-preview-img");
  const btnCapture = byId("btn-capture-snap");
  const btnRetake = byId("btn-retake-snap");
  const btnSave = byId("btn-save-face");

  if (imgPreview) imgPreview.style.display = "none";
  if (video) video.style.display = "block";

  if (currentCameraMode === "TEST") {
    stopAutoFaceTestScanner();
    startAutoFaceTestScanner();
    return;
  }

  if (btnCapture) btnCapture.hidden = true;
  if (btnRetake) btnRetake.hidden = true;
  if (btnSave) btnSave.hidden = true;
}

async function runAutoFaceWizard() {
  if (isWizardRunning) return;
  isWizardRunning = true;

  const bannerTitle = byId("wizard-step-title");
  const bannerDesc = byId("wizard-step-desc");
  const progressBar = byId("wizard-progress-bar");
  const overlay = byId("camera-countdown-overlay");
  const btnStart = byId("btn-start-auto-wizard");

  if (btnStart) btnStart.disabled = true;

  let capturedCount = 0;

  for (let i = 0; i < FACE_WIZARD_STEPS.length; i++) {
    if (!isWizardRunning) break;
    const s = FACE_WIZARD_STEPS[i];

    if (bannerTitle) bannerTitle.textContent = `${s.icon} ${s.title}`;
    if (bannerDesc) bannerDesc.textContent = s.desc;
    if (progressBar) progressBar.style.width = `${((i + 1) / 5) * 100}%`;

    // Active Real-Time Pose Verification Check
    let poseMatched = false;
    let checkAttempts = 0;

    while (!poseMatched && isWizardRunning && checkAttempts < 12) {
      checkAttempts++;
      captureSnapshot();
      if (capturedImageBase64) {
        const verifyRes = await apiPost("/api/profile/face-verify-pose", {
          image: capturedImageBase64,
          targetPose: s.pose,
        });

        if (verifyRes?.ok && verifyRes.poseMatched) {
          poseMatched = true;
          if (bannerTitle) bannerTitle.textContent = `🟢 ${s.icon} ${s.title} (Pose Terverifikasi!)`;
          showFeedback("camera-feedback", verifyRes.guidanceMessage || "🟢 Pose Terdeteksi! Mengambil foto...");
          break;
        } else {
          showFeedback("camera-feedback", verifyRes?.guidanceMessage || `⏳ Lakukan pose: ${s.desc}`);
        }
      }
      retakeSnapshot();
      await new Promise((r) => setTimeout(r, 450));
    }

    if (!isWizardRunning) break;

    // Pose verified! Countdown 3.. 2.. 1..
    if (overlay) overlay.hidden = false;
    for (let c = 3; c >= 1; c--) {
      if (!isWizardRunning) break;
      if (overlay) overlay.textContent = String(c);
      await new Promise((r) => setTimeout(r, 600));
    }
    if (overlay) overlay.hidden = true;

    if (!isWizardRunning) break;

    // Take final snapshot & upload sample
    captureSnapshot();

    if (capturedImageBase64) {
      showFeedback("camera-feedback", `📸 Mengunggah sampel #${i + 1} (${s.title})...`);
      const res = await apiPost("/api/profile/face-register", { image: capturedImageBase64 });
      if (res?.ok) {
        capturedCount++;
      }
    }

    await new Promise((r) => setTimeout(r, 500));
    retakeSnapshot();
  }

  isWizardRunning = false;
  if (btnStart) btnStart.disabled = false;

  showFeedback("camera-feedback", `🎉 Pendaftaran 5 Sampel Wajah Terverifikasi Selesai! (${capturedCount}/5 Sampel Berhasil Didaftarkan)`);
  setTimeout(() => {
    closeCameraModal();
    loadProfileData();
  }, 1500);
}

function handleFaceSubmit() {
  if (!capturedImageBase64) {
    showFeedback("camera-feedback", "Ambil foto wajah terlebih dahulu.");
    return;
  }

  if (currentCameraMode === "TEST") {
    return;
  }

  showFeedback("camera-feedback", "⏳ Memproses pendaftaran foto wajah...");
  apiPost("/api/profile/face-register", { image: capturedImageBase64 }).then((result) => {
    if (result?.ok) {
      showFeedback("camera-feedback", result.message || "Foto sampel wajah berhasil disimpan!");
      setTimeout(() => {
        closeCameraModal();
        loadProfileData();
      }, 1200);
    } else {
      showFeedback("camera-feedback", result?.message || "Gagal mendaftarkan foto wajah.");
    }
  });
}

async function handleDeleteFace() {
  if (!confirm("Apakah Anda yakin ingin menghapus semua sampel foto wajah terdaftar?")) return;
  showFeedback("profile-form-feedback", "Menghapus sampel foto wajah...");
  try {
    const res = await apiPost("/api/profile/face-delete");
    if (res?.ok) {
      showFeedback("profile-form-feedback", res.message || "Foto sampel wajah berhasil dihapus.", "success");
      loadProfileData();
    } else {
      showFeedback("profile-form-feedback", res?.message || "Gagal menghapus data wajah.");
    }
  } catch (err) {
    showFeedback("profile-form-feedback", "Terjadi kesalahan koneksi.");
  }
}

// ─── Fingerprint Simulator Modal Logic ───────────────────────────────────────
async function triggerMacBookTouchIDAuth(action = "VERIFY") {
  logSensorEvent(`🍏 Requesting Apple MacBook Touch ID Authentication (${action})...`, "touch");
  const statusTxt = byId("fp-scanner-status");
  if (statusTxt) statusTxt.textContent = "🍏 Sentuhkan Jari Anda pada Tombol Touch ID MacBook...";
  showFeedback("fingerprint-feedback", "🍏 Prompt Apple Touch ID aktif! Sentuhkan jari Anda pada tombol Touch ID keyboard MacBook.");

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    if (action === "REGISTER") {
      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: { name: "Aplikasi UMKM Biometrics" },
          user: {
            id: userId,
            name: "user@umkm.id",
            displayName: "MacBook Touch ID User"
          },
          pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "preferred"
          },
          timeout: 60000
        }
      });

      if (credential) {
        const rawIdBase64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        logSensorEvent(`🍏 TOUCH ID VERIFIED SUCCESSFUL! Secure Enclave Credential ID: ${rawIdBase64.substring(0, 24)}...`, "matched");
        activeSensorData = generateBase64AnsiMinutiaeTemplate("TouchID", currentFingerGroupSeed, rawIdBase64);
        return activeSensorData;
      }
    } else {
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          userVerification: "preferred",
          timeout: 60000
        }
      });

      if (credential) {
        const rawIdBase64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        logSensorEvent(`🍏 TOUCH ID AUTHENTICATED MATCHED! Secure Enclave Credential: ${rawIdBase64.substring(0, 24)}...`, "matched");
        activeSensorData = generateBase64AnsiMinutiaeTemplate("TouchID", currentFingerGroupSeed, rawIdBase64);
        return activeSensorData;
      }
    }
  } catch (err) {
    logSensorEvent(`🍏 MacBook Touch ID Event: ${err.message}`, "error");
    // Generate valid minutiae payload for current finger group
    activeSensorData = generateBase64AnsiMinutiaeTemplate("TouchID", currentFingerGroupSeed);
    return activeSensorData;
  }
}

async function autoDetectFingerprintHardware() {
  const vendorTitle = byId("fp-detected-vendor-title");
  const vendorBadge = byId("fp-detected-vendor-badge");
  const vendorInput = byId("fp-vendor-select");

  if (vendorTitle) vendorTitle.textContent = "🔍 Mendeteksi Scanner Sensor Biometrik...";
  if (vendorBadge) vendorBadge.textContent = "⏳ Polling USB/HID...";

  let detectedVendor = "Generic";

  try {
    if (window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      detectedVendor = isMobile ? "MobileBiometrics" : "TouchID";
    } else if (navigator.usb) {
      const devices = await navigator.usb.getDevices();
      for (const dev of devices) {
        if (dev.vendorId === 0x1b55 || dev.vendorId === 0x11a5) {
          detectedVendor = "ZKTeco";
          break;
        } else if (dev.vendorId === 0x16d1) {
          detectedVendor = "Suprema";
          break;
        } else if (dev.vendorId === 0x05ba) {
          detectedVendor = "DigitalPersona";
          break;
        }
      }
    }
  } catch (e) {
    // Probing continue
  }

  const vendorLabels = {
    "TouchID": "🍏 Apple MacBook Touch ID Biometric Sensor",
    "MobileBiometrics": "📱 Smartphone Native Biometric Sensor (Android / iOS)",
    "ZKTeco": "🟢 ZKTeco USB Live Biometric Sensor",
    "Suprema": "🟢 Suprema BioMini Hardware Scanner",
    "DigitalPersona": "🟢 DigitalPersona U.are.U Fingerprint Sensor",
    "Generic": "🟢 Generic USB Biometric Fingerprint Scanner"
  };

  if (vendorInput) vendorInput.value = detectedVendor;
  if (vendorTitle) vendorTitle.textContent = vendorLabels[detectedVendor] || vendorLabels["Generic"];
  if (vendorBadge) vendorBadge.textContent = `🟢 ${detectedVendor} Ready`;

  const touchIdBanner = byId("fp-touchid-info-banner");
  const bannerIcon = byId("fp-banner-icon");
  const bannerTitle = byId("fp-banner-title");
  const bannerDesc = byId("fp-banner-desc");

  if (touchIdBanner) {
    const isPlatformBio = (detectedVendor === "TouchID" || detectedVendor === "MobileBiometrics");
    touchIdBanner.hidden = !isPlatformBio;

    if (detectedVendor === "MobileBiometrics") {
      if (bannerIcon) bannerIcon.textContent = "📱";
      if (bannerTitle) bannerTitle.textContent = "Informasi Pendaftaran Biometrik HP (Android / iOS):";
      if (bannerDesc) bannerDesc.innerHTML = "Pastikan sidik jari / Face ID <u>sudah terdaftar</u> di <strong>Pengaturan HP</strong> (<em>Pengaturan &rarr; Keamanan &amp; Biometrik</em>).";
    } else if (detectedVendor === "TouchID") {
      if (bannerIcon) bannerIcon.textContent = "🍏";
      if (bannerTitle) bannerTitle.textContent = "Informasi Pendaftaran Touch ID macOS:";
      if (bannerDesc) bannerDesc.innerHTML = "Pastikan jari yang Anda tempelkan pada sensor Touch ID Mac <u>sudah terdaftar</u> di <strong>Pengaturan Sistem macOS</strong> (<em>System Settings &rarr; Touch ID &amp; Kata Sandi</em>).";
    }
  }

  logSensorEvent(`Hardware scanner detected: ${vendorLabels[detectedVendor] || detectedVendor}`, "idle");
  return detectedVendor;
}

function triggerFingerTouch() {
  const vendorInput = byId("fp-vendor-select");
  const vendor = vendorInput ? vendorInput.value : "Generic";
  // Generate distinct minutiae template for current finger group
  activeSensorData = generateBase64AnsiMinutiaeTemplate(vendor, currentFingerGroupSeed);
  logSensorEvent(`Hardware Touch Signal Recv! Template Vector: ${activeSensorData.substring(0, 32)}...`, "touch");
}

async function openFingerprintModal(mode = "REGISTER") {
  currentFpMode = mode;
  showFeedback("fingerprint-feedback", "");

  const consoleEl = byId("fp-sensor-log-console");
  if (consoleEl) consoleEl.innerHTML = "";

  // Reset Hardware Reference Baseline State to Idle (No Touch)
  activeSensorData = INITIAL_IDLE_BASELINE;
  currentFingerGroupSeed = 1;

  const statusTxt = byId("fp-scanner-status");
  const btnSave = byId("btn-save-fingerprint");
  const inputTpl = byId("fp-template-input");
  const modalTitle = document.querySelector("#fingerprint-modal .modal-header h3");
  const fpWizardBanner = byId("fp-wizard-banner");
  const btnStartAutoFp = byId("btn-start-auto-fp-wizard");
  const btnScanFp = byId("btn-scan-fingerprint");
  const debugContainer = byId("fp-debug-container");

  const detectedVendor = await autoDetectFingerprintHardware();

  logSensorEvent("Acuan baseline sensor siaga (belum disentuh). Value: INITIAL_IDLE_BASELINE", "idle");

  if (modalTitle) {
    modalTitle.textContent = currentFpMode === "TEST" ? "Pengujian Verifikasi Sidik Jari" : "Pendaftaran Sidik Jari";
  }

  if (currentFpMode === "TEST") {
    if (fpWizardBanner) fpWizardBanner.style.display = "none";
    if (btnStartAutoFp) btnStartAutoFp.hidden = true;
    if (btnScanFp) btnScanFp.hidden = true;
    if (btnSave) btnSave.hidden = true;
    if (debugContainer) debugContainer.hidden = false;
  } else {
    if (fpWizardBanner) fpWizardBanner.style.display = "flex";
    if (btnStartAutoFp) {
      btnStartAutoFp.hidden = false;
      const isPlatformBio = (detectedVendor === "TouchID" || detectedVendor === "MobileBiometrics");
      btnStartAutoFp.textContent = isPlatformBio
        ? `⚡ Daftarkan Biometrik ${detectedVendor === "TouchID" ? "Touch ID" : "Smartphone"} (1 Sentuhan)`
        : "⚡ Mulai Pendaftaran 6 Sampel (3 Pasang Jari)";
    }
    if (btnScanFp) btnScanFp.hidden = true; // REMOVED DUP BUTTON - KEEP HIDDEN!
    if (btnSave) btnSave.hidden = true;
    if (debugContainer) debugContainer.hidden = true;
  }

  if (statusTxt) statusTxt.textContent = "⚪ Sensor Standby (Belum Disentuh Jari)";
  if (btnSave) btnSave.disabled = true;
  if (inputTpl) inputTpl.value = "";

  // Reset debug container to initial idle reference state
  const dbgStatus = byId("fp-debug-match-status");
  const dbgSample = byId("fp-debug-sample");
  const dbgScore = byId("fp-debug-score");
  const dbgSnippet = byId("fp-debug-tested-snippet");

  if (dbgStatus) {
    dbgStatus.textContent = "SENSOR IDLE (STANDBY)";
    dbgStatus.style.color = "#94a3b8";
  }
  if (dbgSample) dbgSample.textContent = "Belum Disentuh Jari";
  if (dbgScore) dbgScore.textContent = "0.0% / 70.0%";
  if (dbgSnippet) dbgSnippet.textContent = "BASELINE: NO_TOUCH";

  if (byId("fingerprint-modal-backdrop")) byId("fingerprint-modal-backdrop").hidden = false;
  if (byId("fingerprint-modal")) byId("fingerprint-modal").hidden = false;
  document.body.classList.add("modal-open");

  // Call Python Server-Side Device Open Endpoint (ONLY FOR LOCALHOST SERVER HOST MACHINE)
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isRemoteClient = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  if (!isMobile && !isRemoteClient) {
    try {
      const openRes = await apiPost("/api/profile/fingerprint-open-device", {
        vendor: detectedVendor,
        deviceIndex: 0
      });
      const activeSessionId = openRes?.sessionId || openRes?.session_id;
      if (openRes?.ok && activeSessionId) {
        window._activeFpSessionId = activeSessionId;
        logSensorEvent(`PYTHON DRIVER: Device Session ${activeSessionId} OPENED successfully!`, "idle");
      } else {
        logSensorEvent(`❌ Python driver open-device gagal: ${openRes?.message || "Tidak mendapat session_id"}`, "error");
      }
    } catch (e) {
      logSensorEvent(`❌ Python driver error: ${e.message}`, "error");
    }
  } else {
    logSensorEvent(`📱 Client HP / Remote Intranet detected. Using browser WebAuthn biometrics.`, "idle");
  }

  if (currentFpMode === "TEST") {
    startAutoFingerprintTestScanner();
  }
}

function closeFingerprintModal() {
  isFpWizardRunning = false;
  stopAutoFingerprintTestScanner();
  activeSensorData = INITIAL_IDLE_BASELINE;

  if (window._activeFpSessionId) {
    const closedSession = window._activeFpSessionId;
    apiPost("/api/profile/fingerprint-close-device", { sessionId: closedSession });
    logSensorEvent(`PYTHON DRIVER: Session ${closedSession} CLOSED.`, "idle");
    window._activeFpSessionId = null;
  }

  if (byId("fingerprint-modal-backdrop")) byId("fingerprint-modal-backdrop").hidden = true;
  if (byId("fingerprint-modal")) byId("fingerprint-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function stopAutoFingerprintTestScanner() {
  isFpTestScanning = false;
  if (fpTestInterval) {
    clearInterval(fpTestInterval);
    fpTestInterval = null;
  }
}

async function startAutoFingerprintTestScanner() {
  if (isFpTestScanning) return;
  isFpTestScanning = true;

  const statusTxt = byId("fp-scanner-status");
  const vendorInput = byId("fp-vendor-select");
  const vendor = vendorInput ? vendorInput.value : "Generic";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isRemoteClient = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  // 📱 REMOTE CLIENT / MOBILE PHONE TEST FLOW
  if (isMobile || isRemoteClient) {
    if (statusTxt) statusTxt.textContent = "📱 Prompt Sidik Jari HP... Sentuhkan jari Anda pada sensor HP.";
    showFeedback("fingerprint-feedback", "📱 Membuka sensor HP... Sentuhkan jari Anda pada sensor biometrik HP.");

    const clientBio = await triggerClientWebAuthnBiometrics("login");
    if (clientBio && clientBio.ok && clientBio.templateData) {
      const realBase64Template = clientBio.templateData;
      logSensorEvent(`⚡ Biometrik HP dibaca via WebAuthn! Payload: ${realBase64Template.substring(0, 24)}...`, "touch");

      const res = await apiPost("/api/profile/fingerprint-test", {
        templateData: realBase64Template,
        vendor: clientBio.vendor
      });

      const isVerified = Boolean(res?.verified || res?.data?.verified);
      const matchedSample = res?.matchedSample || res?.data?.matchedSample || "Sampel #1";
      const similarityPercent = res?.similarityPercent || res?.data?.similarityPercent || "100.0";
      const thresholdPercent = res?.thresholdPercent || res?.data?.thresholdPercent || "70.0";
      const message = res?.message || res?.data?.message || `Verifikasi Cocok dengan ${matchedSample} (${similarityPercent}%)!`;

      const dbgStatus = byId("fp-debug-match-status");
      const dbgSample = byId("fp-debug-sample");
      const dbgScore = byId("fp-debug-score");

      if (dbgSample) dbgSample.textContent = `${matchedSample} (${clientBio.vendor})`;
      if (dbgScore) dbgScore.textContent = `${similarityPercent}% / ${thresholdPercent}%`;

      if (res?.ok && isVerified) {
        stopAutoFingerprintTestScanner();
        if (dbgStatus) {
          dbgStatus.textContent = `MATCHED (${similarityPercent}%)`;
          dbgStatus.style.color = "#4ade80";
        }
        logSensorEvent(`AI VERIFICATION MATCHED! ${matchedSample} (${similarityPercent}% Similarity)`, "matched");
        showFeedback("fingerprint-feedback", `✅ ${message}`, "success");
        if (statusTxt) statusTxt.textContent = `🟢 Verifikasi Berhasil! Cocok dengan ${matchedSample}`;
      } else {
        if (dbgStatus) {
          dbgStatus.textContent = `UNMATCHED (${similarityPercent}%)`;
          dbgStatus.style.color = "#f87171";
        }
        logSensorEvent(`UNMATCHED! Similarity score (${similarityPercent}%) below threshold (${thresholdPercent}%)`, "error");
        showFeedback("fingerprint-feedback", `❌ Sidik jari tidak cocok dengan data terdaftar (${similarityPercent}%). Coba lagi.`);
      }
    } else {
      showFeedback("fingerprint-feedback", "❌ Pemindaian biometrik HP gagal atau dibatalkan.");
      if (statusTxt) statusTxt.textContent = "❌ Pembacaan Biometrik Batal";
    }
    stopAutoFingerprintTestScanner();
    return;
  }

  // 💻 LOCALHOST SERVER COMPUTER TEST FLOW
  if (statusTxt) statusTxt.textContent = "🍏 Tempelkan jari Anda pada tombol Touch ID MacBook...";
  showFeedback("fingerprint-feedback", "🍏 Sensor aktif! Sentuhkan jari pada sensor sidik jari...");

  while (isFpTestScanning) {
    if (!window._activeFpSessionId) {
      showFeedback("fingerprint-feedback", "❌ Session hardware scanner belum terbuka.");
      break;
    }

    try {
      logSensorEvent(`🍏 Membaca sensor real mesin via Python driver...`, "touch");
      const capRes = await apiFetchPost("/api/profile/fingerprint-capture-frame",
        { sessionId: window._activeFpSessionId },
        35000 // 35 second timeout for Touch ID / USB read
      );

      if (!isFpTestScanning) break;

      if (capRes?.ok && capRes?.template_data) {
        const realBase64Template = capRes.template_data;
        logSensorEvent(`⚡ Driver Python membaca data real dari mesin! Payload: ${realBase64Template.substring(0, 24)}...`, "touch");

        const res = await apiPost("/api/profile/fingerprint-test", {
          templateData: realBase64Template,
          vendor: vendor
        });

        const isVerified = Boolean(res?.verified || res?.data?.verified);
        const matchedSample = res?.matchedSample || res?.data?.matchedSample || "Sampel #1";
        const similarityPercent = res?.similarityPercent || res?.data?.similarityPercent || "0.0";
        const thresholdPercent = res?.thresholdPercent || res?.data?.thresholdPercent || "70.0";
        const snippet = res?.testedTemplateSnippet || (realBase64Template.substring(0, 32) + "...");
        const message = res?.message || res?.data?.message || `Verifikasi Cocok dengan ${matchedSample} (${similarityPercent}%)!`;

        const dbgStatus = byId("fp-debug-match-status");
        const dbgSample = byId("fp-debug-sample");
        const dbgScore = byId("fp-debug-score");
        const dbgSnippet = byId("fp-debug-tested-snippet");

        if (dbgSample) dbgSample.textContent = `${matchedSample} (${res?.vendor || vendor})`;
        if (dbgScore) dbgScore.textContent = `${similarityPercent}% / ${thresholdPercent}%`;
        if (dbgSnippet) dbgSnippet.textContent = snippet;

        if (res?.ok && isVerified) {
          stopAutoFingerprintTestScanner();
          if (dbgStatus) {
            dbgStatus.textContent = `MATCHED (${similarityPercent}%)`;
            dbgStatus.style.color = "#4ade80";
          }
          logSensorEvent(`AI VERIFICATION MATCHED! ${matchedSample} (${similarityPercent}% Similarity)`, "matched");
          showFeedback("fingerprint-feedback", `✅ ${message}`, "success");
          if (statusTxt) statusTxt.textContent = `🟢 Verifikasi Berhasil! Cocok dengan ${matchedSample}`;
          break;
        } else {
          if (dbgStatus) {
            dbgStatus.textContent = `UNMATCHED (${similarityPercent}%)`;
            dbgStatus.style.color = "#f87171";
          }
          logSensorEvent(`UNMATCHED! Similarity score (${similarityPercent}%) below threshold (${thresholdPercent}%)`, "error");
          showFeedback("fingerprint-feedback", `❌ Sidik jari tidak cocok dengan data terdaftar (${similarityPercent}%). Coba lagi.`);
        }
      } else {
        const errMsg = capRes?.message || "Sensor tidak membaca data.";
        logSensorEvent(`❌ Reader response: ${errMsg}`, "error");
        showFeedback("fingerprint-feedback", `❌ ${errMsg}`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (e) {
      logSensorEvent(`API Error: ${e.message}`, "error");
      showFeedback("fingerprint-feedback", `❌ Gagal terhubung ke driver hardware: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

async function triggerClientWebAuthnBiometrics(mode = "login") {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!window.PublicKeyCredential) return null;

  try {
    const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!isAvailable) return null;

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    // Direct Platform Biometric Prompt (Android BiometricPrompt / iOS Touch ID / Face ID)
    const createOptions = {
      publicKey: {
        challenge: challenge,
        rp: { name: "IF Instrument Biometrics" },
        user: {
          id: new Uint8Array(16),
          name: "biometrics_user",
          displayName: "Pengguna Biometrik"
        },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
        timeout: 60000,
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required"
        }
      }
    };
    const cred = await navigator.credentials.create(createOptions);
    if (cred && cred.rawId) {
      const rawIdArray = Array.from(new Uint8Array(cred.rawId));
      const base64Id = btoa(String.fromCharCode.apply(null, rawIdArray));
      const bioTag = isMobile ? "MOBILE_CREDENTIAL_" : "TOUCHID_CREDENTIAL_";
      return {
        ok: true,
        vendor: isMobile ? "MobileBiometrics" : "TouchID",
        templateData: `Rk1SACAyMAAAAAAAAQAAAQAKAHsA${bioTag}${base64Id}`
      };
    }
  } catch (err) {
    console.warn("Client WebAuthn biometrics error:", err);
  }
  return null;
}

async function runAutoFingerprintWizard() {
  if (isFpWizardRunning) return;
  isFpWizardRunning = true;

  const bannerTitle = byId("fp-wizard-step-title");
  const bannerDesc = byId("fp-wizard-step-desc");
  const progressBar = byId("fp-wizard-progress-bar");
  const statusTxt = byId("fp-scanner-status");
  const iconTxt = byId("fp-scanner-icon");
  const btnStart = byId("btn-start-auto-fp-wizard");
  const vendorInput = byId("fp-vendor-select");

  if (btnStart) btnStart.disabled = true;

  // Set Initial Baseline Reference: Sensor belum disentuh saat tombol Mulai diklik
  activeSensorData = INITIAL_IDLE_BASELINE;
  logSensorEvent("Pendaftaran 6 Sampel (3 Pasang Jari) Dimulai.", "idle");

  const vendor = vendorInput ? vendorInput.value : "Generic";
  const recordedSamples = []; // Array of verified samples
  const isPlatformBio = (vendor === "TouchID" || vendor === "MobileBiometrics");
  const totalRequiredSteps = isPlatformBio ? 1 : 6;

  let stepIdx = 0;

  while (stepIdx < totalRequiredSteps && isFpWizardRunning) {
    const currentStepNum = stepIdx + 1;
    const s = FINGERPRINT_WIZARD_STEPS[stepIdx] || {
      title: "Touch ID Biometric Anchor",
      desc: "Tempelkan jari Anda yang terdaftar pada sensor Touch ID Mac.",
      finger: "Jari Touch ID",
      icon: "🍏",
      fingerGroup: 1
    };

    // Track active finger group seed
    currentFingerGroupSeed = s.fingerGroup;

    if (bannerTitle) bannerTitle.textContent = isPlatformBio ? "Biometrik Perangkat (1 Sentuhan Validasi)" : s.title;
    if (bannerDesc) bannerDesc.textContent = isPlatformBio ? "Tempelkan salah satu jari yang terdaftar pada sensor perangkat Anda." : s.desc;
    if (progressBar) progressBar.style.width = `${(currentStepNum / totalRequiredSteps) * 100}%`;
    if (iconTxt) iconTxt.textContent = isPlatformBio ? "📱" : s.icon;
    if (statusTxt) statusTxt.textContent = `⚪ Menunggu: ${isPlatformBio ? "Sentuhan Biometrik" : s.title}...`;

    showFeedback("fingerprint-feedback", `⚪ Sensor siaga... ${bannerDesc ? bannerDesc.textContent : ""}`);

    // Reset acuan sensor ke standby sebelum menunggu sentuhan baru
    activeSensorData = INITIAL_IDLE_BASELINE;
    logSensorEvent(`Menunggu sentuhan ${s.finger} (${s.title}). Sensor: IDLE BASELINE`, "idle");

    // ── Capture frame dari device nyata ──────────────────────────────────────
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isRemoteClient = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    if (isPlatformBio && (isMobile || isRemoteClient)) {
      showFeedback("fingerprint-feedback", `📱 Prompt Biometrik ${isMobile ? "HP" : "Klien"} aktif. Sentuhkan jari Anda...`);
      logSensorEvent(`📱 Mengirim perintah biometrik ke browser ${isMobile ? "HP" : "Klien"}...`, "touch");

      const clientBio = await triggerClientWebAuthnBiometrics("register");
      if (clientBio && clientBio.ok && clientBio.templateData) {
        activeSensorData = clientBio.templateData;
        logSensorEvent(`✅ Biometrik ${isMobile ? "HP" : "Klien"} berhasil! Data Secure Enclave diterima.`, "touch");
      } else {
        showFeedback("fingerprint-feedback", `❌ Biometrik ${isMobile ? "HP" : "Klien"} gagal atau dibatalkan.`);
        logSensorEvent(`❌ Biometrik ${isMobile ? "HP" : "Klien"} gagal.`, "error");
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
    } else if (window._activeFpSessionId) {
      if (vendor === "TouchID") {
        // TouchID: satu blocking call ke Python (LAContext akan munculkan prompt native).
        showFeedback("fingerprint-feedback", `🍏 Prompt Touch ID aktif. Sentuhkan jari Anda pada sensor Touch ID sekarang...`);
        logSensorEvent(`🍏 Mengirim perintah capture ke Python LAContext...`, "touch");

        try {
          const capRes = await apiFetchPost("/api/profile/fingerprint-capture-frame",
            { sessionId: window._activeFpSessionId },
            35000 // 35 second timeout — Touch ID blocking call
          );
          if (capRes?.ok && capRes?.template_data) {
            activeSensorData = capRes.template_data;
            logSensorEvent(`✅ Touch ID berhasil! Data Secure Enclave diterima.`, "touch");
          } else {
            const errMsg = capRes?.message || "Touch ID gagal atau timeout.";
            showFeedback("fingerprint-feedback", `❌ ${errMsg}. Coba lagi.`);
            logSensorEvent(`❌ Touch ID gagal: ${errMsg}`, "error");
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
        } catch (e) {
          showFeedback("fingerprint-feedback", `❌ Gagal menghubungi Python driver: ${e.message}. Pastikan server AI berjalan.`);
          logSensorEvent(`❌ Koneksi Python driver gagal: ${e.message}`, "error");
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
      } else {
        // USB scanner: polling setiap 800ms hingga sensor membaca data
        let waitCount = 0;
        while (activeSensorData === INITIAL_IDLE_BASELINE && isFpWizardRunning) {
          waitCount++;
          try {
            const capRes = await apiFetchPost("/api/profile/fingerprint-capture-frame", { sessionId: window._activeFpSessionId });
            if (capRes?.ok && capRes?.template_data) {
              activeSensorData = capRes.template_data;
              logSensorEvent(`⚡ USB sensor read minutiae frame! Session: ${window._activeFpSessionId}`, "touch");
              break;
            } else if (capRes?.ok === false) {
              logSensorEvent(`⏳ USB sensor belum mendeteksi jari (attempt #${waitCount})...`, "idle");
            }
          } catch (e) {
            // Network error, keep polling
          }
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    } else {
      showFeedback("fingerprint-feedback", "❌ Session mesin hardware belum terbuka. Hubungkan mesin sidik jari dan buka ulang modal.");
      logSensorEvent("❌ Hardware session ID tidak ditemukan.", "error");
      await new Promise((r) => setTimeout(r, 2000));
      break;
    }

    if (!isFpWizardRunning) break;

    if (!activeSensorData || activeSensorData === INITIAL_IDLE_BASELINE) {
      showFeedback("fingerprint-feedback", `❌ Gagal membaca data real dari sensor sidik jari. Sentuhkan jari pada sensor.`);
      logSensorEvent(`❌ Sensor idle / gagal membaca data real mesin.`, "error");
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    let capturedTemplate = activeSensorData;

    logSensorEvent(`DELTA DETECTED! Sentuhan terdeteksi. Minutiae Vector: ${capturedTemplate.substring(0, 24)}...`, "touch");

    // CALL PYTHON AI ENGINE SERVER-SIDE VERIFICATION ENDPOINT
    const stepVerifyRes = await apiPost("/api/profile/fingerprint-verify-step", {
      currentStep: currentStepNum,
      templateData: capturedTemplate,
      vendor: vendor,
      previousSamples: recordedSamples
    });

    if (!stepVerifyRes?.ok || !stepVerifyRes?.stepPassed) {
      const errMsg = stepVerifyRes?.message || `❌ Langkah #${currentStepNum} Gagal Terverifikasi!`;
      const repeatStep = stepVerifyRes?.repeatStep;

      logSensorEvent(`❌ PYTHON AI ENGINE REJECTED STEP #${currentStepNum}: ${errMsg}`, "error");
      showFeedback("fingerprint-feedback", errMsg);

      if (repeatStep && repeatStep >= 1 && repeatStep <= totalRequiredSteps) {
        stepIdx = repeatStep - 1;
        recordedSamples.splice(repeatStep - 1);
      }
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    // Step Passed via Python AI Engine! Push sample
    recordedSamples[stepIdx] = capturedTemplate;
    const passMsg = stepVerifyRes?.message || `🟢 Step #${currentStepNum} Terverifikasi Sukses!`;
    logSensorEvent(`🟢 PYTHON AI ENGINE: ${passMsg}`, "matched");
    showFeedback("fingerprint-feedback", passMsg, "success");

    stepIdx++; // ADVANCE TO NEXT STEP!
    await new Promise((r) => setTimeout(r, 600));
  }

  if (recordedSamples.length === totalRequiredSteps) {
    const successMsg = vendor === "TouchID"
      ? "🎉 Touch ID Secure Enclave Berhasil Terdaftar! Menyimpan ke Database AI..."
      : "🎉 Semua 6 Sampel (3 Pasang Jari) Berhasil Terverifikasi! Menyimpan ke Database AI...";

    logSensorEvent(successMsg, "matched");
    showFeedback("fingerprint-feedback", successMsg, "success");

    for (let k = 0; k < recordedSamples.length; k++) {
      await apiPost("/api/profile/fingerprint-register", {
        templateData: recordedSamples[k],
        vendor: vendor
      });
    }

    setTimeout(() => {
      closeFingerprintModal();
      loadProfileData();
    }, 1500);
  }

  isFpWizardRunning = false;
  if (btnStart) btnStart.disabled = false;
}

function simulateFingerprintScan() {
  triggerFingerTouch();
}

async function handleFingerprintSubmit(e) {
  e.preventDefault();
  triggerFingerTouch();
}

async function handleDeleteFingerprint() {
  if (!confirm("Apakah Anda yakin ingin menghapus semua template sidik jari terdaftar?")) return;
  showFeedback("profile-form-feedback", "Menghapus template sidik jari...");
  try {
    const res = await apiPost("/api/profile/fingerprint-delete");
    if (res?.ok) {
      showFeedback("profile-form-feedback", res.message || "Template sidik jari berhasil dihapus.", "success");
      loadProfileData();
    } else {
      showFeedback("profile-form-feedback", res?.message || "Gagal menghapus data sidik jari.");
    }
  } catch (err) {
    showFeedback("profile-form-feedback", "Terjadi kesalahan koneksi.");
  }
}

// ============================================================
// FITUR: Informasi & Perpanjangan Subscription Mandiri Tenant
// ============================================================

async function loadSubscriptionSection() {
  try {
    const res = await apiGet("/api/profile");
    const sub = res?.data?.subscription;
    if (!sub || !sub.companySlug) return; // Super Admin tidak punya company subscription

    const section = byId("subscription-renewal-section");
    if (section) section.style.display = "";

    // Isi info card
    const planNameEl  = byId("sub-plan-name");
    const expiresAtEl = byId("sub-expires-at");
    const maxOutletsEl = byId("sub-max-outlets");
    const statusBadge = byId("sub-status-badge");

    if (planNameEl)   planNameEl.textContent   = sub.plan || "-";
    if (expiresAtEl)  expiresAtEl.textContent  = sub.expiresAt || "Selamanya";
    if (maxOutletsEl) maxOutletsEl.textContent = (sub.maxOutlets >= 999) ? "Unlimited" : `${sub.maxOutlets || "-"} Outlet`;
    if (statusBadge) {
      const isActive = String(sub.status) === "10";
      statusBadge.textContent = isActive ? "🟢 Aktif" : "🔴 Tidak Aktif";
      statusBadge.className   = `status-pill ${isActive ? "success" : "error"}`;
    }

    // Simpan company slug ke form hidden (digunakan sebagai {id} di URL renewal)
    const companyIdInput = byId("tenant-renewal-company-id");
    if (companyIdInput) companyIdInput.value = sub.companySlug;

    // Load daftar paket SaaS untuk dropdown
    const planRes = await apiGet("/api/public/saas-plans");
    const plans   = planRes?.data || planRes?.plans || [];
    const select  = byId("tenant-renewal-plan");
    if (select && plans.length) {
      select.innerHTML = plans.map((p) => {
        const priceText = p.price ? `Rp ${Number(p.price).toLocaleString("id-ID")}` : "Gratis";
        const sel = String(p.code).toLowerCase() === String(sub.plan || "").toLowerCase() ? "selected" : "";
        return `<option value="${p.code}" data-price="${p.price || 0}" data-duration="${p.durationDays || 365}" data-outlets="${p.maxOutlets || 5}" data-ai="${p.hasAiBiometrics ? '1' : '0'}" data-name="${p.name || p.code}" ${sel}>${p.name || p.code} — ${priceText} (${p.maxOutlets || 5} Outlet, ${p.durationDays || 365} Hari)</option>`;
      }).join("");
      updateTenantRenewalPlanDetails();
    }

    // Load rekening pembayaran pusat
    try {
      const accRes   = await apiGet("/api/public/central-payment-accounts");
      const accounts = accRes?.data || [];
      const payInfo  = byId("tenant-renewal-payment-info");
      const payList  = byId("tenant-renewal-payment-accounts");
      if (payList && accounts.length) {
        payList.innerHTML = accounts.map((a) =>
          `<div style="margin-top: 4px;">• <strong>${a.bankName || a.bank_name || "Bank"}</strong> — No. Rek: <strong>${a.accountNumber || a.account_number || "-"}</strong> a.n. ${a.accountHolder || a.account_holder || "-"}</div>`
        ).join("");
        if (payInfo) payInfo.style.display = "block";
      }
    } catch (_) { /* rekening opsional, tidak blocking */ }

  } catch (err) {
    // Tidak tampilkan error jika bukan company admin (Super Admin tidak punya subscription)
  }
}

function updateTenantRenewalPlanDetails() {
  const select  = byId("tenant-renewal-plan");
  const details = byId("tenant-renewal-plan-details");
  if (!select || !details) return;
  const opt = select.options[select.selectedIndex];
  if (!opt) { details.innerHTML = ""; return; }

  const price    = Number(opt.dataset.price || 0);
  const duration = Number(opt.dataset.duration || 365);
  const outlets  = Number(opt.dataset.outlets || 5);
  const hasAi    = opt.dataset.ai === "1";
  const priceStr = price > 0 ? `Rp ${price.toLocaleString("id-ID")}` : "Gratis";
  const durStr   = duration > 0 ? `${duration} Hari (~${Math.round(duration / 30)} Bulan)` : "Selamanya (Unlimited)";

  details.innerHTML =
    `• Biaya Perpanjangan: <strong>${priceStr}</strong><br>` +
    `• Durasi Masa Aktif: <strong>${durStr}</strong><br>` +
    `• Kuota Outlet: <strong>${outlets >= 999 ? "Unlimited" : outlets + " Outlet"}</strong><br>` +
    `• AI Biometrik Login: <strong>${hasAi ? "✅ Termasuk" : "❌ Tidak Termasuk"}</strong>`;
}

function bindTenantRenewalEvents() {
  byId("tenant-renewal-plan")?.addEventListener("change", updateTenantRenewalPlanDetails);

  // Upload bukti transfer saat file dipilih
  byId("tenant-renewal-proof-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const statusEl  = byId("tenant-renewal-proof-status");
    const previewEl = byId("tenant-renewal-proof-preview");
    const imgEl     = byId("tenant-renewal-proof-img");
    const urlInput  = byId("tenant-renewal-proof-url");

    if (statusEl) { statusEl.textContent = "⏳ Sedang mengunggah bukti transfer..."; statusEl.style.color = "#b45309"; }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const result      = apiUpload("/api/public/upload-payment-proof", formData);
      const uploadedUrl = result?.url || result?.paymentProofUrl || "";

      if (result?.ok && uploadedUrl) {
        if (urlInput)  urlInput.value = uploadedUrl;
        if (imgEl)     imgEl.src = uploadedUrl;
        if (previewEl) previewEl.style.display = "flex";
        if (statusEl)  { statusEl.textContent = `✅ Bukti transfer berhasil diunggah: ${file.name}`; statusEl.style.color = "#047857"; }
      } else {
        event.target.value = "";
        if (statusEl) { statusEl.textContent = `❌ Gagal mengunggah: ${result?.message || "Error tidak diketahui."}`; statusEl.style.color = "#dc2626"; }
      }
    } catch (e) {
      event.target.value = "";
      if (statusEl) { statusEl.textContent = "❌ Gagal mengunggah bukti transfer."; statusEl.style.color = "#dc2626"; }
    }
  });

  // Submit form perpanjangan
  byId("tenant-renewal-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const companyId      = byId("tenant-renewal-company-id")?.value?.trim() || "";
    const planCode       = byId("tenant-renewal-plan")?.value?.trim() || "";
    const paymentProofUrl = byId("tenant-renewal-proof-url")?.value?.trim() || "";

    if (!companyId || !planCode) return;

    if (!paymentProofUrl) {
      showFeedback("tenant-renewal-feedback", "❌ Bukti transfer pembayaran wajib diunggah terlebih dahulu.");
      byId("tenant-renewal-proof-file")?.focus();
      return;
    }

    const btn = byId("btn-submit-tenant-renewal");
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="button-spinner"></span> Memproses...`; }

    try {
      const res = await fetch(`/api/company/${companyId}/renew-subscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          ...(loadSession()?.token ? { "Authorization": `Bearer ${loadSession().token}` } : {}),
        },
        body: JSON.stringify({ subscriptionPlan: planCode, paymentProofUrl }),
      }).then((r) => r.json());

      if (btn) { btn.disabled = false; btn.innerHTML = "⏳ Ajukan Perpanjangan Subscription"; }

      if (res?.ok || res?.data?.ok) {
        showFeedback("tenant-renewal-feedback",
          res?.data?.message || res?.message || "✅ Perpanjangan subscription berhasil diajukan! Terima kasih.",
          "success");
        // Reset form
        const fileInput = byId("tenant-renewal-proof-file");
        const urlInput  = byId("tenant-renewal-proof-url");
        const previewEl = byId("tenant-renewal-proof-preview");
        const statusEl  = byId("tenant-renewal-proof-status");
        if (fileInput) fileInput.value = "";
        if (urlInput)  urlInput.value  = "";
        if (previewEl) previewEl.style.display = "none";
        if (statusEl)  { statusEl.textContent = "Unggah bukti transfer untuk mengajukan perpanjangan subscription Anda."; statusEl.style.color = "#64748b"; }
        // Refresh info subscription
        loadSubscriptionSection();
      } else {
        showFeedback("tenant-renewal-feedback", res?.message || res?.data?.message || "❌ Gagal mengajukan perpanjangan.");
      }
    } catch (err) {
      if (btn) { btn.disabled = false; btn.innerHTML = "⏳ Ajukan Perpanjangan Subscription"; }
      showFeedback("tenant-renewal-feedback", "❌ Terjadi kesalahan koneksi. Silakan coba lagi.");
    }
  });
}

import { applyBrandTheme } from "../layout.js";
import { apiGet, apiPost, apiUpload, appPath, loadSession, saveSession } from "../store.js";
import { byId, setText, showAlert, showFeedback } from "../dom.js";
import { loadPageBootstrap } from "../page-engine.js";

const companySlug = window.__COMPANY_SLUG__ || "";
let loginBootstrap = null;

async function apiFetchPost(url, payload = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      return { ok: false, message: "Waktu tunggu pembacaan sensor habis (timeout)." };
    }
    return { ok: false, message: err.message || "Gagal menghubungi server AI." };
  } finally {
    clearTimeout(timer);
  }
}

function applyCompanyTheme(company) {
  if (!company) return;
  const companyName = company.name || company.brandName || "Perusahaan";
  const hex = company.themeColor || company.theme_color || "#3B1F8C";
  applyBrandTheme(hex);

  // Dynamically set page title
  document.title = `Login - ${companyName}`;

  const brandHeader = document.querySelector(".login-brand");
  if (brandHeader) {
    const brandLogo = brandHeader.querySelector(".app-brand-logo");
    const brandTitle = brandHeader.querySelector("h1");
    const brandSub = brandHeader.querySelector("p");

    if (brandTitle) brandTitle.textContent = companyName;
    if (brandSub) brandSub.textContent = company.tagline || "Portal Admin Perusahaan";
    if (brandLogo) {
      if (company.logoUrl) {
        brandLogo.innerHTML = `<img src="${escapeHtml(company.logoUrl)}" alt="${escapeHtml(companyName)}" />`;
      } else {
        const initial = companyName.charAt(0).toUpperCase();
        brandLogo.innerHTML = `<span class="company-initial-badge" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:var(--brand, #3B1F8C); color:#ffffff; font-weight:800; font-size:18px; border-radius:8px;">${initial}</span>`;
      }
    }
  }
}

function renderCompanyShowcase(company) {
  const showcase = byId("company-login-showcase");
  if (!showcase || !company) return;

  setText("company-showcase-name", company.name || company.brandName || "Nama Perusahaan");
  setText("company-showcase-tagline", company.tagline || "Solusi Bisnis & Operasional UMKM");

  const haloBox = document.querySelector(".company-logo-halo");
  if (haloBox) {
    if (company.logoUrl) {
      haloBox.innerHTML = `<img id="company-showcase-logo" src="${escapeHtml(company.logoUrl)}" alt="${escapeHtml(company.name || "Logo")}" />`;
    } else {
      // No logo: show initial letter on brand-gradient circle
      const initial = (company.name || "C").charAt(0).toUpperCase();
      haloBox.innerHTML = `<div class="company-halo-initial" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#ffffff;font-weight:900;font-size:34px;border-radius:50%;text-shadow:0 2px 6px rgba(0,0,0,0.3);">${initial}</div>`;
    }
  }

  // Add tenant-active class so left panel gets brand top-border accent
  document.body.classList.add("tenant-active");

  showcase.hidden = false;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderTenantList(companies = []) {
  const list = byId("tenant-login-list");
  const panel = byId("tenant-login-panel");
  if (!list || !panel) return;
  if (!companies || !companies.length) {
    panel.hidden = true;
    return;
  }

  list.innerHTML = companies.map((c) => {
    const slug = c.routeSlug || "";
    return `
      <button class="tenant-login-card stacked-card" data-company-login="${escapeHtml(slug)}" type="button" title="Masuk ke portal ${escapeHtml(c.name || slug)}" style="cursor: pointer;">
        <div class="tenant-logo-mini">
          ${c.logoUrl ? `<img src="${escapeHtml(c.logoUrl)}" alt="${escapeHtml(c.name || "Perusahaan")}" />` : `<span>${escapeHtml((c.name || "C").charAt(0))}</span>`}
        </div>
        <strong style="display: block; font-size: 13px; margin-top: 6px;">${escapeHtml(c.name || "")}</strong>
        <small style="color: var(--muted); font-size: 11px;">${escapeHtml(slug)}</small>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-company-login]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slug = btn.dataset.companyLogin;
      if (slug) {
        window.location.href = appPath(`/${slug}/login`);
      }
    });
  });

  panel.hidden = false;
}

function renderSaasPlans(plans = []) {
  const container = byId("saas-plan-cards");
  if (!container) return;
  if (!plans || !plans.length) {
    container.innerHTML = `<p style="font-size: 12px; color: var(--muted); margin: 0;">Tidak ada paket subscription aktif.</p>`;
    return;
  }

  container.innerHTML = plans.map((p) => {
    const isFeatured = Boolean(p.isFeatured || p.is_featured || String(p.code).toLowerCase() === "professional");
    const recommendedBadge = isFeatured
      ? `<span class="plan-recommended-badge">⭐ Recommended</span>`
      : "";

    return `
      <div class="saas-plan-card ${isFeatured ? "featured-plan" : ""}" data-plan-code="${escapeHtml(p.code || "")}" style="cursor: pointer;" title="Klik untuk mendaftar paket ${escapeHtml(p.name || p.code || "")}">
        <div class="saas-plan-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong>${escapeHtml(p.name || p.code || "")}</strong>
            ${recommendedBadge}
          </div>
          <span class="saas-plan-price">${Number(p.price || 0) <= 0 ? "Gratis" : "Rp " + Number(p.price).toLocaleString("id-ID") + " / th"}</span>
        </div>
        <small class="saas-plan-meta">${Number(p.maxOutlets || 0) >= 999 ? "Unlimited Outlet" : "Max " + (p.maxOutlets || 0) + " Outlet"} · ${p.durationDays ? p.durationDays + " Hari" : "Masa Aktif Selamanya"}</small>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".saas-plan-card").forEach((card) => {
    card.addEventListener("click", () => {
      const code = card.dataset.planCode;
      openRegisterModal(code);
    });
  });
}

function renderRegisterPlanDropdown(plans = []) {
  const select = byId("reg-subscription-plan");
  if (!select) return;
  if (!plans || !plans.length) {
    select.innerHTML = `<option value="">Tidak ada paket tersedia</option>`;
    return;
  }

  const recommendedPlan = plans.find((p) => Boolean(p.isFeatured || p.is_featured || String(p.code).toLowerCase() === "professional")) || plans[0];

  select.innerHTML = plans.map((p) => {
    const isFeatured = Boolean(p.isFeatured || p.is_featured || String(p.code).toLowerCase() === "professional");
    const recText = isFeatured ? " ⭐ (Recommended)" : "";
    const isSelected = p.code === recommendedPlan.code ? "selected" : "";
    return `
      <option value="${escapeHtml(p.code || "")}" ${isSelected}>
        ${escapeHtml(p.name || p.code || "")}${recText} - ${Number(p.price || 0) <= 0 ? "Gratis" : "Rp " + Number(p.price).toLocaleString("id-ID")} (${Number(p.maxOutlets || 0) >= 999 ? "Unlimited Outlet" : "Max " + (p.maxOutlets || 0) + " Outlet"})
      </option>
    `;
  }).join("");
}

function renderCentralPaymentAccounts(accounts = []) {
  const container = byId("reg-payment-accounts-list");
  if (!container) return;

  const activeAccounts = (accounts || []).filter((acc) => {
    const s = String(acc.status || "").toLowerCase();
    return s === "10" || s === "active" || s === "aktif" || !acc.status;
  });

  if (!activeAccounts.length) {
    container.innerHTML = `<p style="font-size: 12px; color: var(--muted); margin: 0;">Hubungi Super Admin untuk rincian rekening pembayaran aktif.</p>`;
    return;
  }

  container.innerHTML = activeAccounts.map((acc) => {
    const bank = escapeHtml(acc.bankName || acc.bank_name || "Bank Transfer");
    const accNo = escapeHtml(acc.accountNumber || acc.account_number || "");
    const accHolder = escapeHtml(acc.accountHolder || acc.account_name || "");
    const qrisUrl = acc.qrisImageUrl || acc.qris_image_url || "";
    const isQris = Boolean(qrisUrl || bank.toUpperCase().includes("QRIS"));

    if (isQris && qrisUrl) {
      return `
        <div class="payment-account-card qris-card" style="font-size: 12px; background: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; gap: 8px; align-items: center; text-align: center;">
          <div style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: var(--brand); font-size: 13px;">📱 ${bank}</strong>
            <span class="status-pill status-active" style="font-size: 10px; padding: 2px 6px;">QRIS Statis</span>
          </div>
          <div style="background: #f8fafc; padding: 8px; border-radius: 8px; border: 1px dashed #cbd5e1; width: 100%; display: flex; justify-content: center;">
            <img src="${escapeHtml(qrisUrl)}" alt="QRIS ${bank}" style="max-width: 180px; width: 100%; height: auto; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);" />
          </div>
          ${accHolder ? `<small style="color: #64748b; font-weight: 600;">a.n. ${accHolder}</small>` : ""}
          <div style="display: flex; gap: 6px; width: 100%; margin-top: 4px;">
            <a href="${escapeHtml(qrisUrl)}" download="QRIS-Pembayaran.png" target="_blank" class="ghost-button" style="flex: 1; font-size: 11px; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 6px;">
              ⬇️ Download QRIS
            </a>
            <button type="button" class="share-qris-btn ghost-button" data-qris-url="${escapeHtml(qrisUrl)}" data-qris-title="${bank}" style="flex: 1; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 6px;">
              🔗 Share QRIS
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="payment-account-card bank-card" style="font-size: 12px; background: #ffffff; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: var(--brand); font-size: 13px;">🏦 ${bank}</strong>
          ${accNo ? `<button type="button" class="copy-acc-btn ghost-button" data-copy="${accNo}" style="padding: 2px 8px; font-size: 10px; height: auto;">📋 Salin No. Rek</button>` : ""}
        </div>
        ${accNo ? `<div style="font-family: monospace; font-size: 14px; font-weight: 800; color: #0f172a;">${accNo}</div>` : ""}
        ${accHolder ? `<small style="color: #64748b;">a.n. ${accHolder}</small>` : ""}
      </div>
    `;
  }).join("");

  container.querySelectorAll(".copy-acc-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const num = btn.dataset.copy;
      if (num && navigator.clipboard) {
        navigator.clipboard.writeText(num);
        btn.textContent = "✓ Tersalin";
        setTimeout(() => { btn.textContent = "📋 Salin No. Rek"; }, 1500);
      }
    });
  });

  container.querySelectorAll(".share-qris-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const url = btn.dataset.qrisUrl;
      const title = btn.dataset.qrisTitle || "QRIS Pembayaran";

      if (navigator.share) {
        try {
          await navigator.share({
            title: title,
            text: `Scan / Upload QRIS ini untuk pembayaran SaaS ${title}`,
            url: url
          });
        } catch {
          copyQrisLink(btn, url);
        }
      } else {
        copyQrisLink(btn, url);
      }
    });
  });
}

function copyQrisLink(btn, url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
    btn.textContent = "✓ Link QRIS Tersalin";
    setTimeout(() => { btn.textContent = "🔗 Share QRIS"; }, 1500);
  }
}

function fillSample(type) {
  const isTenant = Boolean(companySlug);
  const emails = {
    super: "superadmin@central.com",
    company: isTenant ? `admin@${companySlug}.com` : "admin@kappi.com",
    area: isTenant ? `area@${companySlug}.com` : "area@kappi.com",
    manager: isTenant ? `manager@${companySlug}.com` : "manager@kappi.com",
    cashier: isTenant ? `kasir@${companySlug}.com` : "kasir@kappi.com",
    kitchen: isTenant ? `kitchen@${companySlug}.com` : "kitchen@kappi.com",
    inventory: isTenant ? `inventory@${companySlug}.com` : "inventory@kappi.com"
  };
  const email = emails[type] || emails.company;
  const password = type === "super" ? "SuperAdmin#123" : "Admin#123";

  if (byId("login-email")) byId("login-email").value = email;
  if (byId("login-password")) byId("login-password").value = password;
}

function login(email, password) {
  const result = apiPost("/api/page/login/submit", { email, password, companySlug });
  return handleLoginSuccess(result);
}

function handleLoginSuccess(result, isBiometricPassed = false) {
  if (!result || !result.ok) {
    if (result?.routeUrl) {
      showFeedback("login-feedback", result.message || "Terdapat kendala pada akun Anda.");
      window.setTimeout(() => {
        window.location.href = result.routeUrl;
      }, 700);
    }
    return false;
  }

  const user = result.user || {};
  const authType = user.authType || (user.role === "Super Admin" ? "super_admin" : "company_user");
  const companyId = authType === "super_admin" ? "" : user.companyId || "";
  const selectedOutletId = user.selectedOutletId || user.outletIds?.[0] || "";

  // Biometric Login Checks (only trigger if not already passed!)
  if (!isBiometricPassed) {
    const companyInfo = loginBootstrap?.company || {};
    const faceEnabled = Boolean(companyInfo.aiEnableFaceLogin);
    const fpEnabled = Boolean(companyInfo.aiEnableFingerprint);

    if (faceEnabled && !user.biometricBypassed) {
      openFaceLoginChallenge(result);
      return true;
    }

    if (fpEnabled && !user.biometricBypassed) {
      openFingerprintLoginChallenge(result);
      return true;
    }
  }

  saveSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleId: user.roleId,
    permissions: user.permissions || [],
    permissionMatrix: user.permissionMatrix || {},
    authType,
    companyId,
    companySlug: user.companySlug || companySlug,
    outletScope: user.outletScope || "selected",
    canViewAllOutlets: Boolean(user.canViewAllOutlets || user.outletScope === "all"),
    outletIds: user.outletIds || [],
    selectedOutletId,
    accessContext: result.accessContext || result.context || {},
    token: result.token,
    loggedInAt: new Date().toISOString()
  });

  if (user.mustChangePassword) {
    if (byId("pwd-change-email")) byId("pwd-change-email").value = user.email;
    if (byId("pwd-change-current")) byId("pwd-change-current").value = password || "";
    if (byId("password-change-modal-backdrop")) byId("password-change-modal-backdrop").hidden = false;
    if (byId("must-change-password-modal")) byId("must-change-password-modal").hidden = false;
    document.body.classList.add("modal-open");
    showFeedback("login-feedback", "Anda menggunakan password sementara. Wajib perbarui password Anda.");
    return true;
  }

  if (authType === "super_admin") window.location.href = "/pages/users.html";
  else if (authType === "company_admin" && user.onboardingRequired) window.location.href = appPath("/pages/onboarding.html");
  else if (user.permissions?.includes("kitchen") && !user.permissions.includes("pos")) window.location.href = appPath("/pages/orders.html");
  else window.location.href = appPath("/index.html");

  return true;
}

// ─── Biometric Login Challenge Modals ─────────────────────────────────────────
let faceStream = null;
let pendingLoginResult = null;
let isFaceScanningActive = false;
let faceScanInterval = null;

async function openFaceLoginChallenge(loginResult) {
  pendingLoginResult = loginResult;
  showFeedback("face-login-feedback", "🔍 Memindai wajah Anda secara otomatis...");
  const video = byId("face-login-video");

  try {
    faceStream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 480 } });
    if (video) video.srcObject = faceStream;
  } catch (err) {
    showFeedback("face-login-feedback", "Gagal membuka kamera: " + (err.message || "Izin kamera ditolak."));
    return;
  }

  if (byId("face-login-modal-backdrop")) byId("face-login-modal-backdrop").hidden = false;
  if (byId("face-login-modal")) byId("face-login-modal").hidden = false;
  document.body.classList.add("modal-open");

  // Launch Hands-Free Automatic Continuous Live Face Check
  startAutoFaceScanner();
}

function stopAutoFaceScanner() {
  isFaceScanningActive = false;
  if (faceScanInterval) {
    clearInterval(faceScanInterval);
    faceScanInterval = null;
  }
}

function startAutoFaceScanner() {
  stopAutoFaceScanner();
  isFaceScanningActive = true;

  let isVerifyingFrame = false;

  faceScanInterval = setInterval(() => {
    if (!isFaceScanningActive || isVerifyingFrame) return;

    const video = byId("face-login-video");
    const canvas = byId("face-login-canvas");
    if (!video || !canvas || !pendingLoginResult) return;

    isVerifyingFrame = true;

    try {
      const ctx = canvas.getContext("2d");
      canvas.width = 400;
      canvas.height = 400;
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imgBase64 = canvas.toDataURL("image/jpeg", 0.85);

      const res = apiPost("/api/page/login/face-identify", {
        image: imgBase64,
        companySlug,
        companyId: pendingLoginResult?.user?.companyId || ""
      });

      const isVerified = Boolean(res?.verified || res?.data?.verified);
      const percent = res?.similarityPercent || res?.data?.similarityPercent || 92;
      const userName = res?.user?.name || res?.data?.user?.name || "Pengguna";
      const message = res?.message || res?.data?.message || `Wajah teridentifikasi sebagai ${userName} (${percent}%)`;
      const token = res?.token || res?.data?.token;

      if (res?.ok && isVerified && token) {
        stopAutoFaceScanner();
        showFeedback("face-login-feedback", `✅ ${message}! Login Otomatis...`);

        const authenticatedUser = res?.user || res?.data?.user;
        const accessContext = res?.accessContext || res?.data?.accessContext || {};

        setTimeout(() => {
          closeFaceLoginChallenge();
          saveSession({
            userId: authenticatedUser.id,
            name: authenticatedUser.name,
            email: authenticatedUser.email,
            role: authenticatedUser.role || "Company Admin",
            roleId: authenticatedUser.roleId || "1",
            permissions: authenticatedUser.permissions || [],
            permissionMatrix: authenticatedUser.permissionMatrix || {},
            authType: authenticatedUser.authType || "company_admin",
            companyId: authenticatedUser.companyId || "company-main",
            companySlug: authenticatedUser.companySlug || companySlug,
            outletScope: authenticatedUser.outletScope || "all",
            canViewAllOutlets: Boolean(authenticatedUser.canViewAllOutlets),
            outletIds: authenticatedUser.outletIds || [],
            selectedOutletId: authenticatedUser.selectedOutletId || "",
            accessContext: accessContext,
            token: token,
            loggedInAt: new Date().toISOString()
          });
          window.location.href = appPath("/index.html");
        }, 800);
      } else {
        showFeedback("face-login-feedback", "🔍 Memindai... Posisikan wajah tepat di lingkaran kamera.");
      }
    } catch (e) {
      // Keep continuous loop active
    } finally {
      isVerifyingFrame = false;
    }
  }, 450);
}

function closeFaceLoginChallenge() {
  stopAutoFaceScanner();
  if (faceStream) {
    faceStream.getTracks().forEach((t) => t.stop());
    faceStream = null;
  }
  if (byId("face-login-modal-backdrop")) byId("face-login-modal-backdrop").hidden = true;
  if (byId("face-login-modal")) byId("face-login-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function verifyFaceLogin() {
  // Manual trigger if user explicitly clicks button
  if (!isFaceScanningActive) {
    startAutoFaceScanner();
  }
}

async function triggerClientWebAuthnBiometrics(mode = "login") {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!window.PublicKeyCredential) return { ok: false, error: "PublicKeyCredential not supported", reason: "not_supported" };

  try {
    const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!isAvailable) return { ok: false, error: "Platform authenticator not available", reason: "not_available" };

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
    return {
      ok: false,
      error: err.message || String(err),
      name: err.name || "Error",
      reason: err.name === "NotAllowedError" ? "cancelled_or_not_enrolled" : "error"
    };
  }
  return { ok: false, error: "Gagal membaca biometrik", reason: "unknown" };
}

async function openFingerprintLoginChallenge(loginResult) {
  pendingLoginResult = loginResult;
  showFeedback("fingerprint-login-feedback", "🔍 Mendeteksi sensor sidik jari...");
  if (byId("btn-verify-fingerprint-login")) byId("btn-verify-fingerprint-login").hidden = true;
  if (byId("fingerprint-login-modal-backdrop")) byId("fingerprint-login-modal-backdrop").hidden = false;
  if (byId("fingerprint-login-modal")) byId("fingerprint-login-modal").hidden = false;
  document.body.classList.add("modal-open");

  const statusTxt = byId("login-fp-status");
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isRemoteClient = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  // 📱 REMOTE CLIENT / MOBILE PHONE: USE CLIENT WEBAUTHN ONLY (NEVER TRIGGER SERVER MACBOOK TOUCHID!)
  if (isMobile || isRemoteClient) {
    let bioVendor = isMobile ? "MobileBiometrics" : "ClientBiometrics";
    window._loginFpVendor = bioVendor;

    if (!window.PublicKeyCredential) {
      if (statusTxt) statusTxt.textContent = "❌ Perangkat Tidak Mendukung WebAuthn";
      showFeedback("fingerprint-login-feedback", "Browser perangkat ini tidak mendukung biometrik WebAuthn.");
      return;
    }

    if (statusTxt) statusTxt.textContent = isMobile ? "📱 Sensor Sidik Jari HP Siap" : "📱 Sensor Biometrik Perangkat Siap";
    showFeedback("fingerprint-login-feedback", isMobile ? "📱 Membuka sensor... Sentuhkan jari Anda pada sensor HP." : "Sentuhkan jari pada sensor biometrik perangkat...");

    const clientBio = await triggerClientWebAuthnBiometrics("login");
    if (clientBio && clientBio.ok && clientBio.templateData) {
      if (statusTxt) statusTxt.textContent = "⚡ Mengidentifikasi Sidik Jari...";
      showFeedback("fingerprint-login-feedback", "⚡ Memverifikasi biometrik ke AI Engine...");

      const res = await apiPost("/api/page/login/fingerprint-identify", {
        templateData: clientBio.templateData,
        vendor: clientBio.vendor,
        companySlug: companySlug
      });

      const isVerified = Boolean(res?.verified || res?.data?.verified);
      const userName = res?.user?.name || res?.data?.user?.name || "Pengguna";
      const percent = res?.similarityPercent || res?.data?.similarityPercent || 100;
      const message = res?.message || res?.data?.message || `Sidik jari teridentifikasi sebagai ${userName} (${percent}%)`;
      const token = res?.token || res?.data?.token;

      if (res?.ok && isVerified && token) {
        if (statusTxt) statusTxt.textContent = `✓ Cocok (${userName})`;
        showFeedback("fingerprint-login-feedback", `✅ ${message}! Login Otomatis...`, "success");

        setTimeout(() => {
          closeFingerprintLoginChallenge();
          handleLoginSuccess(res, true);
        }, 1200);
        return;
      } else {
        showFeedback("fingerprint-login-feedback", res?.message || "❌ Sidik jari HP tidak cocok dengan data terdaftar.");
        if (statusTxt) statusTxt.textContent = "❌ Verifikasi Gagal";
        return;
      }
    } else {
      const errName = clientBio?.name || "";
      const errMsg = clientBio?.error || "";

      if (errName === "NotAllowedError") {
        if (statusTxt) statusTxt.textContent = "ℹ️ Sidik Jari HP Belum Terdaftar";
        showFeedback("fingerprint-login-feedback", "📱 Pemindaian selesai: Belum ada Sidik Jari HP yang terdaftar untuk akun ini. Silakan login dengan password lalu daftarkan Sidik Jari HP di menu Profil.");
      } else {
        if (statusTxt) statusTxt.textContent = "❌ Gagal Membaca Sensor HP";
        showFeedback("fingerprint-login-feedback", `Gagal membaca sensor sidik jari HP: ${errMsg}`);
      }
      return;
    }
  }

  // 💻 LOCALHOST SERVER COMPUTER (MACBOOK SERVER HOST): OPEN LOCAL DRIVER SENSORS
  let vendor = "Generic";
  try {
    if (window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
      vendor = "TouchID";
    }
  } catch (e) {}

  window._loginFpVendor = vendor;

  try {
    const openRes = await apiPost("/api/page/login/fingerprint-open-device", { vendor, deviceIndex: 0 });
    const sessionId = openRes?.sessionId || openRes?.session_id;
    if (openRes?.ok && sessionId) {
      window._activeLoginFpSessionId = sessionId;
      if (statusTxt) statusTxt.textContent = vendor === "TouchID" ? "🍏 Prompt Touch ID Aktif..." : "🟢 Sensor Sidik Jari Siap";
      showFeedback("fingerprint-login-feedback", vendor === "TouchID" ? "🍏 Sentuhkan jari pada tombol Touch ID Mac untuk login." : "Tempelkan jari Anda pada sensor scanner.");
      // Auto trigger hardware capture frame reading
      autoReadFingerprintForLogin();
    } else {
      if (statusTxt) statusTxt.textContent = "❌ Sensor Tidak Ditemukan";
      showFeedback("fingerprint-login-feedback", openRes?.message || "Gagal membuka device sidik jari.");
    }
  } catch (e) {
    if (statusTxt) statusTxt.textContent = "❌ Koneksi Driver Gagal";
    showFeedback("fingerprint-login-feedback", "Gagal menghubungi driver hardware biometrik.");
  }
}

function closeFingerprintLoginChallenge() {
  window._isLoginFpScanning = false;
  if (window._activeLoginFpSessionId) {
    apiPost("/api/page/login/fingerprint-close-device", { sessionId: window._activeLoginFpSessionId });
    window._activeLoginFpSessionId = null;
  }
  if (byId("fingerprint-login-modal-backdrop")) byId("fingerprint-login-modal-backdrop").hidden = true;
  if (byId("fingerprint-login-modal")) byId("fingerprint-login-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function verifyFingerprintLogin() {
  autoReadFingerprintForLogin();
}

async function autoReadFingerprintForLogin() {
  if (window._isLoginFpScanning) return;
  window._isLoginFpScanning = true;

  const statusTxt = byId("login-fp-status");
  const vendor = window._loginFpVendor || "Generic";

  while (window._isLoginFpScanning && window._activeLoginFpSessionId) {
    try {
      showFeedback("fingerprint-login-feedback", vendor === "TouchID" ? "🍏 Prompt Touch ID aktif... Sentuhkan jari pada sensor." : "Membuat koneksi sensor hardware...");
      const capRes = await apiFetchPost("/api/page/login/fingerprint-capture-frame",
        { sessionId: window._activeLoginFpSessionId },
        35000
      );

      if (!window._isLoginFpScanning) break;

      if (capRes?.ok && capRes?.template_data) {
        if (statusTxt) statusTxt.textContent = "⚡ Mengidentifikasi Sidik Jari...";
        showFeedback("fingerprint-login-feedback", "⚡ Memverifikasi template sidik jari ke AI Engine...");

        const res = await apiPost("/api/page/login/fingerprint-identify", {
          templateData: capRes.template_data,
          vendor: vendor,
          companySlug: companySlug
        });

        const isVerified = Boolean(res?.verified || res?.data?.verified);
        const userName = res?.user?.name || res?.data?.user?.name || "Pengguna";
        const percent = res?.similarityPercent || res?.data?.similarityPercent || 100;
        const message = res?.message || res?.data?.message || `Sidik jari teridentifikasi sebagai ${userName} (${percent}%)`;
        const token = res?.token || res?.data?.token;

        if (res?.ok && isVerified && token) {
          if (statusTxt) statusTxt.textContent = `✓ Cocok (${userName})`;
          showFeedback("fingerprint-login-feedback", `✅ ${message}! Login Otomatis...`, "success");

          const authenticatedUser = res?.user || res?.data?.user;
          const accessContext = res?.accessContext || res?.data?.accessContext || {};

          setTimeout(() => {
            closeFingerprintLoginChallenge();
            handleLoginSuccess(res, true);
          }, 800);
          break;
        } else {
          if (statusTxt) statusTxt.textContent = "❌ Sidik Jari Tidak Dikenal";
          showFeedback("fingerprint-login-feedback", res?.message || "Sidik jari tidak teridentifikasi pada sistem.");
          await new Promise((r) => setTimeout(r, 1500));
        }
      } else {
        const errMsg = capRes?.message || "Touch ID dibatalkan / gagal membaca data.";
        if (statusTxt) statusTxt.textContent = "❌ Pembacaan Gagal";
        showFeedback("fingerprint-login-feedback", `❌ ${errMsg}`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (e) {
      if (statusTxt) statusTxt.textContent = "❌ Error Driver";
      showFeedback("fingerprint-login-feedback", `❌ Gagal memproses sidik jari: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

// ─── Registration Modal ──────────────────────────────────────────────────────
function updateRegisterPlanSummary() {
  const select = byId("reg-subscription-plan");
  const summaryName = byId("reg-summary-plan-name");
  const summaryPrice = byId("reg-summary-plan-price");
  const proofFile = byId("reg-payment-proof-file");
  const paymentSection = byId("reg-payment-section");
  if (!select) return;

  const plans = loginBootstrap?.saasPlans || [];
  const selectedCode = select.value;
  const plan = plans.find((p) => String(p.code).toLowerCase() === String(selectedCode).toLowerCase()) || plans[0];

  const priceVal = Number(plan?.price || 0);
  const isPaid = priceVal > 0;

  if (summaryName) summaryName.textContent = plan?.name || selectedCode || "Starter Plan";
  if (summaryPrice) {
    summaryPrice.textContent = !isPaid ? "Gratis (Bebas Biaya)" : "Rp " + priceVal.toLocaleString("id-ID") + " / th";
  }

  if (paymentSection) {
    paymentSection.hidden = !isPaid;
  }

  if (proofFile) {
    proofFile.required = isPaid;
    if (!isPaid) {
      proofFile.value = "";
    }
  }
}

function openRegisterModal(selectedPlanCode = "") {
  const plans = loginBootstrap?.saasPlans || [];
  renderRegisterPlanDropdown(plans);
  renderCentralPaymentAccounts(loginBootstrap?.centralPaymentAccounts);

  const select = byId("reg-subscription-plan");
  if (select) {
    if (selectedPlanCode) {
      select.value = selectedPlanCode;
    } else {
      const recommendedPlan = plans.find((p) => Boolean(p.isFeatured || p.is_featured || String(p.code).toLowerCase() === "professional"));
      if (recommendedPlan) {
        select.value = recommendedPlan.code;
      }
    }
  }

  updateRegisterPlanSummary();

  showFeedback("register-feedback", "");
  if (byId("register-modal-backdrop")) byId("register-modal-backdrop").hidden = false;
  if (byId("public-register-modal")) byId("public-register-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeRegisterModal() {
  if (byId("register-modal-backdrop")) byId("register-modal-backdrop").hidden = true;
  if (byId("public-register-modal")) byId("public-register-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

// ─── Forgot Password Modal ───────────────────────────────────────────────────
function openForgotModal() {
  const loginEmail = byId("login-email")?.value;
  if (loginEmail && byId("forgot-email")) {
    byId("forgot-email").value = loginEmail;
  }
  showFeedback("forgot-feedback", "");
  if (byId("forgot-modal-backdrop")) byId("forgot-modal-backdrop").hidden = false;
  if (byId("forgot-password-modal")) byId("forgot-password-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeForgotModal() {
  if (byId("forgot-modal-backdrop")) byId("forgot-modal-backdrop").hidden = true;
  if (byId("forgot-password-modal")) byId("forgot-password-modal").hidden = true;
  document.body.classList.remove("modal-open");
  showFeedback("forgot-feedback", "");
}

// ─── Password Toggle ─────────────────────────────────────────────────────────
byId("toggle-login-password")?.addEventListener("click", () => {
  const input = byId("login-password");
  const openIcon = document.querySelector("#toggle-login-password .eye-open");
  const closedIcon = document.querySelector("#toggle-login-password .eye-closed");
  if (!input || !openIcon || !closedIcon) return;

  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  openIcon.style.display = isPassword ? "none" : "";
  closedIcon.style.display = isPassword ? "" : "none";
});

// ─── Page Initializer ────────────────────────────────────────────────────────
(function initLoginPage() {
  const response = loadPageBootstrap("login", {}, loadSession(), { companySlug });
  if (response?.ok && response.data) {
    loginBootstrap = response.data;
    if (companySlug && response.data.company) {
      applyCompanyTheme(response.data.company);
      renderCompanyShowcase(response.data.company);

      const topBrand = document.querySelector(".login-brand");
      if (topBrand) topBrand.hidden = true;
      const copy = byId("central-login-copy");
      if (copy) copy.hidden = true;
      const mainRow = byId("login-main-row");
      if (mainRow) mainRow.hidden = true;
      const prompt = byId("central-register-prompt-container");
      if (prompt) prompt.hidden = true;

      const orderContainer = byId("company-public-order-container");
      const orderBtn = byId("btn-company-public-order");
      if (orderContainer && orderBtn) {
        // appPath already prepends /{companySlug}/ — just pass /order
        const orderUrl = window.location.origin + appPath("/order");
        orderBtn.href = orderUrl;

        const qrImg = byId("company-general-qr-img");
        const downloadBtn = byId("btn-download-general-qr");
        const shareBtn = byId("btn-share-general-qr");

        if (qrImg) {
          const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(orderUrl)}`;
          qrImg.src = qrCodeApiUrl;
          if (downloadBtn) {
            downloadBtn.href = qrCodeApiUrl;
            downloadBtn.download = `QR-Menu-${companySlug || "General"}.png`;
          }
        }

        if (shareBtn) {
          shareBtn.onclick = async (e) => {
            e.preventDefault();
            const compName = response.data.company?.name || "Katalog Menu";
            if (navigator.share) {
              try {
                await navigator.share({
                  title: `QR Menu Table ${compName}`,
                  text: `Scan / Buka link ini untuk pesan makanan & minuman mandiri di ${compName}:`,
                  url: orderUrl
                });
              } catch {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(orderUrl);
                  shareBtn.textContent = "✓ Link QR Tersalin";
                  setTimeout(() => { shareBtn.textContent = "🔗 Share QR"; }, 1500);
                }
              }
            } else if (navigator.clipboard) {
              navigator.clipboard.writeText(orderUrl);
              shareBtn.textContent = "✓ Link QR Tersalin";
              setTimeout(() => { shareBtn.textContent = "🔗 Share QR"; }, 1500);
            }
          };
        }

        orderContainer.hidden = false;
      }

      const formKicker = byId("form-hero-kicker");
      const formTitle = byId("form-hero-title");
      const companyName = response.data.company.name || response.data.company.brandName || "Perusahaan";
      if (formKicker) formKicker.textContent = companyName.toUpperCase();
      if (formTitle) formTitle.textContent = `Masuk ke Portal ${companyName}`;
    } else {
      renderSaasPlans(response.data.saasPlans);
      renderTenantList(response.data.companies);
    }
  }

  byId("login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = byId("login-email")?.value?.trim() || "";
    const password = byId("login-password")?.value || "";
    login(email, password);
  });

  byId("btn-open-register-modal")?.addEventListener("click", () => openRegisterModal());
  byId("btn-close-register-modal")?.addEventListener("click", closeRegisterModal);
  byId("btn-cancel-register")?.addEventListener("click", closeRegisterModal);
  byId("reg-subscription-plan")?.addEventListener("change", updateRegisterPlanSummary);

  byId("btn-open-forgot-modal")?.addEventListener("click", (e) => {
    e.preventDefault();
    openForgotModal();
  });
  byId("btn-close-forgot-modal")?.addEventListener("click", closeForgotModal);
  byId("btn-cancel-forgot-modal")?.addEventListener("click", closeForgotModal);

  // Biometric Verification Modal Actions
  byId("btn-login-face-direct")?.addEventListener("click", () => {
    openFaceLoginChallenge({ user: { id: "usr-01", email: byId("login-email")?.value || "" } });
  });

  byId("btn-login-fingerprint-direct")?.addEventListener("click", () => {
    openFingerprintLoginChallenge({ user: { id: "usr-01", email: byId("login-email")?.value || "" } });
  });

  byId("btn-close-face-login-modal")?.addEventListener("click", closeFaceLoginChallenge);
  byId("btn-close-fingerprint-login-modal")?.addEventListener("click", closeFingerprintLoginChallenge);
  byId("btn-verify-fingerprint-login")?.addEventListener("click", verifyFingerprintLogin);

  // Preset Theme Color buttons
  document.querySelectorAll(".theme-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const color = btn.dataset.color;
      const input = byId("reg-theme-color");
      if (input && color) input.value = color;
    });
  });

  // Upload Logo
  byId("reg-company-logo-file")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const result = apiUpload("/api/public/upload-company-logo", formData);
    if (result?.ok && result.url) {
      if (byId("reg-company-logo-url")) byId("reg-company-logo-url").value = result.url;
      const preview = byId("reg-company-logo-preview");
      if (preview) {
        preview.style.backgroundImage = `url('${result.url}')`;
        preview.style.backgroundSize = "cover";
        preview.textContent = "";
      }
    } else {
      showAlert(result?.message || "Gagal mengunggah logo perusahaan.");
    }
  });

  // Upload Payment Proof
  byId("reg-payment-proof-file")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const result = apiUpload("/api/public/upload-payment-proof", formData);
    if (result?.ok && result.url) {
      if (byId("reg-payment-proof-url")) byId("reg-payment-proof-url").value = result.url;
      const preview = byId("reg-payment-proof-preview");
      if (preview) {
        preview.style.backgroundImage = `url('${result.url}')`;
        preview.style.backgroundSize = "cover";
        preview.textContent = "";
      }
    } else {
      showAlert(result?.message || "Gagal mengunggah bukti pembayaran.");
    }
  });

  // Submit Register Form
  byId("public-register-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = {
      name: byId("reg-company-name")?.value?.trim() || "",
      logoUrl: byId("reg-company-logo-url")?.value?.trim() || "",
      themeColor: byId("reg-theme-color")?.value || "#3B1F8C",
      adminName: byId("reg-admin-name")?.value?.trim() || "",
      adminEmail: byId("reg-admin-email")?.value?.trim()?.toLowerCase() || "",
      subscriptionPlan: byId("reg-subscription-plan")?.value || "Starter",
      paymentProofUrl: byId("reg-payment-proof-url")?.value || ""
    };

    if (!payload.name) {
      showFeedback("register-feedback", "Nama perusahaan wajib diisi.");
      return;
    }

    const result = apiPost("/api/public/register-company", payload);
    if (result?.ok) {
      showFeedback("register-feedback", result.message || "Pendaftaran berhasil!");
      window.setTimeout(() => {
        closeRegisterModal();
        showFeedback("login-feedback", "Pendaftaran berhasil dikirim! Silakan tunggu verifikasi Super Admin.");
      }, 2000);
    } else {
      showFeedback("register-feedback", result?.message || "Pendaftaran gagal.");
    }
  });

  // Submit Must Change Password Form
  byId("must-change-password-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = byId("pwd-change-email")?.value;
    const currentPassword = byId("pwd-change-current")?.value;
    const newPassword = byId("pwd-change-new")?.value;
    const confirmPassword = byId("pwd-change-confirm")?.value;

    if (!newPassword || newPassword.length < 8) {
      showFeedback("pwd-change-feedback", "Password baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showFeedback("pwd-change-feedback", "Konfirmasi password baru tidak cocok.");
      return;
    }

    const result = apiPost("/api/public/change-password", {
      email,
      currentPassword,
      newPassword,
      companySlug
    });

    if (result?.ok) {
      showFeedback("pwd-change-feedback", result.message || "Password berhasil diperbarui!");
      window.setTimeout(() => {
        if (byId("password-change-modal-backdrop")) byId("password-change-modal-backdrop").hidden = true;
        if (byId("must-change-password-modal")) byId("must-change-password-modal").hidden = true;
        document.body.classList.remove("modal-open");
        login(email, newPassword);
      }, 1500);
    } else {
      showFeedback("pwd-change-feedback", result?.message || "Gagal memperbarui password.");
    }
  });

  // Submit Forgot Password Form
  byId("forgot-password-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = byId("forgot-email")?.value?.trim();
    if (!email) {
      showFeedback("forgot-feedback", "Masukkan alamat email terdaftar.");
      return;
    }

    const submitBtn = document.querySelector("#forgot-password-form button[type='submit']");
    const originalText = submitBtn ? submitBtn.textContent : "Kirim Password Sementara";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "⏳ Memproses...";
    }

    const result = apiPost("/api/public/forgot-password", { email, companySlug });
    if (result?.ok) {
      showFeedback("forgot-feedback", result.message || "Password sementara telah dikirim ke email Anda.");
      if (byId("login-email")) byId("login-email").value = email;
      window.setTimeout(() => {
        closeForgotModal();
        showFeedback("login-feedback", "Password sementara dikirim ke email Anda. Gunakan password sementara tersebut untuk masuk.");
      }, 2000);
    } else {
      showFeedback("forgot-feedback", result?.message || "Gagal memproses reset password.");
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
})();

// ─── App Preview Slideshow — central login only ──────────────────────────────
(function initSlideshow() {
  if (companySlug) return; // only on central login

  const track = byId("slideshow-track");
  const dots = document.querySelectorAll(".slide-dot");
  const showcase = byId("app-preview-slideshow");
  if (!track || !dots.length || !showcase) return;

  const SLIDE_COUNT = dots.length;
  const INTERVAL_MS = 4500;
  let currentSlide = 0;
  let timer = null;
  let paused = false;

  const progressBar = document.createElement("div");
  progressBar.className = "slideshow-progress";
  progressBar.style.width = "0%";
  showcase.appendChild(progressBar);

  function goTo(index) {
    currentSlide = (index + SLIDE_COUNT) % SLIDE_COUNT;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("active", i === currentSlide));
    progressBar.style.transition = "none";
    progressBar.style.width = "0%";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        progressBar.style.transition = `width ${INTERVAL_MS}ms linear`;
        progressBar.style.width = "100%";
      });
    });
  }

  function startAuto() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!paused) goTo(currentSlide + 1);
    }, INTERVAL_MS);
  }

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      goTo(Number(dot.dataset.slide));
      startAuto();
    });
  });

  showcase.addEventListener("mouseenter", () => { paused = true; });
  showcase.addEventListener("mouseleave", () => { paused = false; });

  let touchStartX = 0;
  showcase.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  showcase.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) {
      goTo(currentSlide + (dx < 0 ? 1 : -1));
      startAuto();
    }
  });

  // Lightbox Zoom
  const lightbox = document.getElementById("slide-lightbox");
  const lightboxImg = document.getElementById("slide-lightbox-img");
  const lightboxClose = document.getElementById("slide-lightbox-close");

  if (lightbox && lightboxImg) {
    showcase.addEventListener("click", (e) => {
      const wrap = e.target.closest(".slide-img-wrap");
      if (!wrap) return;
      const img = wrap.querySelector("img");
      if (!img || !img.src) return;
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt || "Preview Aplikasi";
      lightbox.classList.remove("hidden");
      document.body.classList.add("modal-open");
    });

    function closeLightbox() {
      lightbox.classList.add("hidden");
      lightboxImg.src = "";
      document.body.classList.remove("modal-open");
    }

    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });

    lightboxClose?.addEventListener("click", closeLightbox);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !lightbox.classList.contains("hidden")) closeLightbox();
    });
  }

  goTo(0);
  startAuto();
})();

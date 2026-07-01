import { apiGet, apiPost } from "../store.js?v=coffee-v150";
import { byId, setText, showFeedback } from "../dom.js";

const token = window.__INVITATION_TOKEN__ || "";
const response = token ? apiGet(`/api/invitation/${token}`) : null;
const invitation = response?.ok ? response.data : null;

if (!invitation) {
  byId("invitation-submit").disabled = true;
  setText("invitation-title", "Undangan tidak valid");
  showFeedback("invitation-feedback", response?.message || "Link undangan tidak ditemukan atau sudah kedaluwarsa.");
} else {
  document.documentElement.style.setProperty("--brand", invitation.themeColor || "#6e3a16");
  setText("invitation-company", invitation.companyName);
  setText("invitation-title", `Halo, ${invitation.name}`);
  byId("invitation-email").value = invitation.email;
  setText("invitation-copy", `Anda diundang bergabung ke ${invitation.companyName}. Buat password baru untuk menyelesaikan aktivasi.`);
  if (invitation.logoUrl) byId("invitation-logo").innerHTML = `<img src="${invitation.logoUrl}" alt="${invitation.companyName}">`;
}

byId("invitation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!invitation) return;
  const password = byId("invitation-password").value;
  const passwordConfirmation = byId("invitation-password-confirmation").value;
  if (password !== passwordConfirmation) {
    showFeedback("invitation-feedback", "Konfirmasi password tidak sama.");
    return;
  }
  const result = apiPost(`/api/invitation/${token}/accept`, { password, passwordConfirmation });
  if (!result?.ok) {
    showFeedback("invitation-feedback", result?.message || "Aktivasi akun gagal.");
    return;
  }
  byId("invitation-submit").disabled = true;
  showFeedback("invitation-feedback", "Akun berhasil diaktifkan. Mengarahkan ke halaman login...");
  setTimeout(() => { window.location.href = result.data?.loginUrl || `/${invitation.companySlug}/login`; }, 1200);
});

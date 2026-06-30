import { renderLayout } from "../layout.js?v=coffee-v137";
import { apiGet, appPath, loadSession, loadState, scopedApiUrl } from "../store.js?v=coffee-v137";
import { byId, setText, showFeedback } from "../dom.js";

renderLayout();

const state = loadState();
const session = loadSession();

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderSteps(steps, options = {}) {
  const nextRequiredStepId = options.nextRequiredStepId || "";
  return steps.map((step, index) => {
    const isNext = !step.optional && step.id === nextRequiredStepId;
    return `
      <article class="onboarding-step ${step.completed ? "completed" : "pending"} ${isNext ? "next-required" : ""}">
        <span class="onboarding-step-index">${step.completed ? "OK" : index + 1}</span>
        <div class="onboarding-step-copy">
          <div>
            <strong>${escapeHtml(step.title)}</strong>
            ${isNext ? `<span class="status-pill status-low">Berikutnya</span>` : ""}
            ${step.optional ? `<span class="status-pill status-warning">Opsional</span>` : ""}
          </div>
          <p>${escapeHtml(step.description)}</p>
          <small>${step.completed ? `${step.count} data tersedia` : step.available ? "Belum diselesaikan" : `Terkunci: ${escapeHtml(step.lockedReason)}`}</small>
        </div>
        ${step.available
          ? `<a class="${step.completed ? "ghost-button" : "primary-button"} compact-button" href="${appPath(step.actionUrl)}">${step.completed ? "Kelola" : isNext ? "Lanjutkan" : "Mulai"}</a>`
          : `<button class="ghost-button compact-button" disabled type="button">Terkunci</button>`}
      </article>
    `;
  }).join("");
}

function loadOnboarding() {
  const response = apiGet(scopedApiUrl("/api/onboarding", state, session));
  if (!response?.ok) {
    showFeedback("onboarding-feedback", response?.message || "Status onboarding belum dapat dimuat.");
    return;
  }
  const data = response.data;
  setText("onboarding-company-name", `Persiapan ${data.companyName}`);
  setText("onboarding-progress-label", `${data.completed} dari ${data.total} langkah wajib`);
  setText("onboarding-progress-percent", `${data.progress}%`);
  byId("onboarding-progress-bar").style.width = `${data.progress}%`;
  const requiredSteps = data.requiredSteps || (data.steps || []).filter((step) => !step.optional);
  const optionalSteps = data.optionalSteps || (data.steps || []).filter((step) => step.optional);
  const requiredRemaining = requiredSteps.filter((step) => !step.completed).length;
  setText("required-step-summary", requiredRemaining ? `${requiredRemaining} belum selesai` : "Wajib selesai");
  byId("required-step-summary").className = `status-pill ${requiredRemaining ? "status-low" : "status-ok"}`;
  byId("onboarding-required-list").innerHTML = renderSteps(requiredSteps, { nextRequiredStepId: data.nextRequiredStepId });
  byId("onboarding-optional-list").innerHTML = renderSteps(optionalSteps);
}

loadOnboarding();

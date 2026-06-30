export function byId(id) {
  return document.getElementById(id);
}

export function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}

export function showFeedback(id, message) {
  const element = byId(id);
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
}

export function showAlert(message, type = "success") {
  let alert = document.querySelector("[data-app-alert]");
  if (!alert) {
    alert = document.createElement("div");
    alert.setAttribute("data-app-alert", "");
    alert.setAttribute("role", "status");
    document.body.appendChild(alert);
  }
  alert.className = `app-alert ${type === "error" ? "error" : "success"}`;
  alert.textContent = message;
  window.clearTimeout(showAlert.timer);
  showAlert.timer = window.setTimeout(() => {
    alert.classList.add("hide");
    window.setTimeout(() => alert.remove(), 220);
  }, 2600);
}

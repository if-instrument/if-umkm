import { posState } from "./pos-state.js";

export function createVirtualKeyboard() {
  if (!document.getElementById("virtual-keyboard-styles")) {
    const style = document.createElement("style");
    style.id = "virtual-keyboard-styles";
    style.textContent = `
      [data-virtual-keyboard] button {
        touch-action: manipulation;
      }
      @media (max-width: 500px) {
        [data-virtual-keyboard] {
          width: calc(100% - 16px) !important;
          padding: 6px !important;
        }
        [data-virtual-keyboard] button {
          font-size: 11px !important;
          padding: 6px 2px !important;
          min-width: 20px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  let container = document.querySelector("[data-virtual-keyboard]");
  if (container) return container;

  container = document.createElement("div");
  container.setAttribute("data-virtual-keyboard", "");
  container.style.position = "fixed";
  container.style.bottom = "12px";
  container.style.left = "50%";
  container.style.transform = "translateX(-50%)";
  container.style.background = "rgba(255, 255, 255, 0.98)";
  container.style.border = "1px solid #dcd6cd";
  container.style.borderRadius = "12px";
  container.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.15)";
  container.style.padding = "10px";
  container.style.zIndex = "9999";
  container.style.width = "480px";
  container.style.maxWidth = "calc(100% - 24px)";
  container.style.backdropFilter = "blur(10px)";
  container.style.transition = "opacity 0.2s, transform 0.2s";

  const layout = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M", "space"],
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["backspace", "clear", "close"]
  ];

  const keyLabels = {
    space: "Spasi",
    backspace: "⌫",
    clear: "Clear",
    close: "Tutup"
  };

  let html = `<div style="display: grid; gap: 6px;">`;
  layout.forEach((row) => {
    html += `<div style="display: flex; gap: 4px; justify-content: center;">`;
    row.forEach((key) => {
      const label = keyLabels[key] || key;
      const flexGrow = key === "space" ? "3" : "1";
      const color = ["backspace", "clear", "close"].includes(key) ? "color: var(--danger-color);" : "";
      html += `<button type="button" class="ghost-button" data-keyboard-key="${key}" style="flex: ${flexGrow}; font-size: 13px; padding: 8px 4px; font-weight: bold; min-width: 28px; text-align: center; border: 1px solid #dcd6cd; border-radius: 6px; background: white; ${color}">${label}</button>`;
    });
    html += `</div>`;
  });
  html += `</div>`;

  container.innerHTML = html;
  document.body.appendChild(container);

  container.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-keyboard-key]");
    if (!btn || !posState.activeKeyboardInput) return;

    const key = btn.dataset.keyboardKey;
    let val = posState.activeKeyboardInput.value || "";

    if (key === "close") {
      hideVirtualKeyboard();
      return;
    } else if (key === "backspace") {
      val = val.slice(0, -1);
    } else if (key === "clear") {
      val = "";
    } else if (key === "space") {
      val += " ";
    } else {
      val += key.toLowerCase();
    }

    posState.activeKeyboardInput.value = val;
    posState.activeKeyboardInput.dispatchEvent(new Event("input", { bubbles: true }));
    posState.activeKeyboardInput.dispatchEvent(new Event("change", { bubbles: true }));
    posState.activeKeyboardInput.focus();
  });

  return container;
}

export function showVirtualKeyboard(input) {
  posState.activeKeyboardInput = input;
  const keyboard = createVirtualKeyboard();
  keyboard.hidden = false;
}

export function hideVirtualKeyboard() {
  const keyboard = document.querySelector("[data-virtual-keyboard]");
  if (keyboard) {
    keyboard.hidden = true;
  }
  posState.activeKeyboardInput = null;
}

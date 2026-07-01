import { apiGet, scopedApiUrl } from "./store.js";

const PAGE_ENDPOINTS = {
  pos: "/api/page/pos/bootstrap"
};

export function pageDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function loadPageBootstrap(page, state, session, params = {}) {
  const endpoint = PAGE_ENDPOINTS[page];
  if (!endpoint) return { ok: false, message: `Endpoint page ${page} belum tersedia.` };
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const url = query.toString() ? `${endpoint}?${query.toString()}` : endpoint;
  return apiGet(scopedApiUrl(url, state, session));
}

export function applyPageBootstrap(targetState, data, fields = []) {
  if (!data) return targetState;
  fields.forEach((field) => {
    if (Array.isArray(targetState[field]) && Array.isArray(data[field])) {
      targetState[field] = data[field];
      return;
    }
    if (data[field] !== undefined) targetState[field] = data[field];
  });
  return targetState;
}

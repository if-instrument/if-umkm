export function enhanceDataTable(table, options = {}) {
  if (!table) return;
  if (table.dataset.enhanced === "true") resetDataTable(table);

  table.dataset.enhanced = "true";
  const pageSize = options.pageSize || 8;
  const title = options.title || "Data Export";
  const wrapper = document.createElement("div");
  wrapper.className = "datatable-shell";

  table.parentNode.insertBefore(wrapper, table);
  wrapper.appendChild(table);

  const toolbar = document.createElement("div");
  toolbar.className = "datatable-toolbar";
  toolbar.innerHTML = `
    <label>
      Search
      <input class="datatable-search" autocomplete="off" placeholder="Cari data..." type="search" />
    </label>
    <div class="datatable-actions">
      <button class="ghost-button compact-button" data-export="excel" type="button">Export Excel</button>
      <button class="ghost-button compact-button" data-export="pdf" type="button">Export PDF</button>
    </div>
  `;
  wrapper.insertBefore(toolbar, table);

  const footer = document.createElement("div");
  footer.className = "datatable-footer";
  footer.innerHTML = `
    <span class="datatable-info"></span>
    <div class="datatable-pagination"></div>
  `;
  wrapper.appendChild(footer);

  const searchInput = toolbar.querySelector(".datatable-search");
  const info = footer.querySelector(".datatable-info");
  const pagination = footer.querySelector(".datatable-pagination");
  const rows = Array.from(table.tBodies[0]?.rows || []);
  let currentPage = 1;

  function filteredRows() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.innerText.toLowerCase().includes(query));
  }

  function render() {
    const filtered = filteredRows();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);

    rows.forEach((row) => {
      row.hidden = !visible.includes(row);
    });

    info.textContent = filtered.length ? `Menampilkan ${start + 1}-${Math.min(start + pageSize, filtered.length)} dari ${filtered.length} data` : "Tidak ada data";
    pagination.innerHTML = `
      <button class="ghost-button compact-button" data-page="prev" ${currentPage === 1 ? "disabled" : ""} type="button">Prev</button>
      <span>Page ${currentPage} / ${totalPages}</span>
      <button class="ghost-button compact-button" data-page="next" ${currentPage === totalPages ? "disabled" : ""} type="button">Next</button>
    `;
  }

  searchInput.addEventListener("input", () => {
    currentPage = 1;
    render();
  });

  pagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button) return;
    currentPage += button.dataset.page === "next" ? 1 : -1;
    render();
  });

  toolbar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-export]");
    if (!button) return;
    if (button.dataset.export === "excel") exportExcel(table, title, filteredRows());
    if (button.dataset.export === "pdf") exportPdf(table, title, filteredRows());
  });

  render();
}

function resetDataTable(table) {
  const shell = table.closest(".datatable-shell");
  if (!shell) return;
  const parent = shell.parentNode;
  table.dataset.enhanced = "false";
  parent.insertBefore(table, shell);
  shell.remove();
}

export function enhanceAllDataTables(scope = document) {
  scope.querySelectorAll("table:not(.no-enhance)").forEach((table) => {
    const heading = table.closest(".workspace-panel, .modal-dialog")?.querySelector("h3")?.textContent || document.title;
    enhanceDataTable(table, { title: heading });
  });
}

function tableHeaders(table) {
  return Array.from(table.tHead?.rows[0]?.cells || []).map((cell) => cell.innerText.trim());
}

function rowCells(row) {
  return Array.from(row.cells).map((cell) => cell.innerText.trim().replace(/\s+/g, " "));
}

function exportExcel(table, title, rows) {
  const headers = tableHeaders(table);
  const body = [headers, ...rows.map(rowCells)];
  const html = `
    <html>
      <head><meta charset="UTF-8" /></head>
      <body>
        <table border="1">
          <caption>${escapeHtml(title)}</caption>
          ${body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
        </table>
      </body>
    </html>
  `;
  downloadFile(`${slug(title)}.xls`, "application/vnd.ms-excel", html);
}

function exportPdf(table, title, rows) {
  const headers = tableHeaders(table);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1d2329; }
          h1 { font-size: 20px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d7dde4; padding: 8px; text-align: left; }
          th { background: #f4f6f8; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <table>
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${rowCells(row).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function downloadFile(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "export";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

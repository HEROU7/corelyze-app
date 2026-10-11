export interface ReportRow {
  label: string
  value: string
}

export interface ReportSection {
  heading: string
  rows?: ReportRow[]
  items?: string[]
}

export interface ReportData {
  title: string
  subtitle?: string
  meta?: ReportRow[]
  sections: ReportSection[]
  footer?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderRows(rows: ReportRow[]): string {
  return `<table class="rows">${rows
    .map(
      (row) =>
        `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`,
    )
    .join("")}</table>`
}

function renderSection(section: ReportSection): string {
  const body = section.rows?.length
    ? renderRows(section.rows)
    : section.items?.length
      ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : ""
  return `<section><h2>${escapeHtml(section.heading)}</h2>${body}</section>`
}

function buildDocument(data: ReportData): string {
  const meta = data.meta?.length ? renderRows(data.meta) : ""
  const sections = data.sections.map(renderSection).join("")
  const footer = data.footer
    ? `<footer>${escapeHtml(data.footer)}</footer>`
    : '<footer>Generado por Corelyze · Analizador de Hardware</footer>'

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 40px; }
  header { border-bottom: 3px solid #1e3a8a; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { margin: 0; font-size: 26px; color: #1e3a8a; }
  .subtitle { margin: 6px 0 0; color: #475569; font-size: 13px; }
  .badge { display: inline-block; margin-top: 10px; background: #e0e7ff; color: #1e3a8a; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  section { margin-bottom: 22px; page-break-inside: avoid; }
  h2 { font-size: 15px; color: #1e293b; border-left: 4px solid #1e3a8a; padding-left: 8px; margin: 0 0 10px; }
  table.rows { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.rows th { text-align: left; width: 40%; padding: 6px 10px; background: #f1f5f9; color: #475569; font-weight: 600; border: 1px solid #e2e8f0; }
  table.rows td { padding: 6px 10px; border: 1px solid #e2e8f0; }
  ul { margin: 0; padding-left: 18px; font-size: 13px; }
  li { margin-bottom: 5px; }
  footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 24px; } }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(data.title)}</h1>
  ${data.subtitle ? `<p class="subtitle">${escapeHtml(data.subtitle)}</p>` : ""}
  ${meta}
</header>
${sections}
${footer}
</body>
</html>`
}

export function printReport(data: ReportData): void {
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 1000)
  }

  iframe.onload = () => {
    const win = iframe.contentWindow
    if (!win) {
      cleanup()
      return
    }
    win.focus()
    win.print()
    cleanup()
  }

  iframe.srcdoc = buildDocument(data)
}

const $ = (selector) => document.querySelector(selector);
const configuredBase = window.FILINGS_API_BASE;
const localServer = ["127.0.0.1", "localhost"].includes(location.hostname) && location.port === "8765";
const API_BASE = typeof configuredBase === "string" ? configuredBase.replace(/\/$/, "") : localServer ? location.origin : null;
const apiUrl = (path) => `${API_BASE || ""}${path}`;
const state = { cik: null, company: null, filings: [], quarter: "all", form: "periodic", years: null, open: [], observer: null, generation: 0 };
const track = $("#viewer-track");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function getJson(url) {
  const response = await fetch(apiUrl(url));
  let value;
  try { value = await response.json(); } catch { throw new Error(`Server returned HTTP ${response.status}`); }
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

function showNotice(message) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.hidden = !message;
}

function empty(message, detail = "") {
  track.innerHTML = `<div class="empty-state"><span class="empty-icon">⌁</span><strong>${escapeHtml(message)}</strong><span>${escapeHtml(detail)}</span></div>`;
}

function getMatches() {
  const from = $("#date-from").value;
  const to = $("#date-to").value;
  return state.filings.filter(filing => {
    if (state.form === "periodic" && !["10-Q", "10-K"].includes(filing.form)) return false;
    if (state.form !== "periodic" && state.form !== "all" && filing.form !== state.form) return false;
    if (state.quarter !== "all" && filing.fiscalQuarter !== Number(state.quarter)) return false;
    if (state.years && !state.years.has(filing.fiscalYear)) return false;
    if (from && filing.filingDate < from) return false;
    if (to && filing.filingDate > to) return false;
    return true;
  }).sort((a, b) => (a.fiscalYear || 0) - (b.fiscalYear || 0) || a.filingDate.localeCompare(b.filingDate));
}

function filingLabel(filing) {
  const fy = filing.fiscalYear ? `FY${filing.fiscalYear}` : "FY unknown";
  const q = filing.fiscalQuarter ? `Q${filing.fiscalQuarter}` : "period unknown";
  return `${fy} · ${q}`;
}

function filingDocument(filing) {
  const primary = filing.primaryDocument || "__full_submission__.txt";
  if (["13F-HR", "13F-HR/A"].includes(filing.form) && /(?:^|\/)primary_doc\.xml$/i.test(primary)) {
    return primary.replace(/primary_doc\.xml$/i, "infotable.xml");
  }
  return primary;
}

function archivePath(filing) {
  const doc = filingDocument(filing);
  return apiUrl(`/archive/${state.cik}/${filing.accession}/${doc.split("/").map(encodeURIComponent).join("/")}`);
}

function originalUrl(filing) {
  const acc = filing.accession.replaceAll("-", "");
  if (!filing.primaryDocument) return `https://www.sec.gov/Archives/edgar/data/${Number(state.cik)}/${filing.accession}.txt`;
  if (["13F-HR", "13F-HR/A"].includes(filing.form)) return `https://www.sec.gov/Archives/edgar/data/${Number(state.cik)}/${acc}/${filing.accession}-index.html`;
  const doc = filingDocument(filing);
  return `https://www.sec.gov/Archives/edgar/data/${Number(state.cik)}/${acc}/${doc.split("/").map(encodeURIComponent).join("/")}`;
}

function latestFiling(filings) {
  const periodic = filings.filter(filing => ["10-Q", "10-K"].includes(filing.form) && filing.fiscalQuarter && filing.fiscalYear);
  const candidates = periodic.length ? periodic : filings;
  const filing = [...candidates].sort((a, b) =>
    (b.reportDate || b.filingDate).localeCompare(a.reportDate || a.filingDate) ||
    b.filingDate.localeCompare(a.filingDate)
  )[0];
  return { filing, periodic: periodic.length > 0 };
}

function updateYears() {
  const years = [...new Set(state.filings.map(f => f.fiscalYear).filter(Boolean))].sort((a, b) => b - a);
  $("#year-list").innerHTML = years.map(year => `<button type="button" data-year="${year}" class="${!state.years || state.years.has(year) ? "selected" : ""}" aria-pressed="${!state.years || state.years.has(year)}">${year}</button>`).join("") || '<span class="muted">No fiscal years available</span>';
}

function updateFilters() {
  const forms = [...new Set(state.filings.map(f => f.form).filter(Boolean))].sort();
  const select = $("#form-filter");
  select.innerHTML = '<option value="periodic">10-Q + 10-K (quarterly reading)</option><option value="all">All filing types</option>' + forms.map(form => `<option value="${escapeHtml(form)}">${escapeHtml(form)}</option>`).join("");
  select.value = state.form;
  $("#quarter-filter").querySelectorAll("button").forEach(button => button.classList.toggle("active", button.dataset.quarter === state.quarter));
  updateYears();
  const fye = state.company?.fiscalYearEnd;
  const fiscalDate = fye && fye.length === 4 ? `${fye.slice(0, 2)}/${fye.slice(2)}` : "unknown";
  $("#fiscal-hint").textContent = `${state.company?.name || "Company"} fiscal year end: ${fiscalDate}. Quarters use SEC report period dates; 10-K represents Q4.`;
}

function updateHeader(matches) {
  const ticker = state.company?.tickers?.[0] || `CIK ${state.cik}`;
  const q = state.quarter === "all" ? "ALL QUARTERS" : `Q${state.quarter}`;
  const y = !state.years ? "ALL YEARS" : state.years.size === 1 ? `FY${[...state.years][0]}` : `${state.years.size} YEARS`;
  $("#header-company").textContent = ticker;
  $("#header-context").textContent = `${q} · ${y}`;
}

function updateList(matches) {
  $("#match-count").textContent = matches.length.toLocaleString();
  const openSet = new Set(state.open.map(f => f.accession));
  $("#filing-list").innerHTML = matches.map(f => `<div class="filing-row"><div><strong>${escapeHtml(filingLabel(f))} · ${escapeHtml(f.form)}</strong><small>Filed ${escapeHtml(f.filingDate)}${f.reportDate ? ` · period ${escapeHtml(f.reportDate)}` : ""}</small></div><button type="button" data-accession="${escapeHtml(f.accession)}" class="${openSet.has(f.accession) ? "is-open" : ""}">${openSet.has(f.accession) ? "Remove" : "Add"}</button></div>`).join("") || '<span class="muted">No filings match these filters.</span>';
}

function showFilingError(frame, status, error) {
  status.innerHTML = `<strong>Unable to open filing</strong><span>${escapeHtml(error.message)}</span><button type="button">Retry</button>`;
  status.querySelector("button").onclick = () => loadFilingFrame(frame, status);
}

async function informationTablePath(fallback) {
  const match = fallback.match(/^\/archive\/(\d+)\/(\d{10}-\d{2}-\d{6})\//);
  if (!match) return fallback;
  const [, cik, accession] = match;
  const prefix = `/archive/${cik}/${accession}/`;
  const indexUrl = apiUrl(`${prefix}${accession}-index.html`);
  try {
    const response = await fetch(indexUrl);
    if (!response.ok) return fallback;
    const index = new DOMParser().parseFromString(await response.text(), "text/html");
    for (const row of index.querySelectorAll("tr")) {
      if (![...row.querySelectorAll("td")].some(cell => cell.textContent.trim() === "INFORMATION TABLE")) continue;
      const link = [...row.querySelectorAll("a")].find(anchor => /\.html?$/i.test(anchor.textContent.trim()));
      if (!link) continue;
      const href = link.getAttribute("href");
      if (!href) continue;
      const target = new URL(href, response.url);
      if (target.origin === new URL(API_BASE).origin && target.pathname.startsWith(prefix)) return target.href;
      const secPath = target.pathname.match(/^\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/(.+)$/i);
      if (["sec.gov", "www.sec.gov"].includes(target.hostname) && secPath && Number(secPath[1]) === Number(cik) && secPath[2] === accession.replaceAll("-", "")) {
        return apiUrl(`${prefix}${secPath[3]}`);
      }
    }
  } catch { /* The known infotable.xml path still works for many filings offline. */ }
  return fallback;
}

async function loadFilingFrame(frame, status) {
  let url = frame.dataset.src;
  status.innerHTML = '<span class="spinner"></span><strong>Loading original filing…</strong><span>Downloading from SEC or opening local cache</span>';
  try {
    if (frame.dataset.holdings === "true") url = await informationTablePath(url);
    const response = await fetch(url);
    if (!response.ok) {
      let detail = `Server returned HTTP ${response.status}`;
      try { detail = (await response.json()).error || detail; } catch { /* Some errors are plain text. */ }
      throw new Error(detail);
    }
    if (/\.xml$/i.test(url)) {
      const body = await response.text();
      if (/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(body)) {
        const base = new URL(".", new URL(url, location.href)).href;
        frame.srcdoc = body.replace(/<head\b[^>]*>/i, match => `${match}<base href="${escapeHtml(base)}">`);
        return;
      }
    }
    await response.body?.cancel();
    frame.removeAttribute("srcdoc");
    frame.src = url;
  } catch (error) {
    showFilingError(frame, status, error);
  }
}

function renderColumns() {
  state.observer?.disconnect();
  state.observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const frame = entry.target.querySelector("iframe");
      if (frame && !frame.dataset.loaded) {
        frame.dataset.loaded = "true";
        const status = entry.target.querySelector(".frame-state");
        frame.addEventListener("load", () => {
          try {
            const doc = frame.contentDocument;
            if (doc?.contentType === "application/json") {
              const parsed = JSON.parse(doc.body.textContent);
              throw new Error(parsed.error || "Unable to load filing");
            }
            status.remove();
           
          } catch (error) { showFilingError(frame, status, error); }
        });
        loadFilingFrame(frame, status);
      }
      state.observer.unobserve(entry.target);
    }
  }, { root: track, rootMargin: "0px 600px" });
  if (!state.open.length) {
    empty("No filings selected", "Adjust the filters or add a filing from the sidebar.");
    return;
  }
  track.innerHTML = state.open.map(filing => `<article class="filing-column" data-accession="${escapeHtml(filing.accession)}"><div class="column-top"><button type="button" class="column-drag" aria-label="Reorder ${escapeHtml(filingLabel(filing))} ${escapeHtml(filing.form)}; drag or use left and right arrow keys" title="Drag to reorder · arrow keys also work">⠿</button><div class="column-heading"><span class="column-kicker">${escapeHtml(filingLabel(filing))} <span>·</span> ${escapeHtml(filing.form)}${filingDocument(filing) !== filing.primaryDocument ? " · HOLDINGS" : ""}</span><strong>${escapeHtml(state.company?.name || "SEC filing")}</strong><small>Period ${escapeHtml(filing.reportDate || "not listed")} · Filed ${escapeHtml(filing.filingDate)}</small></div><div class="column-actions"><a href="${escapeHtml(originalUrl(filing))}" target="_blank" rel="noopener noreferrer" title="Open filing on SEC EDGAR">SEC ↗</a><button type="button" data-remove="${escapeHtml(filing.accession)}" aria-label="Remove filing">×</button></div></div><div class="column-frame"><div class="frame-state"><span class="spinner"></span><strong>Waiting to load filing…</strong></div><iframe title="${escapeHtml(filingLabel(filing))} ${escapeHtml(filing.form)}" loading="lazy" sandbox="allow-same-origin" data-holdings="${["13F-HR", "13F-HR/A"].includes(filing.form)}" data-src="${escapeHtml(archivePath(filing))}"></iframe></div><div class="column-resizer" title="Drag to resize column" aria-hidden="true"></div></article>`).join("");
  track.querySelectorAll(".filing-column").forEach(column => state.observer.observe(column));
}

function applyFilters({ resetColumns = true } = {}) {
  if (!state.company) return;
  const matches = getMatches();
  if (resetColumns) {
    state.open = matches.slice(0, 60);
    showNotice(matches.length > 60 ? `Showing the first 60 of ${matches.length.toLocaleString()} matches. Add any other filing from the matching list.` : "");
    track.scrollLeft = 0;
  }
  updateYears();
  updateList(matches);
  updateHeader(matches);
  renderColumns();
}

async function loadCompany(cik, preferredForm = null) {
  const generation = ++state.generation;
  state.cik = String(Number(cik));
  state.company = null;
  state.filings = [];
  state.years = null;
  state.open = [];
  showNotice("");
  empty("Loading SEC filing index", "This includes the company's full available filing history.");
  try {
    const company = await getJson(`/api/filings?cik=${encodeURIComponent(cik)}`);
    if (generation !== state.generation) return;
    state.company = company;
    state.filings = company.filings;
    const ticker = company.tickers?.[0] || "CIK";
    $("#company-search").value = ticker === "CIK" ? company.cik : ticker;
    $("#company-card").innerHTML = `<div class="company-monogram">${escapeHtml((ticker[0] || "C").toUpperCase())}</div><div><strong>${escapeHtml(company.name)}</strong><small>${escapeHtml(ticker)} · CIK ${String(company.cik).padStart(10, "0")}</small></div>`;
    $("#company-card").hidden = false;
    const selection = latestFiling(company.filings);
    const preferredFiling = preferredForm ? company.filings.find(filing => filing.form === preferredForm) : null;
    const initialFiling = preferredFiling || selection.filing;
    state.form = preferredFiling ? preferredForm : selection.periodic ? "periodic" : "all";
    state.quarter = preferredFiling ? "all" : selection.periodic ? String(selection.filing.fiscalQuarter) : "all";
    state.years = initialFiling?.fiscalYear ? new Set([initialFiling.fiscalYear]) : null;
    state.open = initialFiling ? [initialFiling] : [];
    updateFilters();
    applyFilters({ resetColumns: false });
  } catch (error) {
    if (generation !== state.generation) return;
    empty("Could not load SEC filings", error.message);
    showNotice(error.message);
  }
}

async function searchCompany(query) {
  if (!query.trim()) { $("#company-results").innerHTML = ""; return; }
  $("#company-results").innerHTML = '<span class="muted">Searching SEC filers…</span>';
  try {
    const results = await getJson(`/api/companies?q=${encodeURIComponent(query)}`);
    if (query !== $("#company-search").value) return;
    $("#company-results").innerHTML = results.map(row => `<button type="button" role="option" data-cik="${row.cik_str}"${row.preferred_form ? ` data-form="${escapeHtml(row.preferred_form)}"` : ""}><span>${escapeHtml(row.title)}</span><small>${escapeHtml(row.matched_person ? `${row.matched_person} · ${row.match_note || "13F holdings"}` : row.is_13f_manager ? `13F manager · CIK ${row.cik_str}` : row.ticker || `CIK ${row.cik_str}`)}</small></button>`).join("") || '<span class="muted">No matching filers</span>';
  } catch (error) { showNotice(error.message); }
}

$("#company-search").addEventListener("input", () => { $("#company-results").innerHTML = ""; });

function submitCompanySearch() {
  const query = $("#company-search").value.trim();
  if (/^\d{1,10}$/.test(query)) loadCompany(query);
  else searchCompany(query);
}

$("#company-search-button").addEventListener("click", submitCompanySearch);

if (API_BASE) {
  $("#company-search").disabled = false;
  $("#company-search-button").disabled = false;
  $("#company-search").placeholder = "Company, ticker, CIK, or investor";
  $(".side-footer").innerHTML = '<span class="live-dot"></span> SEC EDGAR FILINGS';
  showNotice("");
} else {
  $("#company-search-button").disabled = true;
  showNotice("The filing backend has not been configured.");
}
$("#company-search").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    const selected = $("#company-results button");
    if (selected) selected.click();
    else submitCompanySearch();
  }
});
$("#company-results").addEventListener("click", event => {
  const button = event.target.closest("button[data-cik]");
  if (!button) return;
  $("#company-results").innerHTML = "";
  $("#sidebar").classList.remove("open");
  syncSidebarButtons();
  loadCompany(button.dataset.cik, button.dataset.form || null);
});
$("#form-filter").addEventListener("change", event => { state.form = event.target.value; applyFilters(); });
$("#quarter-filter").addEventListener("click", event => {
  const button = event.target.closest("button[data-quarter]");
  if (!button) return;
  state.quarter = button.dataset.quarter;
  $("#quarter-filter").querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  applyFilters();
});
$("#year-list").addEventListener("click", event => {
  const button = event.target.closest("button[data-year]");
  if (!button) return;
  const year = Number(button.dataset.year);
  if (!state.years) state.years = new Set([year]);
  else if (state.years.has(year)) state.years.delete(year);
  else state.years.add(year);
  applyFilters();
});
$("#all-years").addEventListener("click", () => { state.years = null; applyFilters(); });
$("#date-from").addEventListener("change", () => applyFilters());
$("#date-to").addEventListener("change", () => applyFilters());
$("#filing-list").addEventListener("click", event => {
  const button = event.target.closest("button[data-accession]");
  if (!button) return;
  const filing = state.filings.find(item => item.accession === button.dataset.accession);
  if (!filing) return;
  if (state.open.some(item => item.accession === filing.accession)) state.open = state.open.filter(item => item.accession !== filing.accession);
  else state.open.push(filing);
  applyFilters({ resetColumns: false });
});
track.addEventListener("click", event => {
  const button = event.target.closest("button[data-remove]");
  if (!button) return;
  state.open = state.open.filter(item => item.accession !== button.dataset.remove);
  applyFilters({ resetColumns: false });
});

function orderedColumns() {
  return [...track.querySelectorAll(".filing-column")].sort((a, b) =>
    state.open.findIndex(item => item.accession === a.dataset.accession) -
    state.open.findIndex(item => item.accession === b.dataset.accession)
  );
}

function moveColumn(column, destination) {
  const from = state.open.findIndex(item => item.accession === column.dataset.accession);
  if (from < 0 || from === destination) return;
  const [filing] = state.open.splice(from, 1);
  state.open.splice(destination, 0, filing);
  orderedColumns().forEach(item => {
    item.style.order = state.open.findIndex(f => f.accession === item.dataset.accession);
  });
}

track.addEventListener("keydown", event => {
  const handle = event.target.closest(".column-drag");
  if (!handle || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const column = handle.closest(".filing-column");
  const index = state.open.findIndex(item => item.accession === column.dataset.accession);
  moveColumn(column, Math.max(0, Math.min(state.open.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1))));
  column.scrollIntoView({ block: "nearest", inline: "nearest" });
});

track.addEventListener("pointerdown", event => {
  const handle = event.target.closest(".column-drag");
  if (!handle || event.button !== 0) return;
  const column = handle.closest(".filing-column");
  const startX = event.clientX;
  const startScroll = track.scrollLeft;
  let pointerX = startX;
  let dragging = false;
  let destination = state.open.findIndex(item => item.accession === column.dataset.accession);
  let frame = null;
  const previousSnap = track.style.scrollSnapType;
  handle.setPointerCapture(event.pointerId);

  function updateTarget() {
    const others = orderedColumns().filter(item => item !== column);
    destination = others.findIndex(item => pointerX < item.getBoundingClientRect().left + item.getBoundingClientRect().width / 2);
    if (destination < 0) destination = others.length;
    track.querySelectorAll(".drop-before").forEach(item => item.classList.remove("drop-before"));
    if (others[destination]) others[destination].classList.add("drop-before");
    else if (others.length) others[others.length - 1].classList.add("drop-after");
    if (destination < others.length) others.forEach(item => item.classList.remove("drop-after"));
    column.style.transform = `translateX(${pointerX - startX + track.scrollLeft - startScroll}px)`;
  }

  function autoScroll() {
    const bounds = track.getBoundingClientRect();
    const edge = 70;
    const speed = pointerX < bounds.left + edge ? -18 : pointerX > bounds.right - edge ? 18 : 0;
    if (speed) {
      track.scrollLeft += speed;
      updateTarget();
    }
    frame = requestAnimationFrame(autoScroll);
  }

  function move(pointer) {
    if (pointer.pointerId !== event.pointerId) return;
    pointerX = pointer.clientX;
    if (!dragging && Math.abs(pointerX - startX) < 5) return;
    if (!dragging) {
      dragging = true;
      column.classList.add("is-dragging");
      track.style.scrollSnapType = "none";
      frame = requestAnimationFrame(autoScroll);
    }
    updateTarget();
  }

  function stop(pointer) {
    if (pointer.pointerId !== event.pointerId) return;
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", stop);
    handle.removeEventListener("pointercancel", cancel);
    if (frame !== null) cancelAnimationFrame(frame);
    track.style.scrollSnapType = previousSnap;
    column.style.transform = "";
    column.classList.remove("is-dragging");
    track.querySelectorAll(".drop-before, .drop-after").forEach(item => item.classList.remove("drop-before", "drop-after"));
    if (dragging) moveColumn(column, destination);
  }

  function cancel(pointer) {
    dragging = false;
    stop(pointer);
  }

  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", cancel);
});
track.addEventListener("pointerdown", event => {
  const handle = event.target.closest(".column-resizer");
  if (!handle || matchMedia("(max-width: 850px)").matches) return;
  const column = handle.closest(".filing-column");
  const startX = event.clientX;
  const startWidth = column.getBoundingClientRect().width;
  event.preventDefault();
  document.body.style.cursor = "col-resize";
  function move(pointer) { column.style.width = `${Math.max(340, Math.min(850, startWidth + pointer.clientX - startX))}px`; }
  function stop() {
    document.body.style.cursor = "";
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
});
$("#scroll-left").addEventListener("click", () => track.scrollBy({ left: -Math.max(320, track.clientWidth * .8), behavior: "smooth" }));
$("#scroll-right").addEventListener("click", () => track.scrollBy({ left: Math.max(320, track.clientWidth * .8), behavior: "smooth" }));
const sidebar = $("#sidebar");
const shell = $(".shell");
const mobileSidebar = window.matchMedia("(max-width: 850px)");
const brandMenu = $("#brand-menu");
const menuButton = $("#menu-button");

function syncSidebarButtons() {
  const expanded = mobileSidebar.matches ? sidebar.classList.contains("open") : !shell.classList.contains("sidebar-collapsed");
  brandMenu.setAttribute("aria-expanded", String(expanded));
  menuButton.setAttribute("aria-expanded", String(expanded));
  menuButton.setAttribute("aria-label", expanded ? "Close sidebar" : "Open sidebar");
}

brandMenu.addEventListener("click", () => {
  if (mobileSidebar.matches) sidebar.classList.remove("open");
  else shell.classList.add("sidebar-collapsed");
  syncSidebarButtons();
});
menuButton.addEventListener("click", () => {
  if (mobileSidebar.matches) sidebar.classList.toggle("open");
  else shell.classList.remove("sidebar-collapsed");
  syncSidebarButtons();
});
mobileSidebar.addEventListener("change", syncSidebarButtons);
syncSidebarButtons();

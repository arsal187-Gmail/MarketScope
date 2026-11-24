/* MarketScope — schema-flexible stocks table + backend-ready Date Range.
   No frameworks or dependencies. Stock values are displayed, not calculated. */
'use strict';

// SETTINGS: keep empty while using static educational JSON.
// Later, set this to your backend endpoint, e.g. '/api/stocks'.
// The selected date range will then be sent as ?date_range=1w|1m|3m|6m|9m|1y.
const BACKEND_API_URL = '';
const DEMO_DATA_URL = 'data/stock_universe_40.json';
const PAGE_SIZE = 20;
const DEFAULT_DATE_RANGE = '1m';
const DATE_RANGES = [
  ['1w', '1 Week'], ['1m', '1 Month'], ['3m', '3 Months'],
  ['6m', '6 Months'], ['9m', '9 Months'], ['1y', '1 Year'],
];

// Optional explicit overrides if the future backend uses entirely unfamiliar
// identifiers. These change BEHAVIOR only, never visible JSON column labels.
const FIELD_MAP = { ticker: '', company: '', sector: '' };
const FIELD_ALIASES = {
  ticker: ['ticker', 'symbol', 'stock_symbol', 'ticker_symbol', 'stock_ticker', 'stock_code'],
  company: ['company_name', 'company', 'business_name', 'companyName', 'name', 'issuer_name'],
  sector: ['sector', 'industry', 'gics_sector', 'sector_name', 'industry_sector'],
};

const KNOWN_FORMATS = {
  ticker: 'plain', company_name: 'plain', sector: 'plain', exchange: 'plain', currency: 'plain',
  price: 'price', market_cap_b: 'market_cap_b',
  daily_change_pct: 'signed_percent', monthly_change_pct: 'signed_percent',
  ytd_change_pct: 'signed_percent', annual_change_pct: 'signed_percent',
  volume: 'volume', avg_volume_30d: 'volume', relative_volume: 'relative_volume',
  pe_ratio: 'pe', forward_pe: 'pe', eps_ttm: 'eps',
  dividend_yield_pct: 'yield', beta: 'beta',
  fifty_two_week_high: 'price', fifty_two_week_low: 'price',
  revenue_growth_pct: 'signed_percent', earnings_growth_pct: 'signed_percent',
  growth_rank: 'rank', value_rank: 'rank', volume_rank: 'rank',
};

let stockData = [];
let filtered = [];
let columns = [];
let fieldKeys = { ticker: '', company: '', sector: '' };
let sortKey = null;              // null = original backend order
let sortDir = 'asc';
let currentPage = 1;
let selectedRange = DEFAULT_DATE_RANGE;
let activeRequest = null;
let requestId = 0;
let toolbarCreated = false;
let sourceMetadata = {};

const isBackend = () => Boolean(BACKEND_API_URL.trim());
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isMissing = value => value === null || value === undefined || value === '' ||
  (typeof value === 'number' && !Number.isFinite(value));
const numericValue = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const cleaned = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
};

// Accept legacy {"AAPL":{...}}, arrays [{ticker:...}], or API envelopes
// {date_range:'3m', stocks:[...]}. The data itself must be stock RECORDS.
function transformData(payload) {
  let raw = payload;
  let metadata = {};
  if (isObject(payload)) {
    for (const key of ['stocks', 'data', 'results']) {
      if (Array.isArray(payload[key]) || (isObject(payload[key]) &&
          Object.values(payload[key]).some(isObject))) {
        raw = payload[key];
        metadata = {
          date_range: payload.date_range,
          field_map: isObject(payload.field_map) ? payload.field_map : {},
          field_formats: isObject(payload.field_formats) ? payload.field_formats : {},
        };
        break;
      }
    }
  }
  let rows;
  if (Array.isArray(raw)) {
    rows = raw.filter(isObject).map(entry => ({ ...entry }));
  } else if (isObject(raw)) {
    rows = Object.entries(raw)
      .filter(([, record]) => isObject(record))
      .map(([ticker, record]) => {
        const row = { ...record };
        // Original keyed JSON has a ticker in the object KEY, not the values.
        if (!FIELD_ALIASES.ticker.some(key => Object.hasOwn(row, key))) {
          return { ticker, ...row };
        }
        return row;
      });
  } else {
    throw new Error('JSON must be a stock object, an array, or an API envelope containing stock records.');
  }
  return { rows, metadata };
}

function resolveField(fields, role, map = {}) {
  const requested = map[role] || FIELD_MAP[role];
  if (requested && fields.includes(requested)) return requested;
  const aliases = FIELD_ALIASES[role];
  return fields.find(f => aliases.some(a => a.toLowerCase() === f.toLowerCase())) || '';
}

// The union of keys across ALL records ensures fields that appear only in later
// stocks still become columns. We keep the current two pinned columns first.
function buildColumns(rows, metadata) {
  const discovered = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) { seen.add(key); discovered.push(key); }
    }
  }
  fieldKeys = {
    ticker: resolveField(discovered, 'ticker', metadata.field_map || {}),
    company: resolveField(discovered, 'company', metadata.field_map || {}),
    sector: resolveField(discovered, 'sector', metadata.field_map || {}),
  };
  const first = [fieldKeys.ticker, fieldKeys.company].filter(Boolean);
  const order = [...new Set([...first, ...discovered])];
  const formats = metadata.field_formats || {};
  columns = order.map(key => ({
    key, header: key, // EXACT JSON key, never abbreviated/translated
    fmt: selectFormatter(key, formats[key]),
    sortType: inferSortType(key, rows),
    cssClass: key === fieldKeys.ticker ? 'col-ticker' :
      key === fieldKeys.company ? 'col-company' : '',
  }));
  updateStickyWidths(rows);
}

function updateStickyWidths(rows) {
  // Size the Company column from the current data, without allowing a long
  // company name to take over the table. Long text scrolls INSIDE its cell.
  const MIN_COMPANY_PX = 160;
  const MAX_COMPANY_PX = 240;
  let widest = 0;
  if (fieldKeys.company) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      context.font = `14px ${getComputedStyle(document.body).fontFamily}`;
    }
    for (const row of rows) {
      const name = String(row[fieldKeys.company] ?? '');
      const measured = context ? context.measureText(name).width : name.length * 8;
      widest = Math.max(widest, measured);
    }
  }
  const companyWidth = Math.min(MAX_COMPANY_PX,
    Math.max(MIN_COMPANY_PX, Math.ceil(widest + 12)));
  document.documentElement.style.setProperty('--company-column-width', `${companyWidth}px`);
  document.documentElement.style.setProperty('--ticker-column-width', fieldKeys.ticker ? '80px' : '0px');
}

function inferSortType(key, rows) {
  const values = rows.map(row => row[key]).filter(v => !isMissing(v));
  if (!values.length) return 'string';
  if (values.every(v => numericValue(v) !== null)) return 'number';
  if (values.every(v => typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(v) && Number.isFinite(Date.parse(v)))) return 'date';
  return 'string';
}

const result = (text, cssClass = '') => ({ text, cssClass });
function fmtPlain(v) {
  if (isMissing(v)) return result('N/A');
  return result(typeof v === 'object' ? JSON.stringify(v) : String(v));
}
function fmtNumber(v) {
  const n = numericValue(v);
  return n === null ? result('N/A') : result(n.toLocaleString('en-US', { maximumFractionDigits: 4 }));
}
function fmtPrice(v) {
  const n = numericValue(v);
  return n === null ? result('N/A') : result('$' + n.toFixed(2));
}
function fmtMarketCap(v) {
  const n = numericValue(v);
  return n === null ? result('N/A') : result('$' + n.toFixed(1) + 'B');
}
function fmtPct(v) {
  const n = numericValue(v);
  return n === null ? result('N/A') : result((n >= 0 ? '+' : '') + n.toFixed(2) + '%', n >= 0 ? 'positive' : 'negative');
}
function fmtNeutralPct(v) {
  const n = numericValue(v);
  return n === null ? result('N/A') : result(n.toFixed(2) + '%');
}
function fmtVolume(v) {
  const n = numericValue(v);
  if (n === null) return result('N/A');
  if (Math.abs(n) >= 1e6) return result((n / 1e6).toFixed(1) + 'M');
  if (Math.abs(n) >= 1e3) return result((n / 1e3).toFixed(1) + 'K');
  return result(String(n));
}
function fmtRelVol(v) {
  const n = numericValue(v);
  return n === null ? result('N/A') : result(n.toFixed(2) + '×');
}
function fmtPE(v) {
  const n = numericValue(v);
  return n === null || n <= 0 ? result('N/A') : result(n.toFixed(2));
}
function fmtYield(v) {
  const n = numericValue(v);
  return n === null ? result('N/A') : result(n === 0 ? '—' : n.toFixed(2) + '%');
}
function fmtRank(v) {
  const n = numericValue(v);
  return n === null ? result('N/A') : result('#' + n);
}
function fmtBeta(v) {
  const n = numericValue(v);
  return n === null ? result('N/A') : result(n.toFixed(2));
}

const FORMAT_HANDLERS = {
  plain: fmtPlain, number: fmtNumber, price: fmtPrice, currency: fmtPrice,
  market_cap_b: fmtMarketCap, signed_percent: fmtPct, percent: fmtNeutralPct,
  volume: fmtVolume, relative_volume: fmtRelVol, pe: fmtPE,
  eps: fmtPrice, yield: fmtYield, beta: fmtBeta, rank: fmtRank,
};
function selectFormatter(key, declared) {
  if (typeof declared === 'string' && FORMAT_HANDLERS[declared]) return FORMAT_HANDLERS[declared];
  if (KNOWN_FORMATS[key]) return FORMAT_HANDLERS[KNOWN_FORMATS[key]];
  // Explicit _pct suffix is safe for '%' unit only; never assume positive = good.
  if (key.toLowerCase().endsWith('_pct')) return fmtNeutralPct;
  // Unknown fields are shown without guessed financial units or scaling.
  return fmtPlain;
}

function getRequestUrl() {
  if (!isBackend()) return DEMO_DATA_URL;
  const url = new URL(BACKEND_API_URL, window.location.href);
  url.searchParams.set('date_range', selectedRange);
  return url.toString();
}

async function loadStocks() {
  const id = ++requestId;
  if (activeRequest) activeRequest.abort();
  activeRequest = new AbortController();
  showLoading();
  hideError();
  try {
    const response = await fetch(getRequestUrl(), { signal: activeRequest.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} — ${response.statusText}`);
    const payload = await response.json();
    if (id !== requestId) return;
    const { rows, metadata } = transformData(payload);
    sourceMetadata = metadata;
    stockData = rows;
    buildColumns(rows, metadata);
    // In API mode, preserve backend's period-specific order until user sorts.
    // The original demo retains its prior Ticker A–Z default.
    sortKey = isBackend() ? null : (fieldKeys.ticker || columns[0]?.key || null);
    sortDir = 'asc';
    currentPage = 1;
    renderTable();
    buildToolbar();
    updateSectorOptions();
    applyFilters();
    renderSourceNotice();
    renderFooter();
    hideLoading();
    showApp();
  } catch (error) {
    if (id !== requestId || error.name === 'AbortError') return;
    showError('Unable to load stock data: ' + (error?.message || 'Unknown error'));
  }
}

function renderTable() {
  const wrapper = document.getElementById('tableWrapper');
  wrapper.replaceChildren(); // dynamic schema may change after a date-range request
  const table = document.createElement('table');
  table.className = 'stocks-table';
  table.setAttribute('aria-label', 'All Stocks');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = col.header;
    th.dataset.sortKey = col.key;
    th.dataset.sortType = col.sortType;
    th.tabIndex = 0;
    th.setAttribute('role', 'columnheader');
    th.setAttribute('aria-sort', col.key === sortKey ? 'ascending' : 'none');
    if (col.cssClass) th.classList.add(col.cssClass);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  thead.addEventListener('click', onSortClick);
  thead.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSortClick(e); }
  });
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  tbody.id = 'stocksTbody';
  table.appendChild(tbody);
  wrapper.appendChild(table);
  wrapper.scrollLeft = 0;
}

function renderTableBody(rows) {
  const tbody = document.getElementById('stocksTbody');
  tbody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = Math.max(1, columns.length);
    td.className = 'empty-state';
    td.textContent = 'No stocks match your search.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const stock of rows) {
    const tr = document.createElement('tr');
    if (fieldKeys.ticker) tr.dataset.ticker = String(stock[fieldKeys.ticker] ?? '');
    for (const col of columns) {
      const td = document.createElement('td');
      const value = stock[col.key];
      const formatted = col.fmt(value);
      if (col.key === fieldKeys.company && !isMissing(value)) {
        // Inner scroll region preserves the full name without widening the
        // pinned Company column. Drag the small scrollbar or use arrow keys.
        const nameScroller = document.createElement('span');
        nameScroller.className = 'company-name-scroll';
        nameScroller.textContent = formatted.text;
        nameScroller.title = String(value); // full name also on hover
        nameScroller.tabIndex = 0;           // keyboard scroll support
        td.appendChild(nameScroller);
        td.title = String(value);
      } else {
        td.textContent = formatted.text;
      }
      if (formatted.cssClass) td.classList.add(formatted.cssClass);
      if (col.cssClass) td.classList.add(col.cssClass);
      tr.appendChild(td);
    }
    fragment.appendChild(tr);
  }
  tbody.appendChild(fragment);
}

function applySort() {
  if (!sortKey) return [...filtered];
  const type = columns.find(col => col.key === sortKey)?.sortType || 'string';
  const direction = sortDir === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    let left = a[sortKey], right = b[sortKey];
    const missingLeft = isMissing(left), missingRight = isMissing(right);
    if (missingLeft && missingRight) return 0;
    if (missingLeft) return 1;
    if (missingRight) return -1;
    if (type === 'number') {
      left = numericValue(left); right = numericValue(right);
      if (left === null) return 1;
      if (right === null) return -1;
      return direction * (left - right);
    }
    if (type === 'date') return direction * (Date.parse(left) - Date.parse(right));
    return direction * String(left).localeCompare(String(right), undefined, { sensitivity: 'base', numeric: true });
  });
}
function onSortClick(event) {
  const th = event.target.closest('th[data-sort-key]');
  if (!th) return;
  const key = th.dataset.sortKey;
  if (key === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortKey = key; sortDir = 'asc'; }
  currentPage = 1;
  renderPage();
}
function updateSortIndicators() {
  document.querySelectorAll('.stocks-table thead th[data-sort-key]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    const selected = th.dataset.sortKey === sortKey;
    th.setAttribute('aria-sort', selected ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    if (selected) th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}
function applyFilters() {
  const search = (document.getElementById('stockSearch')?.value || '').trim().toLowerCase();
  const sector = document.getElementById('sectorFilter')?.value || '';
  filtered = stockData.filter(row => {
    // Generic string search works even when 'ticker'/'company_name' are renamed.
    const matchesSearch = !search || columns.some(col => {
      const value = row[col.key];
      return typeof value === 'string' && value.toLowerCase().includes(search);
    });
    const matchesSector = !sector || (fieldKeys.sector && String(row[fieldKeys.sector] ?? '') === sector);
    return matchesSearch && matchesSector;
  });
  currentPage = 1;
  renderPage();
}
function renderPage() {
  const rows = applySort();
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const start = (currentPage - 1) * PAGE_SIZE;
  renderTableBody(rows.slice(start, start + PAGE_SIZE));
  updateSortIndicators();
  renderSummary(rows.length);
  renderPagination(totalPages);
}
function renderSummary(total) {
  const node = document.getElementById('stocksSummary');
  if (!node) return;
  if (!total) { node.textContent = 'No stocks found.'; return; }
  const first = (currentPage - 1) * PAGE_SIZE + 1;
  const last = Math.min(currentPage * PAGE_SIZE, total);
  node.textContent = `Showing ${first}–${last} of ${total} stock${total !== 1 ? 's' : ''}`;
}
function renderPagination(totalPages) {
  const bar = document.getElementById('paginationBar');
  bar.replaceChildren();
  if (totalPages <= 1) return;
  const button = (label, page, disabled, className = '') => {
    const node = document.createElement('button');
    node.type = 'button'; node.textContent = label; node.disabled = disabled;
    node.className = className;
    if (className.includes('active')) node.setAttribute('aria-current', 'page');
    node.addEventListener('click', () => { currentPage = page; renderPage(); });
    bar.appendChild(node);
    return node;
  };
  button('Previous', currentPage - 1, currentPage === 1).id = 'prevBtn';
  for (let page = 1; page <= totalPages; page++) {
    const node = button(String(page), page, false, `page-btn${page === currentPage ? ' active' : ''}`);
    node.dataset.page = String(page);
  }
  button('Next', currentPage + 1, currentPage === totalPages).id = 'nextBtn';
}

function buildToolbar() {
  if (toolbarCreated) return;
  const toolbar = document.getElementById('stocksToolbar');
  if (!toolbar) return;
  toolbar.innerHTML = `
    <div class="search-group">
      <label for="stockSearch">Search</label>
      <input type="search" id="stockSearch" placeholder="Ticker or company…" autocomplete="off" aria-label="Search stocks" />
    </div>
    <div class="filter-group">
      <label for="sectorFilter">Sector</label>
      <select id="sectorFilter" aria-label="Filter by sector"><option value="">All Sectors</option></select>
    </div>
    <div class="filter-group date-range-group">
      <label for="dateRange">Date Range</label>
      <select id="dateRange" aria-label="Select date range"></select>
    </div>
  `;
  const dateRange = document.getElementById('dateRange');
  for (const [key, label] of DATE_RANGES) {
    const option = document.createElement('option');
    option.value = key; option.textContent = label;
    dateRange.appendChild(option);
  }
  dateRange.value = selectedRange;
  dateRange.addEventListener('change', () => {
    selectedRange = dateRange.value;
    if (isBackend()) loadStocks();
    else renderSourceNotice();  // no misleading simulated period changes
  });
  document.getElementById('stockSearch').addEventListener('input', applyFilters);
  document.getElementById('sectorFilter').addEventListener('change', applyFilters);
  toolbarCreated = true;
}
function updateSectorOptions() {
  const node = document.getElementById('sectorFilter');
  if (!node) return;
  const previous = node.value;
  node.replaceChildren();
  const all = document.createElement('option');
  all.value = ''; all.textContent = 'All Sectors'; node.appendChild(all);
  if (fieldKeys.sector) {
    const sectors = [...new Set(stockData.map(s => s[fieldKeys.sector]).filter(v => typeof v === 'string' && v))].sort();
    for (const sector of sectors) {
      const option = document.createElement('option');
      option.value = sector; option.textContent = sector;
      node.appendChild(option);
    }
    if (sectors.includes(previous)) node.value = previous;
    node.disabled = false;
  } else {
    node.disabled = true;
    all.textContent = 'Sector unavailable';
  }
}
function renderSourceNotice() {
  const notice = document.getElementById('rangeNotice');
  if (!notice) return;
  if (!isBackend()) {
    notice.textContent = 'Demo data only — Date Range is saved as a selection but does not change this static JSON. Period-specific results will come from the backend.';
    return;
  }
  if (sourceMetadata.date_range === selectedRange) {
    notice.textContent = `Showing backend response for ${DATE_RANGES.find(([key]) => key === selectedRange)?.[1]}.`;
  } else {
    notice.textContent = 'Data returned by backend. Verify that the backend applied the requested date range.';
  }
}
function renderFooter() {
  const footer = document.getElementById('pageFooter');
  if (!footer) return;
  const source = isBackend() ? 'a configured backend service' : 'stock_universe_40.json (a static demo snapshot)';
  footer.textContent = `MarketScope displays ${stockData.length} stocks. Financial data is supplied by ${source} and has not been independently verified. ` +
    `Rankings, if supplied, are shown as received and not calculated by this application. ` +
    `This application is for educational and demonstration purposes only and does not constitute investment advice.`;
}
function showLoading() { document.getElementById('stocksLoading')?.classList.remove('hidden'); }
function hideLoading() { document.getElementById('stocksLoading')?.classList.add('hidden'); }
function showApp() { document.getElementById('stocksApp')?.classList.remove('hidden'); }
function hideError() { document.getElementById('stocksError')?.classList.add('hidden'); }
function showError(message) {
  hideLoading();
  const text = document.getElementById('stocksErrorText');
  if (text) text.textContent = message;
  document.getElementById('stocksError')?.classList.remove('hidden');
}

loadStocks();

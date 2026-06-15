'use strict';

/* ============================================================
   STATE
============================================================ */
const state = {
  expression: '',   // raw expression shown, e.g. "12+8"
  result: '0',      // last evaluated / current display value
  justEvaluated: false,
};

const HISTORY_KEY = 'calc.history';
const NOTES_KEY = 'calc.notes';
const NOTES_TS_KEY = 'calc.notes.timestamp';
const HISTORY_LIMIT = 20;

/* ============================================================
   DOM REFERENCES
============================================================ */
const expressionEl = document.getElementById('expression');
const resultEl = document.getElementById('result');
const keypad = document.getElementById('keypad');

const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

const notesArea = document.getElementById('notesArea');
const notesMeta = document.getElementById('notesMeta');
const clearNotesBtn = document.getElementById('clearNotesBtn');

const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

/* ============================================================
   HELPERS
============================================================ */

const OP_MAP = {
  '×': '*',
  '÷': '/',
  '−': '-',
  '+': '+',
};

const isOperator = (char) => ['+', '−', '×', '÷'].includes(char);

function formatNumber(num) {
  if (!isFinite(num)) return 'Error';
  const rounded = Math.round(num * 1e10) / 1e10;
  return rounded.toString();
}

/* ============================================================
   CALCULATOR CORE
============================================================ */

/**
 * Evaluates the current expression string and returns a numeric result.
 * Throws an error for invalid / malformed expressions.
 */
function calculate(expression) {
  if (!expression) return 0;

  const trimmed = expression.trim();
  if (trimmed === '') return 0;
  if (isOperator(trimmed[trimmed.length - 1])) {
    throw new Error('Incomplete expression');
  }

  // Convert display symbols to JS operators
  let jsExpression = '';
  for (const char of trimmed) {
    jsExpression += OP_MAP[char] || char;
  }

  // Only allow safe characters
  if (!/^[0-9+\-*/.\s]+$/.test(jsExpression)) {
    throw new Error('Invalid characters');
  }

  let value;
  try {
    // eslint-disable-next-line no-new-func
    value = Function(`"use strict"; return (${jsExpression});`)();
  } catch (err) {
    throw new Error('Invalid expression');
  }

  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error('Math error');
  }

  return value;
}

/* ============================================================
   DISPLAY UPDATES
============================================================ */

function updateDisplay() {
  expressionEl.textContent = state.expression;
  resultEl.textContent = state.result;
  resultEl.classList.remove('is-error');
}

function bumpResult() {
  resultEl.classList.remove('bump');
  requestAnimationFrame(() => resultEl.classList.add('bump'));
}

function showError() {
  state.result = 'Error';
  resultEl.textContent = 'Error';
  resultEl.classList.add('is-error');
  bumpResult();
}

/* ============================================================
   INPUT HANDLING
============================================================ */

function appendValue(value) {
  if (state.justEvaluated) {
    if (!isOperator(value)) {
      state.expression = '';
      state.result = '0';
    } else {
      state.expression = state.result;
    }
    state.justEvaluated = false;
  }

  // Prevent leading operator (except minus for negative numbers)
  if (state.expression === '' && isOperator(value)) {
    if (value !== '−') return;
  }

  const last = state.expression[state.expression.length - 1];

  // Replace consecutive operator instead of appending
  if (isOperator(value) && isOperator(last)) {
    state.expression = state.expression.slice(0, -1) + value;
    updateDisplay();
    return;
  }

  // Prevent multiple decimals in current number segment
  if (value === '.') {
    const segments = state.expression.split(/[+\-−×÷]/);
    const currentSegment = segments[segments.length - 1];
    if (currentSegment.includes('.')) return;
    if (currentSegment === '') {
      state.expression += '0';
    }
  }

  state.expression += value;
  updateDisplay();
}

function clearAll() {
  state.expression = '';
  state.result = '0';
  state.justEvaluated = false;
  updateDisplay();
}

function deleteLast() {
  if (state.justEvaluated) {
    clearAll();
    return;
  }
  state.expression = state.expression.slice(0, -1);
  updateDisplay();
}

function applyPercent() {
  if (!state.expression) return;

  const match = state.expression.match(/(-?\d+(\.\d+)?)$/);
  if (!match) return;

  const num = parseFloat(match[0]);
  const percentValue = formatNumber(num / 100);
  state.expression = state.expression.slice(0, match.index) + percentValue;
  updateDisplay();
}

function evaluateExpression() {
  if (!state.expression) return;

  try {
    const value = calculate(state.expression);
    const formatted = formatNumber(value);
    const exprForHistory = state.expression;

    state.result = formatted;
    state.justEvaluated = true;
    updateDisplay();
    bumpResult();

    saveToHistory(exprForHistory, formatted);
  } catch (err) {
    showError();
    state.justEvaluated = true;
    state.expression = '';
  }
}

/* ============================================================
   HISTORY SYSTEM
============================================================ */

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToHistory(expression, result) {
  const history = loadHistory();

  const latest = history[0];
  // Prevent duplicate consecutive entries
  if (latest && latest.expression === expression && latest.result === result) {
    return;
  }

  history.unshift({ expression, result });

  if (history.length > HISTORY_LIMIT) {
    history.length = HISTORY_LIMIT;
  }

  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = loadHistory();

  historyList.innerHTML = '';

  if (history.length === 0) {
    historyList.appendChild(historyEmpty);
    historyEmpty.style.display = 'block';
    return;
  }

  history.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Restore result ${entry.result} from ${entry.expression}`);

    const exprDiv = document.createElement('div');
    exprDiv.className = 'expr';
    exprDiv.textContent = entry.expression + ' =';

    const resDiv = document.createElement('div');
    resDiv.className = 'res';
    resDiv.textContent = entry.result;

    li.appendChild(exprDiv);
    li.appendChild(resDiv);

    li.addEventListener('click', () => restoreFromHistory(entry));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        restoreFromHistory(entry);
      }
    });

    historyList.appendChild(li);
  });
}

function restoreFromHistory(entry) {
  state.expression = entry.result;
  state.result = entry.result;
  state.justEvaluated = true;
  updateDisplay();
  bumpResult();
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

/* ============================================================
   NOTES FEATURE
============================================================ */

function loadNotes() {
  const text = localStorage.getItem(NOTES_KEY) || '';
  const timestamp = localStorage.getItem(NOTES_TS_KEY);

  notesArea.value = text;
  updateNotesMeta(timestamp);
}

function updateNotesMeta(timestamp) {
  if (!timestamp) {
    notesMeta.textContent = notesArea.value ? 'Saved' : 'Not saved yet';
    return;
  }

  const date = new Date(Number(timestamp));
  const formatted = date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  notesMeta.textContent = `Last saved ${formatted}`;
}

// Debounced auto-save handler for notes
let notesSaveTimer = null;
function handleNotes() {
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(() => {
    const text = notesArea.value;
    const timestamp = Date.now();

    localStorage.setItem(NOTES_KEY, text);
    localStorage.setItem(NOTES_TS_KEY, String(timestamp));

    updateNotesMeta(text ? timestamp : null);
  }, 300);
}

function clearNotes() {
  notesArea.value = '';
  localStorage.removeItem(NOTES_KEY);
  localStorage.removeItem(NOTES_TS_KEY);
  notesMeta.textContent = 'Not saved yet';
  notesArea.focus();
}

/* ============================================================
   TABS
============================================================ */

function switchTab(targetTab) {
  tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === targetTab;
    tab.classList.toggle('tab--active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  tabContents.forEach((content) => {
    content.classList.toggle('tab-content--active', content.dataset.content === targetTab);
  });
}

/* ============================================================
   EVENT LISTENERS — KEYPAD
============================================================ */

keypad.addEventListener('click', (e) => {
  const button = e.target.closest('.key');
  if (!button) return;

  const { action, value } = button.dataset;

  if (action === 'clear') {
    clearAll();
  } else if (action === 'delete') {
    deleteLast();
  } else if (action === 'percent') {
    applyPercent();
  } else if (action === 'equals') {
    evaluateExpression();
  } else if (value) {
    appendValue(value);
  }
});

/* ============================================================
   EVENT LISTENERS — KEYBOARD SUPPORT
============================================================ */

const KEY_TO_OPERATOR = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
};

document.addEventListener('keydown', (e) => {
  const { key } = e;

  if (/^[0-9]$/.test(key)) {
    appendValue(key);
    return;
  }

  if (key === '.') {
    appendValue('.');
    return;
  }

  if (KEY_TO_OPERATOR[key]) {
    e.preventDefault();
    appendValue(KEY_TO_OPERATOR[key]);
    return;
  }

  if (key === 'Enter' || key === '=') {
    e.preventDefault();
    evaluateExpression();
    return;
  }

  if (key === 'Backspace') {
    if (document.activeElement === notesArea) return;
    deleteLast();
    return;
  }

  if (key === 'Escape') {
    if (document.activeElement === notesArea) return;
    clearAll();
    return;
  }

  if (key === '%') {
    applyPercent();
    return;
  }
});

/* ============================================================
   EVENT LISTENERS — HISTORY & NOTES CONTROLS
============================================================ */

clearHistoryBtn.addEventListener('click', clearHistory);
clearNotesBtn.addEventListener('click', clearNotes);
notesArea.addEventListener('input', handleNotes);

tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

/* ============================================================
   INIT
============================================================ */

function init() {
  updateDisplay();
  renderHistory();
  loadNotes();
}

init();
// Zen Dice Timer — Frontend Application

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RATING_LABELS = ['', 'Terrible', 'Bad', 'Okay', 'Good', 'Great'];

let activeSession = null;
let remainingSeconds = 0;
let sessionStatus = 'idle';
let selectedRating = 3;
let charts = {};
let notificationPermitted = false;

// --- DOM refs ---
const sessionIdle = document.getElementById('session-idle');
const sessionRunning = document.getElementById('session-running');
const sessionDone = document.getElementById('session-done');
const taskInput = document.getElementById('task-input');
const btnStart = document.getElementById('btn-start');
const btnCancel = document.getElementById('btn-cancel');
const btnSubmit = document.getElementById('btn-submit');
const countdownDisplay = document.getElementById('countdown-display');
const countdownLabel = document.getElementById('countdown-label');
const progressSlider = document.getElementById('progress-slider');
const progressValue = document.getElementById('progress-value');
const ratingEmojis = document.getElementById('rating-emojis');

// --- INIT ---
async function init() {
  await fetchActiveSession();
  await refreshAll();
  connectWebSocket();
  setupEventListeners();
  requestNotificationPermission();
}

async function fetchActiveSession() {
  const resp = await fetch('/api/sessions/active');
  const data = await resp.json();
  activeSession = data.session;
  remainingSeconds = data.remaining_seconds;
  sessionStatus = data.status;
  updateSessionState();
}

// --- WEBSOCKET ---
let ws;
function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onmessage = (evt) => {
    const data = JSON.parse(evt.data);
    handleWSMessage(data);
  };
  ws.onclose = () => { setTimeout(connectWebSocket, 2000); };
  ws.onerror = () => { ws.close(); };
}

function handleWSMessage(data) {
  if (data.type === 'session_update') {
    activeSession = data.session;
    remainingSeconds = data.remaining_seconds;
    sessionStatus = data.status;
    updateSessionState();
  }
  if (data.type === 'session_time_up') {
    showNotification('Time is up!', 'Your dice session has ended.');
    updateSessionState();
  }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startSession();
  });

  document.getElementById('task-types').addEventListener('click', (e) => {
    const chip = e.target.closest('.task-chip');
    if (!chip) return;
    taskInput.value = chip.dataset.task;
    // highlight selected
    document.querySelectorAll('.task-chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    taskInput.focus();
  });

  btnStart.addEventListener('click', startSession);
  btnCancel.addEventListener('click', cancelSession);
  btnSubmit.addEventListener('click', submitSession);

  progressSlider.addEventListener('input', () => {
    progressValue.textContent = progressSlider.value + '%';
  });

  ratingEmojis.addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-btn');
    if (!btn) return;
    selectedRating = parseInt(btn.dataset.rating);
    ratingEmojis.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
}

// --- SESSION STATE MANAGEMENT ---
let lastRenderState = null;

function updateSessionState() {
  const state = !activeSession ? 'idle' : sessionStatus;

  if (state === 'idle') {
    if (lastRenderState !== 'idle') {
      showSessionState('idle');
      lastRenderState = 'idle';
    }
    return;
  }

  if (state === 'running') {
    showSessionState('running');
    document.getElementById('tile-task-display').textContent = activeSession.task || '(no task)';
    updateCountdown();
    lastRenderState = 'running';
  } else if (state === 'time_up') {
    showSessionState('done');
    document.getElementById('tile-done-task').textContent = activeSession.task || '(no task)';
    if (lastRenderState !== 'done') {
      progressSlider.value = 70;
      progressValue.textContent = '70%';
      selectedRating = 3;
      ratingEmojis.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
      const midBtn = ratingEmojis.querySelector('[data-rating="3"]');
      if (midBtn) midBtn.classList.add('selected');
    }
    lastRenderState = 'done';
  }
}

function showSessionState(state) {
  sessionIdle.style.display = state === 'idle' ? '' : 'none';
  sessionRunning.style.display = state === 'running' ? '' : 'none';
  sessionDone.style.display = state === 'done' ? '' : 'none';
}

// --- COUNTDOWN ---
let countdownInterval = null;
function updateCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  const tick = () => {
    if (sessionStatus !== 'running' || !activeSession) {
      if (countdownInterval) clearInterval(countdownInterval);
      return;
    }
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    countdownDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    countdownLabel.textContent = `${activeSession.rolled_minutes} min session`;
    if (remainingSeconds <= 0) {
      countdownDisplay.textContent = '00:00';
      if (countdownInterval) clearInterval(countdownInterval);
    }
    remainingSeconds = Math.max(0, remainingSeconds - 1);
  };
  tick();
  countdownInterval = setInterval(tick, 1000);
}

// --- START SESSION ---
async function startSession() {
  const minutes = parseInt(document.getElementById('minutes-input').value);
  if (!minutes || minutes < 1) {
    alert('Please enter a valid number of minutes.');
    return;
  }
  const task = taskInput.value.trim();

  const resp = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, minutes }),
  });
  const data = await resp.json();
  activeSession = data.session;
  sessionStatus = 'running';
  const created = new Date(activeSession.created_at + 'Z');
  const endTime = new Date(created.getTime() + activeSession.total_seconds * 1000);
  remainingSeconds = Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000));

  updateSessionState();
  await refreshAll();
}

// --- CANCEL SESSION ---
async function cancelSession() {
  if (!activeSession) return;
  const resp = await fetch(`/api/sessions/${activeSession.id}/cancel`, { method: 'POST' });
  await resp.json();
  activeSession = null;
  sessionStatus = 'idle';
  remainingSeconds = 0;
  lastRenderState = null;
  if (countdownInterval) clearInterval(countdownInterval);
  showSessionState('idle');
  await refreshAll();
}

// --- SUBMIT SESSION ---
async function submitSession() {
  if (!activeSession) return;
  const progress = parseInt(progressSlider.value);
  const resp = await fetch(`/api/sessions/${activeSession.id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      progress_percent: progress,
      satisfaction_rating: selectedRating,
    }),
  });
  await resp.json();
  activeSession = null;
  sessionStatus = 'idle';
  remainingSeconds = 0;
  lastRenderState = null;
  if (countdownInterval) clearInterval(countdownInterval);
  updateSessionState();
  await refreshAll();
}

// --- NOTIFICATIONS ---
async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    notificationPermitted = true;
    return;
  }
  if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    notificationPermitted = perm === 'granted';
  }
}

function showNotification(title, body) {
  if (!notificationPermitted) return;
  try {
    new Notification(title, { body, icon: '/static/favicon.ico' });
  } catch (e) { /* ignore */ }
}

// --- DATA REFRESH ---
async function refreshAll() {
  await Promise.all([
    loadHistory(),
    loadSummary(),
    loadWeekly(),
    loadMonthly(),
    loadHeatmap(),
    loadProgressByDuration(),
    loadProgressByWeekday(),
    loadKeywords(),
    loadStreaks(),
  ]);
}

// --- HISTORY ---
async function loadHistory() {
  const resp = await fetch('/api/sessions/history?limit=50');
  const data = await resp.json();
  const tbody = document.querySelector('#history-table tbody');
  tbody.innerHTML = data.sessions.map(s => {
    const date = s.created_at ? s.created_at.replace('T', ' ').substring(0, 16) : '';
    const task = (s.task || '—').substring(0, 40);
    const statusClass = `status-${s.status}`;
    const progress = s.progress_percent != null ? `${s.progress_percent}%` : '—';
    const rating = s.satisfaction_rating != null ? RATING_LABELS[s.satisfaction_rating] : '—';
    return `<tr>
      <td>${date}</td>
      <td title="${escapeHtml(s.task || '')}">${escapeHtml(task)}</td>
      <td>${s.rolled_minutes}m</td>
      <td><span class="status-badge ${statusClass}">${s.status}</span></td>
      <td>${progress}</td>
      <td>${rating}</td>
    </tr>`;
  }).join('');
}

// --- SUMMARY ---
async function loadSummary() {
  const resp = await fetch('/api/analytics/summary');
  const d = await resp.json();
  document.getElementById('hd-total-min').textContent = d.total_minutes;
  document.getElementById('hd-completed').textContent = d.completed;
  document.getElementById('hd-cancelled').textContent = d.cancelled;

  const avgSat = d.avg_satisfaction ? d.avg_satisfaction.toFixed(1) : '—';
  const avgProg = d.avg_progress ? d.avg_progress + '%' : '—';
  document.getElementById('summary-cards').innerHTML = `
    <div class="summary-card"><div class="sc-value">${d.total}</div><div class="sc-label">Total Sessions</div></div>
    <div class="summary-card"><div class="sc-value">${d.completed}</div><div class="sc-label">Completed</div></div>
    <div class="summary-card"><div class="sc-value">${d.cancelled}</div><div class="sc-label">Cancelled</div></div>
    <div class="summary-card"><div class="sc-value">${avgSat}</div><div class="sc-label">Avg Satisfaction</div></div>
    <div class="summary-card"><div class="sc-value">${avgProg}</div><div class="sc-label">Avg Progress</div></div>
    <div class="summary-card"><div class="sc-value">${d.total_minutes}m</div><div class="sc-label">Total Minutes</div></div>
  `;
}

// --- STREAKS (in summary) ---
async function loadStreaks() {
  const resp = await fetch('/api/analytics/streaks');
  const d = await resp.json();
  // add streak info to summary if container exists
  const cards = document.getElementById('summary-cards');
  if (cards) {
    const streakHtml = `
      <div class="summary-card"><div class="sc-value">${d.current_streak}d</div><div class="sc-label">Current Streak</div></div>
      <div class="summary-card"><div class="sc-value">${d.longest_streak}d</div><div class="sc-label">Longest Streak</div></div>
    `;
    // append to existing cards
    cards.innerHTML += streakHtml;
  }
}

// --- CHARTS ---
function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

async function loadWeekly() {
  const resp = await fetch('/api/analytics/weekly');
  const { data } = await resp.json();
  destroyChart('weekly');

  const labels = [];
  const completedData = [];
  const cancelledData = [];
  // fill last 7 days
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().substring(0, 10);
    labels.push(WEEKDAYS[d.getDay()]);
    const match = data.find(r => r.day === key);
    completedData.push(match ? match.completed || 0 : 0);
    cancelledData.push(match ? match.cancelled || 0 : 0);
  }

  const ctx = document.getElementById('chart-weekly').getContext('2d');
  charts.weekly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Completed',
          data: completedData,
          backgroundColor: '#2c2c2c',
          borderRadius: 4,
        },
        {
          label: 'Cancelled',
          data: cancelledData,
          backgroundColor: '#c75b5b',
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#e0dcd5' }, ticks: { stepSize: 1, font: { size: 11 } } },
      },
    },
  });
}

async function loadMonthly() {
  const resp = await fetch('/api/analytics/monthly');
  const { data } = await resp.json();
  destroyChart('monthly');

  const ctx = document.getElementById('chart-monthly').getContext('2d');
  charts.monthly = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(r => r.month),
      datasets: [
        {
          label: 'Sessions',
          data: data.map(r => r.completed || 0),
          borderColor: '#2c2c2c',
          backgroundColor: 'rgba(44,44,44,0.04)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#2c2c2c',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#e0dcd5' }, ticks: { stepSize: 1, font: { size: 11 } } },
      },
    },
  });
}

// --- HEATMAP ---
async function loadHeatmap() {
  const resp = await fetch('/api/analytics/satisfaction-heatmap');
  const { data } = await resp.json();
  const container = document.getElementById('heatmap');
  container.innerHTML = '';

  // header row
  container.appendChild(createDiv('heatmap-label', ''));
  for (let h = 0; h < 24; h++) {
    container.appendChild(createDiv('heatmap-header', h.toString().padStart(2, '0')));
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Build lookup
  const lookup = {};
  data.forEach(r => { lookup[`${r.weekday}_${r.hour}`] = r; });

  for (let wd = 0; wd < 7; wd++) {
    container.appendChild(createDiv('heatmap-label', days[wd]));
    for (let h = 0; h < 24; h++) {
      const cell = lookup[`${wd}_${h}`];
      let bg = '#f0ede6';
      if (cell && cell.avg_satisfaction) {
        const sat = cell.avg_satisfaction;
        const t = (sat - 1) / 4; // 0 to 1
        const r = Math.round(44 + 200 * (1 - t));
        const g = Math.round(44 + 100 * t);
        const b = Math.round(44 + 100 * t);
        bg = `rgb(${r},${g},${b})`;
      }
      const el = createDiv('heatmap-cell', '');
      el.style.backgroundColor = bg;
      if (cell) el.title = `Sat: ${cell.avg_satisfaction.toFixed(1)} (${cell.count} sessions)`;
      container.appendChild(el);
    }
  }
}

function createDiv(cls, text) {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}

// --- PROGRESS BY DURATION ---
async function loadProgressByDuration() {
  const resp = await fetch('/api/analytics/progress-by-duration');
  const { data } = await resp.json();
  destroyChart('progressDur');

  const ctx = document.getElementById('chart-progress-dur').getContext('2d');
  charts.progressDur = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(r => `${r.rolled_minutes}m`),
      datasets: [{
        label: 'Avg Progress %',
        data: data.map(r => r.avg_progress),
        backgroundColor: '#2c2c2c',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#e0dcd5' }, max: 100, ticks: { font: { size: 11 } } },
      },
    },
  });
}

// --- PROGRESS BY WEEKDAY ---
async function loadProgressByWeekday() {
  const resp = await fetch('/api/analytics/progress-by-weekday');
  const { data } = await resp.json();
  destroyChart('progressWeekday');

  const labels = WEEKDAYS;
  const progressData = labels.map((_, i) => {
    const match = data.find(r => r.weekday === i);
    return match ? match.avg_progress : null;
  });
  const satData = labels.map((_, i) => {
    const match = data.find(r => r.weekday === i);
    return match ? match.avg_satisfaction : null;
  });

  const ctx = document.getElementById('chart-progress-wd').getContext('2d');
  charts.progressWeekday = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Avg Progress %',
          data: progressData,
          backgroundColor: '#2c2c2c',
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Avg Satisfaction',
          data: satData.map(v => v ? v * 20 : null),
          backgroundColor: '#c75b5b',
          borderRadius: 4,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#e0dcd5' }, max: 100, ticks: { font: { size: 11 } }, title: { display: true, text: '%' } },
        y1: { position: 'right', grid: { display: false }, max: 100, ticks: { font: { size: 11 } }, title: { display: true, text: 'sat*20' } },
      },
    },
  });
}

// --- KEYWORDS ---
async function loadKeywords() {
  const resp = await fetch('/api/analytics/keywords');
  const { data } = await resp.json();
  const container = document.getElementById('keyword-cloud');
  if (!data.length) {
    container.innerHTML = '<span style="color:#c0bbb0;font-size:13px;">No task data yet.</span>';
    return;
  }
  const maxCount = data[0].count;
  container.innerHTML = data.map(kw => {
    const size = 12 + (kw.count / maxCount) * 20;
    const opacity = 0.4 + (kw.count / maxCount) * 0.6;
    return `<span class="keyword-tag" style="font-size:${size}px;opacity:${opacity};font-weight:${opacity > 0.7 ? 500 : 300}">${escapeHtml(kw.word)}<span class="kw-count">${kw.count}</span></span>`;
  }).join('');
}

// --- UTIL ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// --- STARTUP ---
init();

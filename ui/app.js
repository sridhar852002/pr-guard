const DEFAULT_PR =
  'https://github.com/sridhar852002/vulnerable-api-fixture/pull/1';

const $ = (sel) => document.querySelector(sel);
const steps = [...document.querySelectorAll('.step')];

let sessionId = null;
let turnId = null;
let polling = false;
let pendingAction = null;
let elapsedTimer = null;
let elapsedSec = 0;

function ts() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatElapsed(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function startElapsed() {
  elapsedSec = 0;
  $('#elapsed').textContent = '0:00';
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    elapsedSec++;
    $('#elapsed').textContent = formatElapsed(elapsedSec);
  }, 1000);
}

function stopElapsed() {
  clearInterval(elapsedTimer);
}

function log(msg, kind = '') {
  const icons = { warn: '!', success: '✓', tool: '⎇', sandbox: '▶', security: '◆' };
  const li = document.createElement('li');
  if (kind) li.classList.add(kind);
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = ts();
  const iconEl = document.createElement('span');
  iconEl.className = 'icon';
  iconEl.textContent = icons[kind] || '·';
  const text = document.createElement('span');
  text.textContent = String(msg);
  li.append(time, iconEl, text);
  $('#activity-log').prepend(li);
}

function validatePrUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (!/^github\.com$/i.test(u.hostname)) return null;
  if (!/^\/[\w.-]+\/[\w.-]+\/pull\/\d+\/?$/.test(u.pathname)) return null;
  return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
}

function setStatus(text, cls) {
  const el = $('#run-status');
  el.textContent = text;
  el.className = `run-pill ${cls}`;
}

function setStage(name) {
  const order = ['read', 'sandbox', 'security', 'draft', 'gate', 'done'];
  const idx = order.indexOf(name);
  steps.forEach((s, i) => {
    s.classList.remove('active', 'done', 'gate-active');
    if (i < idx) s.classList.add('done');
    else if (i === idx) {
      s.classList.add(name === 'gate' ? 'gate-active' : 'active');
    }
  });
}

function parseFindings(text) {
  const findings = [];
  const re =
    /\[(High|Medium|Low|HIGH|MEDIUM|LOW)\][^\n—-]*[—-]\s*([^\n:]+(?::\d+)?)?[^\n—-]*[—-]\s*([^\n]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    findings.push({
      severity: m[1].toLowerCase(),
      location: (m[2] || '').trim(),
      text: (m[3] || m[0]).trim(),
    });
  }
  if (findings.length === 0) {
    const simple = text.match(/\[(High|Medium|Low)\][^\n]+/gi) || [];
    simple.forEach((line) => {
      const sm = line.match(/\[(High|Medium|Low)\]\s*(.*)/i);
      if (sm) {
        findings.push({ severity: sm[1].toLowerCase(), location: '', text: sm[2].trim() });
      }
    });
  }
  return findings;
}

function renderFindings(text) {
  const list = $('#findings-list');
  const findings = parseFindings(text);
  $('#findings-count').textContent = String(findings.length);

  if (!findings.length) {
    list.innerHTML =
      '<p class="empty">Findings appear when the security scan completes.</p>';
    return;
  }

  list.innerHTML = findings
    .map(
      (f) => `
    <article class="finding-card ${f.severity}">
      <div class="finding-sev">${f.severity}</div>
      ${f.location ? `<div class="finding-loc">${escapeHtml(f.location)}</div>` : ''}
      <div class="finding-text">${escapeHtml(f.text)}</div>
    </article>`,
    )
    .join('');
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function guessStage(text, hasActions) {
  if (hasActions) return 'gate';
  const t = (text || '').toLowerCase();
  if (/posted|review comment|successfully|completed review/i.test(t)) return 'done';
  if (/draft|findings|\[high\]|\[medium\]/i.test(t)) return 'draft';
  if (/security|skill|injection|secret|auth/i.test(t)) return 'security';
  if (/sandbox|npm test|pytest|clone|subagent/i.test(t)) return 'sandbox';
  if (/pull_request_read|diff|reading|mcp/i.test(t)) return 'read';
  return 'read';
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `${res.status} ${path}`);
  }
  return json;
}

async function checkHarness() {
  const el = $('#harness-status');
  try {
    await api('GET', '/api/v1/agents');
    el.textContent = 'Online';
    el.className = 'stat-value online';
    return true;
  } catch {
    el.textContent = 'Offline';
    el.className = 'stat-value offline';
    return false;
  }
}

function showApproval(action) {
  pendingAction = action;
  const tc = action.tool_calls?.[0];
  $('#approval-tool-name').textContent = tc?.name || 'pull_request_review_write';

  let argsPreview = '';
  try {
    const args =
      typeof tc?.arguments === 'string' ? JSON.parse(tc.arguments) : tc?.arguments;
    argsPreview = JSON.stringify(args, null, 2);
    if (args?.body) {
      $('#approval-why').textContent =
        'Draft review ready — ' + String(args.body).slice(0, 120) + '…';
    }
  } catch {
    argsPreview = String(tc?.arguments || '');
  }
  $('#approval-args').textContent = argsPreview;

  $('#intervention-idle').classList.add('hidden');
  $('#intervention-active').classList.remove('hidden');
  $('.intervention').classList.remove('idle');
  $('.intervention').classList.add('urgent');

  setStatus('Awaiting approval', 'waiting');
  setStage('gate');
  log('Approval gate — irreversible GitHub write blocked', 'warn');
  stopElapsed();
}

function hideApproval() {
  pendingAction = null;
  $('#intervention-active').classList.add('hidden');
  $('#intervention-idle').classList.remove('hidden');
  $('.intervention').classList.add('idle');
  $('.intervention').classList.remove('urgent');
}

async function pollTurn(sid, tid) {
  polling = true;
  let lastLen = 0;
  let lastStage = '';

  while (polling) {
    const resp = await api('GET', `/api/v1/sessions/${sid}/turns/${tid}`);
    const state = resp.data?.state || {};
    const status = state.status;
    const actions = state.required_actions || [];
    const out = state.output?.content || '';

    if (out.length > lastLen) {
      $('#output').textContent = out;
      renderFindings(out);
      lastLen = out.length;
    }

    if (actions.length > 0 && !pendingAction) {
      showApproval(actions[0]);
      polling = false;
      return state;
    }

    const stage = guessStage(out, false);
    if (stage !== lastStage) {
      const labels = {
        read: 'Reading PR diff via MCP',
        sandbox: 'Running tests in sandbox (subagent A)',
        security: 'Security skill scan (subagent B)',
        draft: 'Drafting review comment',
        done: 'Review complete',
      };
      if (labels[stage] && stage !== lastStage) {
        log(labels[stage], stage === 'done' ? 'success' : 'tool');
      }
      lastStage = stage;
    }
    setStage(stage);

    if (status === 'done') {
      setStatus('Complete', 'done');
      setStage('done');
      log('Review finished — check GitHub PR', 'success');
      polling = false;
      stopElapsed();
      $('#start-btn').disabled = false;
      return state;
    }
    if (status === 'failed' || status === 'error') {
      setStatus('Failed', 'error');
      log(`Agent error: ${status}`, 'warn');
      polling = false;
      stopElapsed();
      $('#start-btn').disabled = false;
      return state;
    }

    setStatus('Running', 'running');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function startReview() {
  const pr = validatePrUrl($('#pr-url').value);
  if (!pr) return alert('Enter a valid HTTPS GitHub pull request URL');

  if (!(await checkHarness())) {
    return alert('Start TrueForge first:\nnpx @truefoundry/trueforge@latest');
  }

  hideApproval();
  $('#activity-log').innerHTML = '';
  $('#output').textContent = '';
  renderFindings('');
  $('#start-btn').disabled = true;
  setStatus('Starting', 'running');
  steps.forEach((s) => s.classList.remove('active', 'done', 'gate-active'));
  setStage('read');
  startElapsed();

  log('Creating harness session…', 'tool');
  const sess = await api('POST', '/api/v1/sessions', { agent: { name: 'pr-guard' } });
  sessionId = sess.data.id;
  $('#session-id').textContent = sessionId.slice(0, 14) + '…';
  log(`Session ${sessionId.slice(0, 10)}…`, 'success');

  log(`Target: ${pr.replace('https://github.com/', '')}`, 'tool');
  const turn = await api('POST', `/api/v1/sessions/${sessionId}/turns`, {
    stream: false,
    input: [
      {
        type: 'user.message',
        content: `Review this pull request end to end: ${pr}`,
      },
    ],
  });
  turnId = turn.data.id;
  log('Parallel subagents: sandbox-test ∥ security-scan', 'sandbox');

  await pollTurn(sessionId, turnId);
}

async function submitApproval(allow) {
  const action = pendingAction;
  if (!action || !sessionId || !turnId) return;
  hideApproval();
  startElapsed();
  setStatus('Resuming', 'running');
  log(
    allow ? 'Approved — posting public review…' : 'Denied — irreversible action blocked',
    allow ? 'success' : 'warn',
  );

  const tc = action.tool_calls[0];
  const turn = await api('POST', `/api/v1/sessions/${sessionId}/turns`, {
    stream: false,
    previous_turn_id: turnId,
    input: [
      {
        type: 'user.tool_approval',
        thread_id: action.thread_id,
        tool_call_id: tc.id,
        approval: { status: allow ? 'allow' : 'deny' },
      },
    ],
  });
  turnId = turn.data.id;
  if (!allow) {
    setStatus('Denied', 'error');
    stopElapsed();
    $('#start-btn').disabled = false;
    return;
  }
  await pollTurn(sessionId, turnId);
}

$('#pr-url').value = DEFAULT_PR;
$('#start-btn').addEventListener('click', () =>
  startReview().catch((e) => {
    setStatus('Error', 'error');
    log(e.message, 'warn');
    $('#start-btn').disabled = false;
    stopElapsed();
  }),
);
$('#allow-btn').addEventListener('click', () =>
  submitApproval(true).catch((e) => log(e.message, 'warn')),
);
$('#deny-btn').addEventListener('click', () =>
  submitApproval(false).catch((e) => log(e.message, 'warn')),
);

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 'Enter' && !$('#start-btn').disabled) {
    e.preventDefault();
    $('#start-btn').click();
  }
  if (pendingAction && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      $('#allow-btn').click();
    }
    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      $('#deny-btn').click();
    }
  }
});

checkHarness();
setInterval(checkHarness, 15000);

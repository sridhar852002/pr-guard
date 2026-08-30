const DEFAULT_PR =
  'https://github.com/sridhar852002/vulnerable-api-fixture/pull/1';

const $ = (sel) => document.querySelector(sel);
const stages = [...document.querySelectorAll('.stage')];

let sessionId = null;
let turnId = null;
let polling = false;
let pendingAction = null;

function ts() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function log(msg, kind = '') {
  const li = document.createElement('li');
  if (kind) li.classList.add(kind);
  li.innerHTML = `<span class="time">${ts()}</span><span>${msg}</span>`;
  $('#activity-log').prepend(li);
}

function setStatus(text, cls) {
  const el = $('#run-status');
  el.textContent = text;
  el.className = `status-badge ${cls}`;
}

function setStage(name) {
  const order = ['read', 'sandbox', 'security', 'draft', 'gate', 'done'];
  const idx = order.indexOf(name);
  stages.forEach((s, i) => {
    s.classList.remove('active', 'done', 'gate-active');
    if (i < idx) s.classList.add('done');
    else if (i === idx) {
      s.classList.add(name === 'gate' ? 'gate-active' : 'active');
    }
  });
}

function guessStage(text, hasActions) {
  if (hasActions) return 'gate';
  const t = (text || '').toLowerCase();
  if (/posted|review comment|successfully/i.test(t)) return 'done';
  if (/draft|findings|\[high\]|\[medium\]/i.test(t)) return 'draft';
  if (/security|skill|gate|injection|secret/i.test(t)) return 'security';
  if (/sandbox|npm test|pytest|clone/i.test(t)) return 'sandbox';
  if (/pull_request_read|diff|reading/i.test(t)) return 'read';
  return 'read';
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || `${res.status} ${path}`);
  return json;
}

async function checkHarness() {
  const pill = $('#harness-status');
  try {
    await api('GET', '/api/v1/agents');
    pill.className = 'pill online';
    pill.innerHTML = '<span class="dot"></span><span>Harness online</span>';
    return true;
  } catch {
    pill.className = 'pill offline';
    pill.innerHTML = '<span class="dot"></span><span>Harness offline — start TrueForge</span>';
    return false;
  }
}

function showApproval(action) {
  pendingAction = action;
  const tc = action.tool_calls?.[0];
  $('#approval-tool-name').textContent = tc?.name || 'tool_call';
  try {
    const args = typeof tc?.arguments === 'string' ? JSON.parse(tc.arguments) : tc?.arguments;
    $('#approval-args').textContent = JSON.stringify(args, null, 2);
  } catch {
    $('#approval-args').textContent = String(tc?.arguments || '');
  }
  $('#approval-overlay').classList.remove('hidden');
  setStatus('Waiting for you', 'waiting');
  setStage('gate');
  log('Approval gate — post review requires Allow', 'warn');
}

function hideApproval() {
  pendingAction = null;
  $('#approval-overlay').classList.add('hidden');
}

async function pollTurn(sid, tid) {
  polling = true;
  let lastLen = 0;
  while (polling) {
    const resp = await api('GET', `/api/v1/sessions/${sid}/turns/${tid}`);
    const state = resp.data?.state || {};
    const status = state.status;
    const actions = state.required_actions || [];
    const out = state.output?.content || '';

    if (out.length > lastLen) {
      $('#output').textContent = out;
      lastLen = out.length;
    }

    if (actions.length > 0 && !pendingAction) {
      showApproval(actions[0]);
      polling = false;
      return state;
    }

    setStage(guessStage(out, false));

    if (status === 'done') {
      setStatus('Complete', 'done');
      setStage('done');
      log('Review finished');
      polling = false;
      $('#start-btn').disabled = false;
      return state;
    }
    if (status === 'failed' || status === 'error') {
      setStatus('Failed', 'error');
      log(`Agent error: ${status}`, 'warn');
      polling = false;
      $('#start-btn').disabled = false;
      return state;
    }

    setStatus('Running', 'running');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function startReview() {
  const pr = $('#pr-url').value.trim();
  if (!pr) return alert('Enter a pull request URL');

  if (!(await checkHarness())) {
    return alert('Start TrueForge first: npx @truefoundry/trueforge@latest');
  }

  hideApproval();
  $('#activity-log').innerHTML = '';
  $('#output').textContent = '';
  $('#start-btn').disabled = true;
  setStatus('Starting', 'running');
  stages.forEach((s) => s.classList.remove('active', 'done', 'gate-active'));
  setStage('read');

  log('Creating session…');
  const sess = await api('POST', '/api/v1/sessions', { agent: { name: 'pr-guard' } });
  sessionId = sess.data.id;
  $('#session-id').textContent = sessionId;
  log(`Session ${sessionId.slice(0, 12)}…`);

  log(`Reviewing ${pr}`);
  const turn = await api('POST', `/api/v1/sessions/${sessionId}/turns`, {
    stream: false,
    input: [{ type: 'user.message', content: `Review this pull request end to end: ${pr}` }],
  });
  turnId = turn.data.id;
  log('Agent running — MCP read, sandbox, security skill…');

  await pollTurn(sessionId, turnId);
}

async function submitApproval(allow) {
  if (!pendingAction || !sessionId || !turnId) return;
  hideApproval();
  setStatus('Resuming', 'running');
  log(allow ? 'You clicked Allow — posting review…' : 'You clicked Deny — stopped');

  const tc = pendingAction.tool_calls[0];
  const turn = await api('POST', `/api/v1/sessions/${sessionId}/turns`, {
    stream: false,
    previous_turn_id: turnId,
    input: [{
      type: 'user.tool_approval',
      thread_id: pendingAction.thread_id,
      tool_call_id: tc.id,
      approval: { status: allow ? 'allow' : 'deny' },
    }],
  });
  turnId = turn.data.id;
  if (!allow) {
    setStatus('Denied', 'error');
    $('#start-btn').disabled = false;
    return;
  }
  await pollTurn(sessionId, turnId);
}

$('#pr-url').value = DEFAULT_PR;
$('#start-btn').addEventListener('click', () => startReview().catch((e) => {
  setStatus('Error', 'error');
  log(e.message, 'warn');
  $('#start-btn').disabled = false;
}));
$('#allow-btn').addEventListener('click', () => submitApproval(true).catch((e) => log(e.message, 'warn')));
$('#deny-btn').addEventListener('click', () => submitApproval(false).catch((e) => log(e.message, 'warn')));

checkHarness();
setInterval(checkHarness, 15000);

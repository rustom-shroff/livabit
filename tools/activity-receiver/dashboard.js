let token = location.hash.slice(1); if (token) history.replaceState(null, '', location.pathname);
const element = id => document.getElementById(id);
let lastVersion = '';
let connections = [];
async function request(route, options = {}) {
  const response = await fetch(route, { ...options, headers: { Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json' } });
  if (!response.ok) throw Error('Receiver unavailable or connection key incorrect'); return response.json();
}
function text(tag, value, className) {
  const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node;
}
function show(records) {
  element('events').replaceChildren(); element('count').textContent = records.length.toString();
  if (!records.length) { element('events').append(text('p', 'Start sharing in the Android app to see activity here.', 'empty')); return; }
  for (const record of records) {
    const event = record.event, card = document.createElement('article');
    card.append(text('h3', new Date(event.window.start).toLocaleTimeString() + ' – ' + new Date(event.window.end).toLocaleTimeString()));
    card.append(text('p', 'Received ' + new Date(record.received_at).toLocaleString() + ' · Event ' + event.sequence
      + ' · ' + (record.wire_format ?? 'Legacy liveabit test event'), 'meta'));
    const list = document.createElement('div'); list.className = 'apps';
    for (const app of event.observation?.apps ?? event.apps) {
      const row = document.createElement('div'); row.className = 'app';
      const duration = app.foreground_duration_ms === null ? 'Unknown' : (app.foreground_duration_ms / 1000).toFixed(1) + ' sec estimated';
      row.append(text('span', app.application.id), text('strong', duration), text('small', app.transition_count + ' transitions')); list.append(row);
    }
    card.append(list, text('p', 'Coverage unknown · Unverified usage estimate', 'quality'));
    const details = document.createElement('details'); details.append(text('summary', 'View received event'), text('pre', JSON.stringify(event, null, 2)));
    card.append(details); element('events').append(card);
  }
}
async function refresh() {
  if (!token) return;
  try {
    const result = await request('/api/events'); element('connect').hidden = true;
    if (!connections.length) {
      const exported = await request('/api/setup'); connections = exported.connections;
      element('wifi-help').hidden = exported.wifi_available;
      element('wifi-help').textContent = exported.wifi_help;
      element('connection-type').replaceChildren(...connections.map((connection, index) => {
        const option = text('option', connection.name); option.value = index.toString(); return option;
      }));
      showSetup();
    }
    element('setup').hidden = false;
    element('mode').value = result.mode;
    element('status').textContent = result.mode === 'acknowledge' ? 'Ready · acknowledgements on' : 'Test mode · normal acknowledgements off';
    const version = result.events.map(event => event.event.event_id).join('|');
    if (version !== lastVersion || !result.events.length) { show(result.events); lastVersion = version; }
  } catch { element('status').textContent = 'Receiver unavailable or connection key incorrect'; element('connect').hidden = false; element('setup').hidden = true; connections = []; }
}
function currentSetup() { return connections[Number(element('connection-type').value)]; }
function showSetup() { element('setup-instructions').textContent = currentSetup()?.instructions ?? ''; }
element('connection-type').addEventListener('change', showSetup);
element('copy-setup').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(currentSetup().setup));
    element('setup-status').textContent = 'Setup copied. Tap Paste receiver setup in liveabit, then choose apps and Start sharing.';
  } catch { element('setup-status').textContent = 'Copy unavailable. Download the setup file and import it in liveabit.'; }
});
element('download-setup').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(currentSetup().setup, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'liveabit-receiver-setup.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  element('setup-status').textContent = 'Move this file to your phone and tap Import receiver setup file in liveabit. It contains your connection key.';
});
element('connect-button').addEventListener('click', () => { token = element('key').value.trim(); element('key').value = ''; refresh(); });
element('mode').addEventListener('change', async () => {
  try { await request('/api/mode', { method: 'POST', body: JSON.stringify({ mode: element('mode').value }) }); await refresh(); }
  catch { element('status').textContent = 'Could not change receiver mode'; }
});
refresh(); setInterval(refresh, 2000);

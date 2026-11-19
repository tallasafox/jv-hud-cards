/*!
 * JV HUD Cards — holographic heads-up-display cards for Home Assistant
 * MIT License
 */
const JV_VERSION = '__VERSION__';
const JV_REPO = '__REPO__';

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */
const JV_COLORS = {
  cyan: '0,229,255', blue: '64,156,255', amber: '255,176,32', orange: '255,122,26',
  red: '255,77,77', green: '125,255,178', violet: '178,102,255', purple: '178,102,255',
  magenta: '255,79,163', pink: '255,79,163', white: '228,238,244', slate: '70,110,128',
  grey: '90,110,125', gray: '90,110,125',
};
const JV_SEV_RGB = { ok: JV_COLORS.green, warn: JV_COLORS.amber, bad: JV_COLORS.red };
const JV_ACTIVE = new Set(['on', 'open', 'opening', 'playing', 'home', 'heat', 'cool', 'heat_cool', 'auto',
  'dry', 'fan_only', 'unlocked', 'active', 'cleaning', 'armed_home', 'armed_away', 'armed_night']);
const JV_DEAD = new Set(['unavailable', 'unknown']);
const JV_TOGGLE = new Set(['light', 'switch', 'fan', 'input_boolean', 'automation', 'cover', 'siren',
  'humidifier', 'script', 'scene', 'button', 'input_button', 'lock', 'valve', 'group']);
const JV_ARMED = new Set(['automation', 'input_boolean']);
const JV_ENTITY_RE = /^[a-z_]+\.[a-z0-9_]+$/;
const JV_ICONS = {
  light: 'mdi:lightbulb', switch: 'mdi:toggle-switch-variant', fan: 'mdi:fan', climate: 'mdi:thermostat',
  sensor: 'mdi:eye', binary_sensor: 'mdi:radiobox-marked', person: 'mdi:account', automation: 'mdi:robot',
  input_boolean: 'mdi:toggle-switch-outline', media_player: 'mdi:speaker', camera: 'mdi:cctv',
  cover: 'mdi:window-shutter', lock: 'mdi:lock', script: 'mdi:script-text', scene: 'mdi:palette',
  weather: 'mdi:weather-partly-cloudy', device_tracker: 'mdi:crosshairs-gps', input_button: 'mdi:gesture-tap-button',
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
const jvEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jvIsTpl = (s) => typeof s === 'string' && (s.includes('{{') || s.includes('{%'));
const jvNum = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : NaN; };
const jvFmt = (n, d = 1) => { if (!Number.isFinite(n)) return '—'; const f = 10 ** d; return String(Math.round(n * f) / f); };
const jvDur = (ms) => { const m = Math.round(Math.abs(ms) / 60000); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
const jvRel = (t) => { const ms = typeof t === 'number' ? t : Date.parse(t); if (!Number.isFinite(ms)) return '—'; const d = ms - Date.now(); return d > 30000 ? `in ${jvDur(d)}` : `${jvDur(d)} ago`; };
const jvDomain = (id) => String(id || '').split('.')[0];
const jvList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const jvClamp = (v, a, b) => Math.max(a, Math.min(b, v));

function jvRgb(c) {
  if (c == null || c === '') return null;
  c = String(c).trim().toLowerCase();
  if (JV_COLORS[c]) return JV_COLORS[c];
  if (JV_SEV_RGB[c]) return JV_SEV_RGB[c];
  if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(c)) return c.replace(/\s/g, '');
  let m = c.match(/^#([0-9a-f]{6})$/);
  if (m) { const n = parseInt(m[1], 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }
  m = c.match(/^#([0-9a-f]{3})$/);
  if (m) return m[1].split('').map((h) => parseInt(h + h, 16)).join(',');
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) return m[1].split(',').slice(0, 3).map((s) => s.trim()).join(',');
  return null;
}

function jvSevNorm(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['bad', 'error', 'critical', 'red'].includes(s)) return 'bad';
  if (['warn', 'warning', 'amber'].includes(s)) return 'warn';
  if (['ok', 'good', 'green'].includes(s)) return 'ok';
  if (s === 'info') return 'info';
  return '';
}

function jvTruthy(v) {
  return v === true || ['true', 'on', 'yes', '1'].includes(String(v).trim().toLowerCase());
}

/* ------------------------------------------------------------------ */
/* Zigbee mesh aggregation (ZHA or Zigbee2MQTT via the MQTT platform)  */
/* ------------------------------------------------------------------ */
const _jvZbCache = new WeakMap();
function jvZigbeeNodes(hass, opt = {}) {
  const o = {
    integration: 'zha', battery_low: 30, battery_critical: 15, lqi_weak: 80, quiet_hours: 48,
    exclude_areas: [], exclude_devices: [], ...opt,
  };
  const sig = JSON.stringify(o);
  let per = _jvZbCache.get(hass.states);
  if (per && per[sig]) return per[sig];
  const E = hass.entities || {}; const D = hass.devices || {}; const A = hass.areas || {}; const S = hass.states;
  const byDev = {};
  for (const id in E) {
    const r = E[id];
    if (r && r.platform === o.integration && r.device_id) (byDev[r.device_id] = byDev[r.device_id] || []).push(id);
  }
  const now = Date.now(); const out = [];
  for (const d in byDev) {
    const dv = D[d]; if (!dv) continue;
    let tot = 0; let av = 0; let last = 0; let lastAny = 0; let bat = null; let hasBat = false; let lqi = null; let rssi = null; let ctl = null;
    for (const e of byDev[d]) {
      const s = S[e]; if (!s) continue;
      tot++;
      const a = s.attributes || {};
      const lu = Date.parse(s.last_updated);
      if (lu > lastAny) lastAny = lu;
      const n = parseFloat(s.state);
      if (s.state !== 'unavailable') { av++; if (lu > last) last = lu; }
      if (e.startsWith('sensor.') && (a.device_class === 'battery' || /_battery(_[0-9]+)?$/.test(e))) { hasBat = true; if (!isNaN(n)) bat = n; }
      if (((e.startsWith('switch.') && (!ctl || ctl.startsWith('light.'))) || (e.startsWith('light.') && !ctl)) && E[e] && !E[e].entity_category) ctl = e;
      if (/_(lqi|linkquality)(_[0-9]+)?$/.test(e) && !isNaN(n)) lqi = n;
      if (/_rssi(_[0-9]+)?$/.test(e) && !isNaN(n)) rssi = n;
    }
    if (!tot) continue;
    const area = (A[dv.area_id] && A[dv.area_id].name) || 'Unassigned';
    let name = (dv.name_by_user || dv.name || 'Unknown').trim();
    if (o.exclude_areas.includes(area) || o.exclude_devices.includes(name) || o.exclude_devices.includes(d)) continue;
    const p = `${area.toLowerCase()} - `;
    if (name.toLowerCase().startsWith(p) && name.length > p.length) name = name.slice(p.length);
    const off = av === 0;
    const quiet = last ? (now - last) / 3600000 : null;
    let sev = 0; let st = 'OK';
    if (off) { sev = 3; st = 'Offline'; }
    else if (bat !== null && bat <= o.battery_critical) { sev = 3; st = `Batt ${Math.round(bat)}%`; }
    else if (bat !== null && bat <= o.battery_low) { sev = 2; st = `Batt ${Math.round(bat)}%`; }
    else if (lqi !== null && lqi < o.lqi_weak) { sev = 1; st = `Weak ${lqi}`; }
    else if (hasBat && quiet !== null && quiet > o.quiet_hours) { sev = 1; st = 'Quiet'; }
    out.push({ id: d, name, area, model: dv.model || '', batt: hasBat, bat, lqi, rssi, off, last, lastAny, quiet, sev, st, ctl });
  }
  out.sort((a, b) => b.sev - a.sev || a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
  if (!per) { per = {}; _jvZbCache.set(hass.states, per); }
  per[sig] = out;
  return out;
}

/* ------------------------------------------------------------------ */
/* Shared stylesheet                                                  */
/* ------------------------------------------------------------------ */
const JV_BASE_CSS = `
:host{display:block;height:100%;
  --jv-rgb:var(--jv-accent-rgb,0,229,255);
  --jv-glow:var(--jv-glow-strength,0);
  --jv-cut:var(--jv-corner,12px);
  --jv-bg:var(--jv-surface-rgb,2,9,16);
  --jv-text:var(--jv-text-color,#d6f9ff);
  --jv-bright:var(--jv-bright-color,#effdff);
  --jv-ok:125,255,178;--jv-warn:255,176,32;--jv-bad:255,77,77;
  font-family:var(--jv-font-family,'SF Mono',ui-monospace,Menlo,Consolas,monospace)}
ha-card.jv{display:block;position:relative;box-sizing:border-box;height:100%;padding:10px 12px;
  color:var(--jv-text);border-radius:0;box-shadow:none;overflow:hidden;
  background:linear-gradient(155deg,rgba(var(--jv-rgb),.09) 0%,rgba(var(--jv-bg),.9) 70%);
  border:1px solid rgba(var(--jv-rgb),.3);
  clip-path:polygon(0 0,calc(100% - var(--jv-cut)) 0,100% var(--jv-cut),100% 100%,var(--jv-cut) 100%,0 calc(100% - var(--jv-cut)));
  transition:background .3s,border-color .3s,opacity .3s;-webkit-tap-highlight-color:transparent}
ha-card.jv.on{background:linear-gradient(155deg,rgba(var(--jv-rgb),.32) 0%,rgba(var(--jv-rgb),.07) 55%,rgba(var(--jv-bg),.94) 100%);border-color:rgba(var(--jv-rgb),.95)}
ha-card.jv.dead{opacity:.5}
ha-card.jv.click{cursor:pointer;user-select:none}
ha-card.jv.click:active{filter:brightness(1.15)}
ha-card.jv:focus-visible{outline:1px solid rgb(var(--jv-rgb));outline-offset:-4px}
ha-card.jv.bare{background:none;border:none;clip-path:none;padding:10px 0 2px}
.body{position:relative;height:100%;min-width:0}
.nm{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgb(var(--jv-rgb));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.st{font-size:10px;letter-spacing:.16em;text-transform:uppercase;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb{font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ic{--mdc-icon-size:24px;display:inline-flex;color:rgba(var(--jv-rgb),.4);flex:none}
.ic.on{color:rgb(var(--jv-rgb));filter:drop-shadow(0 0 calc(var(--jv-glow) * 6px) rgba(var(--jv-rgb),var(--jv-glow)))}
.ic.dead{color:#ff5a5a}
.gt{text-shadow:0 0 calc(var(--jv-glow) * 12px) rgba(var(--jv-rgb),calc(var(--jv-glow) * .85))}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{--jc:var(--jv-rgb);display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;border:1px solid rgba(var(--jc),.45);background:rgba(var(--jc),.08);padding:4px 8px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#d8fbff;clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))}
.chip b{color:rgb(var(--jc))}
.chip ha-icon{--mdc-icon-size:14px;color:rgb(var(--jc))}
.chip.ok{--jc:var(--jv-ok)}
.chip.warn{--jc:var(--jv-warn);color:#ffe1a3}
.chip.bad{--jc:var(--jv-bad);color:#ffc2c2}
.chip[data-act]{cursor:pointer}
.hud{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:5px;width:100%}
.hud .chip{flex-direction:column;justify-content:center;gap:0;min-width:0;padding:4px 2px;font-size:9px;letter-spacing:.06em;line-height:1.3;text-align:center;white-space:nowrap;overflow:hidden}
.hud .chip b{max-width:100%;overflow:hidden;text-overflow:ellipsis}
.s-ok{color:rgb(var(--jv-ok))}.s-warn{color:rgb(var(--jv-warn))}.s-bad{color:rgb(var(--jv-bad))}
.err{font-size:10px;color:#ff8a8a;letter-spacing:.06em;white-space:normal}
@keyframes jvspin{to{transform:rotate(360deg)}}
@keyframes jvpulse{0%,100%{opacity:.75;transform:scale(.9)}50%{opacity:1;transform:scale(1.06)}}
@keyframes jvscan{0%{transform:translateY(-120%)}100%{transform:translateY(320%)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;

/* ------------------------------------------------------------------ */
/* Base card                                                          */
/* ------------------------------------------------------------------ */
class JvBase extends HTMLElement {
  static css = '';
  static defaults = {};

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._tpl = new Map();
    this._acts = {};
    this._html = null;
    this._built = false;
  }

  /* ---- lifecycle ---- */
  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    this.validate?.(config);
    this._config = { ...this.constructor.defaults, ...config };
    this._unsubAll();
    this._tplStrings = this._scan(this._config, (s) => jvIsTpl(s));
    this._watchIds = this._scan(this._config, (s) => JV_ENTITY_RE.test(s));
    this._watchAll = this.constructor.watchAll || this._hasKey(this._config, 'zigbee');
    this._html = null;
    this._syncTemplates();
    this._queue();
  }

  set hass(h) {
    const old = this._hass;
    this._hass = h;
    if (!this._config) return;
    if (!old) { this._syncTemplates(); this._queue(); return; }
    if (this._watchAll) { this._throttled(); return; }
    if (this._watchIds.some((id) => old.states[id] !== h.states[id]) || old.locale !== h.locale) this._queue();
  }

  get hass() { return this._hass; }

  connectedCallback() {
    this._connected = true;
    this._syncTemplates();
    this._queue();
    clearInterval(this._tick);
    this._tick = setInterval(() => this._queue(), 30000);
  }

  disconnectedCallback() {
    this._connected = false;
    clearInterval(this._tick);
    this._unsubAll();
  }

  getCardSize() { return 2; }

  /* ---- config scanning ---- */
  _scan(obj, pred, out = new Set(), key = '') {
    if (typeof obj === 'string') { if (pred(obj)) out.add(obj); }
    else if (Array.isArray(obj)) obj.forEach((v) => this._scan(v, pred, out, key));
    else if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        if (/_action$/.test(k)) continue; // templates are not allowed in actions
        this._scan(obj[k], pred, out, k);
      }
    }
    return [...out];
  }

  _hasKey(obj, key) {
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj)) return obj.some((v) => this._hasKey(v, key));
    return Object.keys(obj).some((k) => k === key || this._hasKey(obj[k], key));
  }

  /* ---- Jinja templates via the render_template subscription ---- */
  _syncTemplates() {
    if (!this._hass || !this._connected || !this._tplStrings) return;
    for (const t of this._tplStrings) if (!this._tpl.has(t)) this._subscribe(t);
  }

  _subscribe(tpl) {
    const entry = { value: undefined, error: null, unsub: null, dead: false };
    this._tpl.set(tpl, entry);
    const conn = this._hass.connection;
    if (!conn || !conn.subscribeMessage) { entry.value = ''; return; }
    conn.subscribeMessage((msg) => {
      if (msg.error) { entry.error = msg.error; if (entry.value === undefined) entry.value = ''; }
      else if ('result' in msg) { entry.value = msg.result; entry.error = null; }
      this._queue();
    }, {
      type: 'render_template', template: tpl, strict: false, report_errors: true,
      variables: { config: this._config, entity: this._config.entity, user: this._hass.user && this._hass.user.name },
    }).then((unsub) => {
      if (entry.dead) unsub(); else entry.unsub = unsub;
    }).catch((err) => { entry.error = String((err && err.message) || err); entry.value = ''; this._queue(); });
  }

  _unsubAll() {
    for (const e of this._tpl.values()) { e.dead = true; if (e.unsub) { try { e.unsub(); } catch (_) { /* noop */ } } }
    this._tpl.clear();
  }

  _t(str) {
    if (!jvIsTpl(str)) return str;
    const e = this._tpl.get(str);
    return e ? e.value : undefined;
  }

  /* ---- value specs ---- */
  _st(id) { return this._hass && this._hass.states[id]; }

  _val(spec, opts = {}) {
    if (spec == null) return undefined;
    if (typeof spec === 'number' || typeof spec === 'boolean') return spec;
    if (typeof spec === 'string') return jvIsTpl(spec) ? this._t(spec) : spec;
    if (Array.isArray(spec)) return spec.map((s) => this._val(s, opts));
    if (typeof spec !== 'object') return undefined;
    const wrap = (v) => {
      if (v === undefined || v === null || v === '') return v;
      if (spec.zero !== undefined && (v === 0 || v === '0')) return spec.zero;
      return `${spec.prefix ?? ''}${v}${spec.suffix ?? ''}`;
    };
    const S = this._hass.states;

    if (spec.template) return wrap(this._t(spec.template));

    if (spec.count) {
      const ids = jvList(spec.count);
      const want = spec.state != null ? jvList(spec.state).map(String) : null;
      const n = ids.filter((id) => {
        const s = S[id]; if (!s) return false;
        const raw = spec.attribute ? s.attributes[spec.attribute] : s.state;
        if (spec.below != null || spec.above != null) {
          const v = jvNum(raw); if (isNaN(v)) return false;
          if (spec.below != null && !(v < spec.below)) return false;
          if (spec.above != null && !(v > spec.above)) return false;
          return true;
        }
        return want ? want.includes(String(raw)) : JV_ACTIVE.has(String(raw));
      }).length;
      if (spec.total) return wrap(`${n}/${ids.length}`);
      return wrap(n);
    }

    for (const op of ['avg', 'min', 'max', 'sum']) {
      if (!spec[op]) continue;
      const nums = jvList(spec[op]).map((id) => { const s = S[id]; return s ? jvNum(spec.attribute ? s.attributes[spec.attribute] : s.state) : NaN; }).filter(Number.isFinite);
      if (!nums.length) return spec.fallback ?? '—';
      const r = op === 'avg' ? nums.reduce((a, b) => a + b, 0) / nums.length : op === 'sum' ? nums.reduce((a, b) => a + b, 0) : Math[op](...nums);
      return wrap(jvFmt(r, spec.decimals ?? 0));
    }

    if (spec.countdown) {
      const [mm, dd] = String(spec.countdown).split('-').map(Number);
      const n = new Date(); const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
      let t = new Date(n.getFullYear(), mm - 1, dd); if (t < today) t = new Date(n.getFullYear() + 1, mm - 1, dd);
      const d = Math.round((t - today) / 86400000);
      if (d === 0) return spec.live ?? 'LIVE';
      return `${spec.prefix ?? 'T-'}${d}${spec.suffix ?? ''}`;
    }

    if (spec.zigbee) {
      const Z = jvZigbeeNodes(this._hass, spec.options || {});
      const off = Z.filter((d) => d.off).length;
      const lb = Z.filter((d) => !d.off && d.bat !== null && d.bat <= (spec.options?.battery_low ?? 30)).length;
      const R = Z.filter((d) => !d.batt); const rOn = R.filter((d) => !d.off).length;
      const att = Z.filter((d) => d.sev >= 2).length;
      const map = {
        total: Z.length, online: Z.length - off, offline: off, low_battery: lb, attention: att,
        online_total: `${Z.length - off}/${Z.length}`, routers: `${rOn}/${R.length}`,
        availability: `${Z.length ? Math.round((100 * (Z.length - off)) / Z.length) : 0}%`,
        status: `${off} offline · ${lb} low batt`,
        headline: att ? `${att} node${att > 1 ? 's' : ''} need attention` : 'All nodes nominal',
      };
      return wrap(map[spec.zigbee] ?? '—');
    }

    if (spec.any || spec.all) {
      const conds = jvList(spec.any || spec.all);
      const hit = spec.any ? conds.some((c) => this._test(c)) : conds.every((c) => this._test(c));
      return this._val(hit ? spec.then : spec.else, opts);
    }

    if (spec.entity) {
      const s = S[spec.entity];
      if (!s) return spec.fallback ?? '—';
      const raw = spec.attribute ? s.attributes[spec.attribute] : s.state;
      if (spec.map && raw != null && Object.prototype.hasOwnProperty.call(spec.map, String(raw))) return spec.map[String(raw)];
      if (spec.map && spec.map._default != null) return spec.map._default;
      if (raw == null) return spec.fallback ?? '—';
      if (JV_DEAD.has(raw) && !spec.attribute) return spec.fallback ?? 'Offline';
      if (spec.relative) return wrap(jvRel(raw));
      if (spec.since) return wrap(jvDur(Date.now() - Date.parse(s.last_changed)));
      const n = jvNum(raw);
      if (Number.isFinite(n) && String(raw).trim() !== '' && !/[:\-T]/.test(String(raw).slice(1))) {
        const d = spec.decimals ?? opts.decimals ?? 1;
        let unit = spec.unit === false ? '' : (spec.unit ?? (spec.attribute ? '' : (s.attributes.unit_of_measurement || '')));
        if (opts.noUnit) unit = '';
        const sep = unit && !/^[°%]/.test(unit) ? ' ' : '';
        return wrap(`${jvFmt(n, d)}${sep}${unit}`);
      }
      if (spec.raw) return wrap(raw);
      if (!spec.attribute && this._hass.formatEntityState) return wrap(this._hass.formatEntityState(s));
      return wrap(String(raw).replace(/_/g, ' '));
    }
    return undefined;
  }

  /* condition: {entity, attribute?, state|state_not|above|below} or a template string */
  _test(c) {
    if (c == null) return false;
    if (typeof c === 'string') return jvTruthy(this._t(c));
    if (c.template) return jvTruthy(this._t(c.template));
    const s = this._st(c.entity); if (!s) return !!c.missing;
    const raw = c.attribute ? s.attributes[c.attribute] : s.state;
    if (c.state != null && !jvList(c.state).map(String).includes(String(raw))) return false;
    if (c.state_not != null && jvList(c.state_not).map(String).includes(String(raw))) return false;
    if (c.above != null || c.below != null) {
      const v = jvNum(raw); if (isNaN(v)) return false;
      if (c.above != null && !(v > c.above)) return false;
      if (c.below != null && !(v < c.below)) return false;
    }
    return true;
  }

  /* severity: 'ok|warn|bad|info', a template, or {bad_below,warn_below,warn_above,bad_above,bad_states,warn_states,ok_states,else} */
  _sev(rule, value) {
    if (rule == null || rule === '') return '';
    if (typeof rule === 'string') return jvSevNorm(jvIsTpl(rule) ? this._t(rule) : rule);
    if (typeof rule !== 'object') return '';
    const v = String(value ?? '');
    if (rule.bad_states && jvList(rule.bad_states).map(String).includes(v)) return 'bad';
    if (rule.warn_states && jvList(rule.warn_states).map(String).includes(v)) return 'warn';
    if (rule.ok_states && jvList(rule.ok_states).map(String).includes(v)) return 'ok';
    const n = jvNum(value);
    if (Number.isFinite(n)) {
      if (rule.bad_above != null && n > rule.bad_above) return 'bad';
      if (rule.bad_below != null && n < rule.bad_below) return 'bad';
      if (rule.warn_above != null && n > rule.warn_above) return 'warn';
      if (rule.warn_below != null && n < rule.warn_below) return 'warn';
    }
    return jvSevNorm(rule.else);
  }

  /* ---- rendering ---- */
  _queue() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(); });
  }

  _throttled() {
    const now = Date.now();
    const wait = 2000 - (now - (this._lastDraw || 0));
    if (wait <= 0) { this._queue(); return; }
    if (!this._thr) this._thr = setTimeout(() => { this._thr = null; this._queue(); }, wait);
  }

  _skeleton() { return '<ha-card class="jv" data-act="card"><div class="fx"></div><div class="body"></div></ha-card>'; }

  _draw() {
    if (!this._config || !this._hass) return;
    this._lastDraw = Date.now();
    if (!this._built) {
      this.shadowRoot.innerHTML = `<style>${JV_BASE_CSS}${this.constructor.css}</style>${this._skeleton()}`;
      this._card = this.shadowRoot.querySelector('ha-card');
      this._body = this.shadowRoot.querySelector(this.constructor.slot || '.body');
      this._bind();
      this._built = true;
    }
    let html;
    this._acts = {};
    this._flags = {};
    try { html = this._render(); } catch (err) {
      console.error(`[${this.constructor.tag}]`, err);
      html = `<div class="err">${jvEsc(this.constructor.cardName)}: ${jvEsc(err && err.message)}</div>`;
    }
    this._applyHost();
    if (html !== this._html) {
      this._body.innerHTML = html;
      this._html = html;
      this._hydrate();
    }
  }

  _applyHost() {
    const c = this._config;
    const card = this._card;
    let accent = this._flags.accent;
    if (accent === undefined) accent = this._val(c.accent);
    const rgb = jvRgb(accent);
    if (rgb) card.style.setProperty('--jv-rgb', rgb); else card.style.removeProperty('--jv-rgb');
    if (c.glow === true) this.style.setProperty('--jv-glow-strength', '1');
    else if (c.glow === false) this.style.setProperty('--jv-glow-strength', '0');
    else this.style.removeProperty('--jv-glow-strength');
    const cardAct = this._acts.card;
    const click = !!cardAct && ['tap_action', 'hold_action', 'double_tap_action'].some((k) => cardAct[k] && cardAct[k].action && cardAct[k].action !== 'none');
    const cls = ['jv', this.constructor.variant || '', this._flags.on ? 'on' : '', this._flags.dead ? 'dead' : '', this._flags.bare ? 'bare' : '', click ? 'click' : ''].filter(Boolean).join(' ');
    if (card.className !== cls) card.className = cls;
    if (click) { card.setAttribute('tabindex', '0'); card.setAttribute('role', 'button'); }
    else { card.removeAttribute('tabindex'); card.removeAttribute('role'); }
  }

  /* set .hass/.stateObj on ha-state-icon elements after innerHTML */
  _hydrate() {
    this._body.querySelectorAll('ha-state-icon[data-eid]').forEach((el) => {
      el.hass = this._hass;
      el.stateObj = this._hass.states[el.dataset.eid];
    });
  }

  _icon(icon, stateObj, cls = 'ic') {
    if (icon) return `<ha-icon class="${cls}" icon="${jvEsc(icon)}"></ha-icon>`;
    if (stateObj && stateObj.attributes.icon) return `<ha-icon class="${cls}" icon="${jvEsc(stateObj.attributes.icon)}"></ha-icon>`;
    if (stateObj && customElements.get('ha-state-icon')) return `<ha-state-icon class="${cls}" data-eid="${jvEsc(stateObj.entity_id)}"></ha-state-icon>`;
    return `<ha-icon class="${cls}" icon="${jvEsc(JV_ICONS[jvDomain(stateObj && stateObj.entity_id)] || 'mdi:hexagon-outline')}"></ha-icon>`;
  }

  _chip(label, value, sev = '', attrs = '', icon = '') {
    const v = value == null || value === '' ? '' : `<b>${jvEsc(value)}</b>`;
    return `<span class="chip ${sev}" ${attrs}>${icon ? `<ha-icon icon="${jvEsc(icon)}"></ha-icon>` : ''}${jvEsc(label ?? '')}${v}</span>`;
  }

  /* chip specs: [{label, value|entity, attribute, unit, decimals, icon, severity, hide_zero, visible, tap_action, ...}] */
  _chips(items, hud = false, keyPrefix = 'c') {
    const html = jvList(items).map((ch, i) => {
      if (!ch || typeof ch !== 'object') return '';
      if (ch.visible != null && !(typeof ch.visible === 'object' ? this._test(ch.visible) : jvTruthy(this._val(ch.visible)))) return '';
      let v;
      if (ch.value !== undefined) v = this._val(ch.value, { decimals: 0 });
      else if (ch.entity) v = this._val({ entity: ch.entity, attribute: ch.attribute, decimals: ch.decimals ?? 0, unit: ch.unit, map: ch.map }, { decimals: 0 });
      if (ch.hide_zero && (v === 0 || v === '0')) return '';
      const raw = ch.entity && this._st(ch.entity) ? (ch.attribute ? this._st(ch.entity).attributes[ch.attribute] : this._st(ch.entity).state) : v;
      const sev = this._sev(ch.severity, raw);
      let attrs = '';
      if (ch.tap_action || ch.hold_action) {
        const k = `${keyPrefix}${i}`;
        this._acts[k] = { entity: ch.entity, tap_action: ch.tap_action || { action: 'none' }, hold_action: ch.hold_action || { action: 'none' } };
        attrs = `data-act="${k}"`;
      }
      return this._chip(this._val(ch.label) ?? '', v, sev, attrs, this._val(ch.icon));
    }).join('');
    return html ? `<div class="${hud ? 'chips hud' : 'chips'}">${html}</div>` : '';
  }

  /* default action set for an entity card */
  _defaultActs(entity, tapDefault) {
    const c = this._config;
    const tap = tapDefault || (entity && JV_TOGGLE.has(jvDomain(entity)) ? 'toggle' : entity ? 'more-info' : 'none');
    return {
      entity,
      tap_action: c.tap_action || { action: tap },
      hold_action: c.hold_action || { action: entity ? 'more-info' : 'none' },
      double_tap_action: c.double_tap_action,
    };
  }

  /* ---- pointer / keyboard action handling ---- */
  _bind() {
    const root = this.shadowRoot;
    let timer = null; let held = false; let key = null; let sx = 0; let sy = 0; let tapTimer = null; let tapKey = null;
    const find = (ev) => {
      for (const el of ev.composedPath()) {
        if (el === this || el === root) break;
        if (el.dataset && el.dataset.act != null) return el.dataset.act;
      }
      return null;
    };
    const has = (cfg, kind) => cfg && cfg[`${kind}_action`] && cfg[`${kind}_action`].action && cfg[`${kind}_action`].action !== 'none';
    root.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      const k = find(ev); const cfg = k != null && this._acts[k];
      if (!cfg) return;
      key = k; held = false; sx = ev.clientX; sy = ev.clientY;
      clearTimeout(timer);
      if (has(cfg, 'hold')) timer = setTimeout(() => { held = true; timer = null; this._run(k, 'hold'); }, 500);
    });
    root.addEventListener('pointermove', (ev) => {
      if (key != null && (Math.abs(ev.clientX - sx) > 12 || Math.abs(ev.clientY - sy) > 12)) { clearTimeout(timer); timer = null; key = null; }
    });
    const cancel = () => { clearTimeout(timer); timer = null; key = null; };
    root.addEventListener('pointercancel', cancel);
    root.addEventListener('pointerleave', (ev) => { if (ev.target === this._card) cancel(); }, true);
    root.addEventListener('pointerup', () => {
      clearTimeout(timer); timer = null;
      const k = key; key = null;
      if (k == null || held) return;
      const cfg = this._acts[k];
      if (has(cfg, 'double_tap')) {
        if (tapTimer && tapKey === k) { clearTimeout(tapTimer); tapTimer = null; this._run(k, 'double_tap'); return; }
        tapKey = k;
        tapTimer = setTimeout(() => { tapTimer = null; this._run(k, 'tap'); }, 250);
      } else this._run(k, 'tap');
    });
    root.addEventListener('contextmenu', (ev) => { const k = find(ev); if (k != null && has(this._acts[k], 'hold')) ev.preventDefault(); });
    root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const k = find(ev); if (k == null) return;
      ev.preventDefault(); this._run(k, 'tap');
    });
  }

  _run(k, kind) {
    const cfg = this._acts[k]; if (!cfg) return;
    if (typeof cfg.handler === 'function') { cfg.handler(kind); return; }
    const a = cfg[`${kind}_action`];
    if (!a || !a.action || a.action === 'none') return;
    if (a.haptic) this.dispatchEvent(new CustomEvent('haptic', { bubbles: true, composed: true, detail: a.haptic === true ? 'light' : a.haptic }));
    this.dispatchEvent(new CustomEvent('hass-action', { bubbles: true, composed: true, detail: { config: cfg, action: kind } }));
  }
}

/* ------------------------------------------------------------------ */
/* Visual-editor helpers                                              */
/* ------------------------------------------------------------------ */
const JV_ACCENT_SEL = { select: { mode: 'dropdown', custom_value: true, options: Object.keys(JV_COLORS).filter((k) => !['purple', 'pink', 'gray'].includes(k)).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })) } };
const JV_LABELS = {
  entity: 'Entity', name: 'Name', icon: 'Icon', accent: 'Accent colour', label: 'Label', show_state: 'Show state',
  tap_action: 'Tap action', hold_action: 'Hold action', double_tap_action: 'Double-tap action',
  navigation_path: 'Navigate to', stat: 'Stat (text or template)', sub: 'Subtitle (text or template)',
  unit: 'Unit override', decimals: 'Decimals', size: 'Reactor size (px)', greeting: 'Greeting line', clock: 'Date/time line',
  glow: 'Glow effects', battery: 'Battery sensor', charging: 'Charging sensor', location: 'Location sensor',
  address: 'Geocoded address sensor', tracker: 'Device tracker', speed: 'Speed sensor', driving: 'Driving sensor',
  min: 'Gauge minimum', max: 'Gauge maximum', controls: 'Show +/- controls', temperature: 'Temperature sensor',
  preset: 'Preset', mode: 'Mode', integration: 'Integration', battery_low: 'Low-battery %', battery_critical: 'Critical-battery %',
  lqi_weak: 'Weak-link LQI', quiet_hours: 'Quiet after (hours)', title: 'Title', hours: 'Hours shown', layout: 'Layout',
  background: 'Card background', direction: 'Bad when', ok_text: 'All-clear text',
};
const jvForm = (schema) => ({ schema, computeLabel: (s) => JV_LABELS[s.name] || s.name });

/* registration ----------------------------------------------------- */
window.customCards = window.customCards || [];
function jvDefine(cls) {
  if (!customElements.get(cls.tag)) customElements.define(cls.tag, cls);
  if (!window.customCards.some((c) => c.type === cls.tag)) {
    window.customCards.push({ type: cls.tag, name: cls.cardName, description: cls.desc, preview: true, documentationURL: `${JV_REPO}#${cls.tag}` });
  }
}

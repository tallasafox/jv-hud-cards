/*!
 * JV HUD Cards — holographic heads-up-display cards for Home Assistant
 * MIT License
 */
const JV_VERSION = "1.1.0";
const JV_REPO = "https://github.com/tallasafox/jv-hud-cards";

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

/* ================================================================== */
/* jv-section-card                                                    */
/* ================================================================== */
class JvSectionCard extends JvBase {
  static tag = 'jv-section-card';
  static cardName = 'JV Section';
  static desc = 'Section heading with an accent scan line.';
  static css = `
.sec{display:flex;align-items:center;gap:8px;min-height:22px}
.sec .ic{--mdc-icon-size:18px;color:rgb(var(--jv-rgb))}
.sec .nm{font-size:12px;letter-spacing:.3em}
.sec .ln{flex:1;height:1px;background:linear-gradient(90deg,rgba(var(--jv-rgb),.9),rgba(var(--jv-rgb),0))}`;

  static getStubConfig() { return { type: 'custom:jv-section-card', name: 'Subsystems', icon: 'mdi:hexagon-outline' }; }
  static getConfigForm() {
    return jvForm([{ name: 'name', required: true, selector: { text: {} } }, { name: 'icon', selector: { icon: {} } },
      { name: 'accent', selector: JV_ACCENT_SEL }, { name: 'tap_action', selector: { ui_action: {} } }]);
  }

  _render() {
    const c = this._config;
    this._flags.bare = true;
    this._acts.card = { tap_action: c.tap_action || { action: 'none' }, hold_action: { action: 'none' } };
    const icon = this._val(c.icon);
    return `<div class="sec">${icon ? this._icon(icon, null, 'ic on') : ''}<span class="nm">${jvEsc(this._val(c.name) ?? '')}</span><i class="ln"></i></div>`;
  }

  getCardSize() { return 1; }
  getGridOptions() { return { columns: 'full', rows: 'auto' }; }
}

/* ================================================================== */
/* jv-tile-card — toggle / action / status tile                       */
/* ================================================================== */
class JvTileCard extends JvBase {
  static tag = 'jv-tile-card';
  static cardName = 'JV Tile';
  static desc = 'Compact HUD tile: toggles entities, runs actions, shows state.';
  static variant = 'tile';
  static defaults = { show_state: true };
  static css = `
ha-card.tile{min-height:62px;display:flex;align-items:center}
.tile{display:grid;grid-template-columns:30px minmax(0,1fr);column-gap:10px;align-items:center;width:100%}
.tile .ic{justify-self:center}
.tile .txt{display:grid;row-gap:3px;min-width:0}`;

  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((id) => ['light', 'switch'].includes(jvDomain(id)));
    return { type: 'custom:jv-tile-card', entity: e || 'light.example' };
  }
  static getConfigForm() {
    return jvForm([
      { name: 'entity', selector: { entity: {} } },
      { type: 'grid', name: '', schema: [{ name: 'name', selector: { text: {} } }, { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } }] },
      { type: 'grid', name: '', schema: [{ name: 'label', selector: { text: {} } }, { name: 'accent', selector: JV_ACCENT_SEL }] },
      { name: 'show_state', selector: { boolean: {} } },
      { name: 'tap_action', selector: { ui_action: {} } }, { name: 'hold_action', selector: { ui_action: {} } },
    ]);
  }

  _stateText(s) {
    const c = this._config;
    if (c.state != null) return this._val(c.state);
    if (!s) return c.entity ? 'No signal' : '';
    if (c.state_map && s.state in c.state_map) return c.state_map[s.state];
    if (JV_DEAD.has(s.state)) return 'Offline';
    const arm = JV_ARMED.has(jvDomain(s.entity_id));
    if (s.state === 'on') {
      if (arm) return 'Armed';
      const b = s.attributes.brightness;
      return b ? `Active · ${Math.round(b / 2.55)}%` : 'Active';
    }
    if (s.state === 'off') return arm ? 'Disarmed' : 'Standby';
    return this._hass.formatEntityState ? this._hass.formatEntityState(s) : s.state.replace(/_/g, ' ');
  }

  _render() {
    const c = this._config;
    const s = c.entity ? this._st(c.entity) : null;
    const dead = !!c.entity && (!s || JV_DEAD.has(s.state));
    const active = s ? (c.active_states ? jvList(c.active_states).includes(s.state) : JV_ACTIVE.has(s.state)) : false;
    this._flags.on = active;
    this._flags.dead = dead;
    this._acts.card = this._defaultActs(c.entity);
    const name = this._val(c.name) ?? (s && s.attributes.friendly_name) ?? c.entity ?? '';
    const st = c.show_state === false ? '' : this._stateText(s);
    const label = this._val(c.label);
    const icls = dead ? 'ic dead' : (active || !c.entity) ? 'ic on' : 'ic';
    return `<div class="tile">${this._icon(this._val(c.icon), s, icls)}<div class="txt"><div class="nm">${jvEsc(name)}</div>${st ? `<div class="st">${jvEsc(st)}</div>` : ''}${label ? `<div class="lb">${jvEsc(label)}</div>` : ''}</div></div>`;
  }

  getCardSize() { return 1; }
  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 3 }; }
}

/* ================================================================== */
/* jv-readout-card — big numeric/status readout                       */
/* ================================================================== */
class JvReadoutCard extends JvBase {
  static tag = 'jv-readout-card';
  static cardName = 'JV Readout';
  static desc = 'Large telemetry readout for a sensor or status.';
  static variant = 'ro';
  static css = `
ha-card.ro{min-height:84px}
.ro{display:grid;grid-template-columns:minmax(0,1fr) 26px;grid-template-rows:min-content 1fr min-content;row-gap:4px;height:100%;min-height:62px}
.ro .ic{--mdc-icon-size:20px;justify-self:end;color:rgb(var(--jv-rgb))}
.ro .v{grid-column:1/-1;align-self:end;font-size:var(--jv-readout-size,22px);letter-spacing:.02em;color:var(--jv-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.15}
.ro .v.wrap{white-space:normal}
.ro .lb{grid-column:1/-1}`;

  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((id) => jvDomain(id) === 'sensor' && hass.states[id].attributes.unit_of_measurement);
    return { type: 'custom:jv-readout-card', entity: e || 'sensor.example' };
  }
  static getConfigForm() {
    return jvForm([
      { name: 'entity', required: true, selector: { entity: {} } },
      { type: 'grid', name: '', schema: [{ name: 'name', selector: { text: {} } }, { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } }] },
      { type: 'grid', name: '', schema: [{ name: 'unit', selector: { text: {} } }, { name: 'decimals', selector: { number: { min: 0, max: 4, mode: 'box' } } }] },
      { type: 'grid', name: '', schema: [{ name: 'label', selector: { text: {} } }, { name: 'accent', selector: JV_ACCENT_SEL }] },
      { name: 'tap_action', selector: { ui_action: {} } },
    ]);
  }

  _render() {
    const c = this._config;
    const s = this._st(c.entity);
    this._flags.dead = !s || JV_DEAD.has(s.state);
    this._acts.card = this._defaultActs(c.entity, 'more-info');
    let v;
    if (c.value != null) v = this._val(c.value);
    else if (!s) v = '—';
    else if (c.state_map && s.state in c.state_map) v = c.state_map[s.state];
    else if (JV_DEAD.has(s.state)) v = 'OFFLINE';
    else v = this._val({ entity: c.entity, attribute: c.attribute, decimals: c.decimals ?? 1, unit: c.unit, relative: c.relative });
    if (typeof v === 'string' && c.uppercase !== false && !/\d/.test(v.slice(0, 1))) v = v.toUpperCase();
    if (c.severity) {
      const sev = this._sev(c.severity, s && (c.attribute ? s.attributes[c.attribute] : s.state));
      if (sev && sev !== 'info') this._flags.accent = sev;
    }
    const name = this._val(c.name) ?? (s && s.attributes.friendly_name) ?? c.entity;
    const label = this._val(c.label);
    const style = c.font_size ? ` style="font-size:${jvEsc(c.font_size)}"` : '';
    return `<div class="ro"><div class="nm">${jvEsc(name)}</div>${this._icon(this._val(c.icon), s, 'ic on')}<div class="v gt${c.wrap ? ' wrap' : ''}"${style}>${jvEsc(v)}</div>${label ? `<div class="lb">${jvEsc(label)}</div>` : ''}</div>`;
  }

  getCardSize() { return 2; }
  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 3 }; }
}

/* ================================================================== */
/* jv-chips-card — HUD chip strip                                     */
/* ================================================================== */
class JvChipsCard extends JvBase {
  static tag = 'jv-chips-card';
  static cardName = 'JV Chips';
  static desc = 'Row of HUD status chips (entities, counts, templates).';
  static defaults = { layout: 'wrap', background: false };

  static getStubConfig() { return { type: 'custom:jv-chips-card', chips: [{ label: 'Lights', value: 0 }] }; }
  static getConfigForm() {
    return jvForm([{ name: 'layout', selector: { select: { options: ['wrap', 'hud'] } } }, { name: 'background', selector: { boolean: {} } }, { name: 'accent', selector: JV_ACCENT_SEL }]);
  }
  validate(c) { if (!Array.isArray(c.chips)) throw new Error('chips: list required'); }

  _render() {
    const c = this._config;
    this._flags.bare = !c.background;
    return this._chips(c.chips, c.layout === 'hud');
  }

  getCardSize() { return 1; }
  getGridOptions() { return { columns: 'full', rows: 'auto' }; }
}

/* ================================================================== */
/* jv-reactor-card — hero panel with animated reactor                 */
/* ================================================================== */
class JvReactorCard extends JvBase {
  static tag = 'jv-reactor-card';
  static cardName = 'JV Reactor';
  static desc = 'Hero panel: animated reactor core, status lines, alert roll-up and HUD chips.';
  static variant = 'rc';
  static defaults = { size: 84 };
  static slot = '.dyn';
  static css = `
ha-card.rc{padding:16px 14px;background:radial-gradient(circle at 15% 40%,rgba(var(--jv-rgb),.25) 0%,rgba(var(--jv-rgb),.05) 40%,rgba(var(--jv-bg),.92) 78%);border-color:rgba(var(--jv-rgb),.6)}
.fx .scan{position:absolute;left:0;right:0;top:0;height:35%;pointer-events:none;background:linear-gradient(180deg,rgba(var(--jv-rgb),0) 0%,rgba(var(--jv-rgb),.09) 50%,rgba(var(--jv-rgb),0) 100%);animation:jvscan 6s linear infinite}
.wrap{display:grid;grid-template-columns:calc(var(--rs) + 12px) minmax(0,1fr);grid-template-areas:"rx nm" "rx sub" "st st";grid-template-rows:1fr auto auto;column-gap:6px}
.rx{grid-area:rx;align-self:center;position:relative;width:var(--rs);height:var(--rs)}
.rx i{position:absolute;display:block;box-sizing:border-box;border-radius:50%}
.rx .ring{inset:0;border:2px solid rgba(var(--jv-rgb),.18)}
.rx .r1{border-top-color:rgb(var(--jv-rgb));border-right-color:rgba(var(--jv-rgb),.6);animation:jvspin 8s linear infinite}
.rx .r2{inset:14%;border:2px dashed rgba(var(--jv-rgb),.55);animation:jvspin 14s linear infinite reverse}
.rx .r3{inset:28%;border-width:3px;border-left-color:rgb(var(--jv-rgb));border-bottom-color:rgb(var(--jv-rgb));animation:jvspin 3.5s linear infinite}
.rx .core{inset:38%;background:radial-gradient(circle,#fff 0%,rgb(var(--jv-rgb)) 45%,rgba(var(--jv-rgb),0) 78%);box-shadow:0 0 calc(var(--jv-glow) * 16px) rgba(var(--jv-rgb),var(--jv-glow));animation:jvpulse 2.6s ease-in-out infinite}
.title{grid-area:nm;align-self:end;font-size:19px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:rgb(var(--jv-rgb));line-height:1.2}
.sub{grid-area:sub;align-self:start;margin-top:4px;font-size:10.5px;line-height:1.55;letter-spacing:.12em;text-transform:uppercase;color:#a9eefb}
.stats{grid-area:st;margin-top:14px}
.stats:empty{display:none}`;

  static getStubConfig(hass) {
    return { type: 'custom:jv-reactor-card', name: hass.config && hass.config.location_name ? hass.config.location_name : 'Home', greeting: true, clock: true };
  }
  static getConfigForm() {
    return jvForm([
      { name: 'name', selector: { text: {} } },
      { type: 'grid', name: '', schema: [{ name: 'greeting', selector: { boolean: {} } }, { name: 'clock', selector: { boolean: {} } }] },
      { type: 'grid', name: '', schema: [{ name: 'size', selector: { number: { min: 40, max: 160, mode: 'box', unit_of_measurement: 'px' } } }, { name: 'accent', selector: JV_ACCENT_SEL }] },
      { name: 'ok_text', selector: { text: {} } },
    ]);
  }

  _skeleton() {
    return `<ha-card class="jv" data-act="card"><div class="fx"><i class="scan"></i></div><div class="body wrap"><div class="rx"><i class="ring r1"></i><i class="ring r2"></i><i class="ring r3"></i><i class="core"></i></div><div class="dyn" style="display:contents"></div></div></ha-card>`;
  }

  _render() {
    const c = this._config;
    this._card.style.setProperty('--rs', `${jvNum(this._val(c.size)) || 84}px`);
    if (c.tap_action || c.hold_action) this._acts.card = { tap_action: c.tap_action || { action: 'none' }, hold_action: c.hold_action || { action: 'none' } };
    const lines = [];
    const loc = this._hass.locale && this._hass.locale.language;
    if (c.greeting) {
      const h = new Date().getHours();
      const g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
      const who = c.greeting_name ?? ((this._hass.user && this._hass.user.name) || '').split(' ')[0];
      lines.push(jvEsc(`${g}${who ? `, ${who}` : ''}.`));
    }
    if (c.clock) {
      const d = new Date();
      lines.push(jvEsc(`${d.toLocaleDateString(loc, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' })}`));
    }
    for (const ln of jvList(c.lines)) {
      if (ln && typeof ln === 'object' && 'text' in ln) {
        if (ln.visible != null && !this._test(ln.visible)) continue;
        const sev = this._sev(ln.severity, this._val(ln.text));
        const v = this._val(ln.text);
        if (v != null && v !== '') lines.push(`<span class="${sev ? `s-${sev}` : ''}">${jvEsc(v)}</span>`);
      } else {
        const v = this._val(ln);
        if (v != null && v !== '') lines.push(jvEsc(v));
      }
    }
    if (c.alerts) {
      const hits = jvList(c.alerts).filter((a) => this._test(a));
      if (!hits.length) lines.push(`<span class="s-ok">${jvEsc(c.ok_text ?? 'All systems nominal')}</span>`);
      else {
        const sev = hits.some((a) => jvSevNorm(a.severity) === 'bad') ? 'bad' : 'warn';
        const msgs = [...new Set(hits.map((a) => a.message || a.entity))];
        const max = c.max_alerts ?? 2;
        const msg = msgs.slice(0, max).join(' · ');
        const more = msgs.length > max ? ` +${msgs.length - max}` : '';
        lines.push(`<span class="s-${sev}">${jvEsc(msg + more)}</span>`);
        if (c.alert_accent !== false) this._flags.accent = c.alert_accent || sev;
      }
    }
    const title = this._val(c.name) ?? '';
    return `<div class="title gt">${jvEsc(title)}</div><div class="sub">${lines.join('<br>')}</div><div class="stats">${this._chips(c.chips, c.chips_layout !== 'wrap')}</div>`;
  }

  getCardSize() { return 3; }
  getGridOptions() { return { columns: 'full', rows: 'auto' }; }
}

/* ================================================================== */
/* jv-nav-card — subsystem navigation tile with a headline stat        */
/* ================================================================== */
class JvNavCard extends JvBase {
  static tag = 'jv-nav-card';
  static cardName = 'JV Nav';
  static desc = 'Subsystem tile with icon, headline stat and subtitle; navigates on tap.';
  static variant = 'nv';
  static css = `
ha-card.nv{height:118px;padding:12px;background:radial-gradient(circle at 0% 0%,rgba(var(--jv-rgb),.3) 0%,rgba(var(--jv-rgb),.06) 45%,rgba(var(--jv-bg),.92) 100%);border-color:rgba(var(--jv-rgb),.55)}
.nv{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:1fr min-content min-content;grid-template-areas:"i stat" "n n" "sub sub";row-gap:2px;height:100%}
.nv .ic{grid-area:i;--mdc-icon-size:28px;align-self:start}
.nv .stat{grid-area:stat;justify-self:end;align-self:start;font-size:22px;font-weight:700;color:rgb(var(--jv-rgb));white-space:nowrap}
.nv .nm{grid-area:n;font-size:13px;letter-spacing:.22em;color:#ecfdff}
.nv .lb{grid-area:sub;opacity:.75;letter-spacing:.1em}`;

  static getStubConfig() { return { type: 'custom:jv-nav-card', name: 'Lighting', icon: 'mdi:lightbulb-group', stat: '0', sub: 'Circuits active', navigation_path: '#' }; }
  static getConfigForm() {
    return jvForm([
      { type: 'grid', name: '', schema: [{ name: 'name', required: true, selector: { text: {} } }, { name: 'icon', selector: { icon: {} } }] },
      { name: 'navigation_path', selector: { navigation: {} } },
      { type: 'grid', name: '', schema: [{ name: 'stat', selector: { text: {} } }, { name: 'sub', selector: { text: {} } }] },
      { name: 'accent', selector: JV_ACCENT_SEL },
      { name: 'tap_action', selector: { ui_action: {} } },
    ]);
  }

  _render() {
    const c = this._config;
    const tap = c.tap_action || (c.navigation_path ? { action: 'navigate', navigation_path: c.navigation_path, haptic: 'light' } : { action: 'none' });
    this._acts.card = { entity: c.entity, tap_action: tap, hold_action: c.hold_action || { action: 'none' } };
    const stat = this._val(c.stat, { decimals: 0 });
    const sub = this._val(c.sub);
    return `<div class="nv">${this._icon(this._val(c.icon), null, 'ic on')}<div class="stat gt">${jvEsc(stat ?? '')}</div><div class="nm">${jvEsc(this._val(c.name) ?? '')}</div><div class="lb">${jvEsc(sub ?? '')}</div></div>`;
  }

  getCardSize() { return 2; }
  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 3 }; }
}

/* ================================================================== */
/* jv-person-card                                                     */
/* ================================================================== */
class JvPersonCard extends JvBase {
  static tag = 'jv-person-card';
  static cardName = 'JV Person';
  static desc = 'Personnel tile: photo, presence, location, battery, motion and time-in-state.';
  static variant = 'pn';
  static css = `
ha-card.pn{padding:14px}
.pn{display:grid;grid-template-columns:70px minmax(0,1fr) auto;grid-template-areas:"i n bat" "i s s" "i loc loc" "i meta meta";column-gap:12px;row-gap:3px;align-items:center}
.pic{grid-area:i;width:58px;height:58px;border-radius:50%;object-fit:cover;border:2px solid rgb(var(--jv-rgb));box-shadow:0 0 calc(var(--jv-glow) * 14px) rgba(var(--jv-rgb),calc(var(--jv-glow) * .75));display:flex;align-items:center;justify-content:center;box-sizing:border-box;background:rgba(var(--jv-rgb),.08)}
.pic ha-icon{--mdc-icon-size:30px;color:rgb(var(--jv-rgb))}
.pn .nm{grid-area:n;font-size:14px;letter-spacing:.2em;color:#e9fdff}
.pn .st{grid-area:s;font-size:11px;font-weight:700;opacity:1;color:rgb(var(--jv-rgb))}
.bat{grid-area:bat;align-self:start;font-size:12px;display:inline-flex;align-items:center;gap:3px}
.bat ha-icon{--mdc-icon-size:16px}
.loc{grid-area:loc;font-size:11px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.loc span{opacity:.55}
.meta{grid-area:meta;margin-top:6px}`;

  static getStubConfig(hass) { return { type: 'custom:jv-person-card', entity: Object.keys(hass.states).find((id) => jvDomain(id) === 'person') || 'person.example' }; }
  static getConfigForm() {
    const ent = (n, d) => ({ name: n, selector: { entity: d ? { domain: d } : {} } });
    return jvForm([
      { name: 'entity', required: true, selector: { entity: { domain: 'person' } } },
      { name: 'name', selector: { text: {} } },
      { type: 'expandable', title: 'Telemetry sources', flatten: true, schema: [ent('battery', 'sensor'), ent('charging'), ent('location', 'sensor'), ent('address', 'sensor'), ent('tracker', 'device_tracker'), ent('speed', 'sensor'), ent('driving', 'binary_sensor')] },
      { name: 'accent', selector: JV_ACCENT_SEL },
    ]);
  }

  _render() {
    const c = this._config;
    const s = this._st(c.entity);
    if (!s) return `<div class="err">Entity not found: ${jvEsc(c.entity)}</div>`;
    const home = s.state === 'home'; const away = s.state === 'not_home';
    if (c.accent === undefined) this._flags.accent = home ? 'cyan' : away ? 'amber' : JV_DEAD.has(s.state) ? 'grey' : 'violet';
    this._acts.card = { entity: c.entity, tap_action: c.tap_action || { action: 'more-info' }, hold_action: c.hold_action || { action: 'none' } };
    const name = this._val(c.name) ?? s.attributes.friendly_name;
    const st = c.state_map && s.state in c.state_map ? c.state_map[s.state]
      : home ? (c.home_text ?? 'On premises') : away ? (c.away_text ?? 'Away · in the field')
        : (this._hass.formatEntityState ? this._hass.formatEntityState(s) : s.state);
    const pic = s.attributes.entity_picture
      ? `<img class="pic" src="${jvEsc(s.attributes.entity_picture)}" alt="">`
      : `<div class="pic"><ha-icon icon="mdi:account"></ha-icon></div>`;
    // battery
    let bat = '';
    const B = c.battery && this._st(c.battery);
    if (B) {
      const n = parseInt(B.state, 10);
      const chS = c.charging && this._st(c.charging);
      const ch = chS && ['on', 'charging', 'full'].includes(String(chS.state).toLowerCase());
      const ic = ch ? 'mdi:battery-charging' : n > 80 ? 'mdi:battery' : n > 50 ? 'mdi:battery-70' : n > 20 ? 'mdi:battery-40' : 'mdi:battery-alert';
      bat = `<span class="bat ${n <= 20 ? 's-bad' : ''}"><ha-icon icon="${ic}"></ha-icon>${isNaN(n) ? '—' : `${n}%`}</span>`;
    }
    // location
    let loc = '';
    const L = c.location && this._st(c.location);
    if (L && !JV_DEAD.has(L.state)) loc = L.state;
    else if (c.address && this._st(c.address)) {
      const A = this._st(c.address); const at = A.attributes;
      loc = at.Name || at.Locality ? `${at.Name || ''}${at.Locality ? `${at.Name ? ', ' : ''}${at.Locality}` : ''}` : A.state;
    } else if (c.tracker && this._st(c.tracker)) loc = this._st(c.tracker).attributes.address || '';
    if (!loc && !home && !away) loc = st;
    // meta chips
    const chips = [];
    const dr = c.driving && this._st(c.driving) && this._st(c.driving).state === 'on';
    const SP = c.speed && this._st(c.speed);
    if (SP) {
      const sp = Math.round(parseFloat(SP.state) || 0);
      const u = c.speed_unit ?? SP.attributes.unit_of_measurement ?? 'mph';
      chips.push(dr ? this._chip('Vector', `${sp} ${u}`, 'warn') : this._chip('Motion', 'Static'));
    } else if (c.driving) chips.push(dr ? this._chip('Vector', 'Driving', 'warn') : this._chip('Motion', 'Static'));
    chips.push(this._chip('Since', jvDur(Date.now() - Date.parse(s.last_changed))));
    chips.push(this._chips(c.chips).replace(/^<div class="chips">|<\/div>$/g, ''));
    return `<div class="pn">${pic}<div class="nm">${jvEsc(name)}</div>${bat || '<span></span>'}<div class="st">${jvEsc(st)}</div><div class="loc"><span>LOC ›</span> ${jvEsc(loc || (c.lost_text ?? 'Signal lost'))}</div><div class="meta"><div class="chips">${chips.join('')}</div></div></div>`;
  }

  getCardSize() { return 2; }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }
}

/* ================================================================== */
/* jv-thermostat-card                                                 */
/* ================================================================== */
class JvThermostatCard extends JvBase {
  static tag = 'jv-thermostat-card';
  static cardName = 'JV Thermostat';
  static desc = 'Ring-gauge thermostat with HVAC action, mode, fan, humidity and setpoint controls.';
  static variant = 'th';
  static defaults = { controls: true };
  static css = `
ha-card.th{padding:12px}
.th{display:grid;grid-template-columns:100px minmax(0,1fr);grid-template-rows:1fr min-content min-content 1fr;grid-template-areas:"g n" "g act" "g info" "g ctl";column-gap:10px;row-gap:6px}
.th svg{grid-area:g;align-self:center;width:92px;height:92px}
.th .nm{grid-area:n;align-self:end;font-size:14px;letter-spacing:.24em}
.th .act{grid-area:act;justify-self:start}
.th .info{grid-area:info;font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.85;line-height:1.5}
.th .info b{color:rgb(var(--jv-rgb))}
.th .ctl{grid-area:ctl;align-self:start;display:flex;gap:6px}
.th .ctl .chip{min-width:34px;justify-content:center;font-size:13px;padding:3px 8px}
.th .arc{filter:drop-shadow(0 0 calc(var(--jv-glow) * 4px) rgba(var(--jv-rgb),var(--jv-glow)))}`;

  static getStubConfig(hass) { return { type: 'custom:jv-thermostat-card', entity: Object.keys(hass.states).find((id) => jvDomain(id) === 'climate') || 'climate.example' }; }
  static getConfigForm() {
    return jvForm([
      { name: 'entity', required: true, selector: { entity: { domain: 'climate' } } }, { name: 'name', selector: { text: {} } },
      { type: 'grid', name: '', schema: [{ name: 'min', selector: { number: { mode: 'box' } } }, { name: 'max', selector: { number: { mode: 'box' } } }] },
      { type: 'grid', name: '', schema: [{ name: 'controls', selector: { boolean: {} } }, { name: 'accent', selector: JV_ACCENT_SEL }] },
    ]);
  }

  _step(dir) {
    const c = this._config; const s = this._st(c.entity); if (!s) return;
    const at = s.attributes;
    const celsius = String((this._hass.config && this._hass.config.unit_system && this._hass.config.unit_system.temperature) || '°F').includes('C');
    const step = at.target_temp_step || (celsius ? 0.5 : 1);
    const base = this._pending ?? jvNum(at.temperature);
    if (!Number.isFinite(base)) return;
    const v = jvClamp(Math.round((base + dir * step) / step) * step, at.min_temp ?? -Infinity, at.max_temp ?? Infinity);
    this._pending = v;
    this.dispatchEvent(new CustomEvent('haptic', { bubbles: true, composed: true, detail: 'light' }));
    this._queue();
    clearTimeout(this._pt);
    this._pt = setTimeout(() => {
      this._pt = null;
      this._hass.callService('climate', 'set_temperature', { entity_id: c.entity, temperature: v });
      clearTimeout(this._pclear);
      this._pclear = setTimeout(() => { this._pending = null; this._queue(); }, 6000);
    }, 900);
  }

  _render() {
    const c = this._config;
    const s = this._st(c.entity);
    if (!s) return `<div class="err">Entity not found: ${jvEsc(c.entity)}</div>`;
    const at = s.attributes;
    const celsius = String((this._hass.config && this._hass.config.unit_system && this._hass.config.unit_system.temperature) || '°F').includes('C');
    const min = c.min ?? (celsius ? 15 : 60); const max = c.max ?? (celsius ? 30 : 85);
    const act = at.hvac_action || '—';
    if (c.accent === undefined) this._flags.accent = act === 'heating' ? 'orange' : 'cyan';
    this._flags.dead = JV_DEAD.has(s.state);
    this._acts.card = { entity: c.entity, tap_action: c.tap_action || { action: 'more-info' }, hold_action: c.hold_action || { action: 'none' } };
    if (this._pending != null && !this._pt && jvNum(at.temperature) === this._pending) this._pending = null;
    const cur = jvNum(at.current_temperature);
    const tgt = this._pending ?? jvNum(at.temperature);
    const lo = jvNum(at.target_temp_low); const hi = jvNum(at.target_temp_high);
    const pct = Number.isFinite(cur) ? jvClamp((cur - min) / (max - min), 0, 1) : 0;
    const r = 38; const C = 2 * Math.PI * r;
    let marker = '';
    if (Number.isFinite(tgt)) {
      const a = (jvClamp((tgt - min) / (max - min), 0, 1) * 2 * Math.PI) - Math.PI / 2;
      marker = `<circle cx="${(50 + r * Math.cos(a)).toFixed(1)}" cy="${(50 + r * Math.sin(a)).toFixed(1)}" r="3.4" fill="#effdff" style="stroke:rgb(var(--jv-rgb))" stroke-width="1.5"/>`;
    }
    const setTxt = Number.isFinite(tgt) ? `SET ${jvFmt(tgt, 1)}°` : (Number.isFinite(lo) && Number.isFinite(hi) ? `${jvFmt(lo, 0)}–${jvFmt(hi, 0)}°` : s.state.toUpperCase());
    const svg = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" style="stroke:rgba(var(--jv-rgb),.14)" stroke-width="6"/><circle class="arc" cx="50" cy="50" r="${r}" fill="none" style="stroke:rgb(var(--jv-rgb))" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/><circle cx="50" cy="50" r="29" fill="none" style="stroke:rgba(var(--jv-rgb),.4)" stroke-width="1" stroke-dasharray="2 3"/>${marker}<text x="50" y="54" text-anchor="middle" font-size="22" font-weight="700" fill="#effdff" font-family="inherit">${Number.isFinite(cur) ? Math.round(cur) : '—'}°</text><text x="50" y="68" text-anchor="middle" font-size="7" letter-spacing="1.2" style="fill:rgb(var(--jv-rgb))" font-family="inherit">${jvEsc(setTxt)}</text></svg>`;
    const busy = ['cooling', 'heating', 'fan', 'drying', 'preheating', 'defrosting'].includes(act);
    const b = (x) => `<b>${jvEsc(x)}</b>`;
    const info = `Mode ${b(s.state.replace(/_/g, ' '))}${at.fan_mode ? ` · Fan ${b(at.fan_mode)}` : ''}${at.current_humidity != null ? ` · RH ${b(`${at.current_humidity}%`)}` : ''}`;
    let ctl = '';
    if (c.controls !== false && Number.isFinite(jvNum(at.temperature)) && s.state !== 'off') {
      this._acts.dn = { handler: (k) => k === 'tap' && this._step(-1) };
      this._acts.up = { handler: (k) => k === 'tap' && this._step(1) };
      ctl = `<div class="ctl"><span class="chip" data-act="dn" role="button" tabindex="0" aria-label="Lower setpoint">−</span><span class="chip" data-act="up" role="button" tabindex="0" aria-label="Raise setpoint">+</span></div>`;
    }
    const name = this._val(c.name) ?? at.friendly_name;
    return `<div class="th">${svg}<div class="nm">${jvEsc(name)}</div><div class="act">${this._chip(`${busy ? '◉ ' : ''}${act}`, '', busy ? '' : '')}</div><div class="info">${info}</div>${ctl}</div>`;
  }

  getCardSize() { return 3; }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }
}

/* ================================================================== */
/* jv-meter-card — threshold meter (soil moisture, battery, tank …)   */
/* ================================================================== */
const JV_METER_PRESETS = {
  moisture: { bad: 20, warn: 30, high: 60, direction: 'low', icon: 'mdi:sprout', labels: { bad: 'Water now', warn: 'Water soon', high: 'Saturated', ok: 'Nominal', offline: 'Offline' } },
  battery: { bad: 15, warn: 30, direction: 'low', icon: 'mdi:battery', labels: { bad: 'Replace', warn: 'Low', ok: 'OK', offline: 'Offline' } },
  generic: { direction: 'low', icon: 'mdi:gauge', labels: { bad: 'Critical', warn: 'Low', high: 'High', ok: 'Nominal', offline: 'Offline' } },
};

class JvMeterCard extends JvBase {
  static tag = 'jv-meter-card';
  static cardName = 'JV Meter';
  static desc = 'Threshold meter with status chips (moisture, battery, any 0-100 value). Lists several entities as a ranked queue.';
  static variant = 'mt';
  static css = `
ha-card.mt{padding:12px 14px}
.one{display:grid;grid-template-columns:34px minmax(0,1fr) auto;grid-template-areas:"i n pct" "i l pct" "bar bar bar" "meta meta meta";column-gap:10px;row-gap:3px;align-items:center}
.one .ic{grid-area:i;--mdc-icon-size:26px}
.one .nm{grid-area:n;font-size:13px;letter-spacing:.2em}
.one .lb{grid-area:l}
.pct{grid-area:pct;font-size:28px;font-weight:700;color:var(--jv-bright)}
.pct small{font-size:12px;opacity:.7}
.bar{grid-area:bar;margin-top:8px;position:relative;height:8px;background:rgba(var(--jv-rgb),.12);border:1px solid rgba(var(--jv-rgb),.35)}
.bar .fill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,rgba(var(--jv-rgb),.45),rgb(var(--jv-rgb)));box-shadow:0 0 calc(var(--jv-glow) * 8px) rgba(var(--jv-rgb),var(--jv-glow))}
.bar .mk{position:absolute;top:-3px;bottom:-3px;width:1px}
.one .meta{grid-area:meta;margin-top:6px}
.row{display:grid;grid-template-columns:minmax(0,1fr) 44px 86px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(var(--jv-rgb),.08)}
.row[data-act]{cursor:pointer}
.row .nm{color:rgb(var(--rc))}
.row .rm{font-size:9px;letter-spacing:.12em;text-transform:uppercase;opacity:.6}
.row .mini{margin-top:4px;height:4px;background:rgba(var(--rc),.14)}
.row .mini i{display:block;height:100%;background:rgb(var(--rc))}
.row .v{text-align:right;font-size:16px;font-weight:700;color:var(--jv-bright)}
.row .chip{justify-content:center;white-space:nowrap}`;

  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((id) => /moisture/.test(id)) || Object.keys(hass.states).find((id) => hass.states[id].attributes.device_class === 'battery');
    return { type: 'custom:jv-meter-card', entity: e || 'sensor.example', preset: e && /moisture/.test(e) ? 'moisture' : 'battery' };
  }
  static getConfigForm() {
    return jvForm([
      { name: 'entity', selector: { entity: { domain: 'sensor' } } },
      { type: 'grid', name: '', schema: [{ name: 'name', selector: { text: {} } }, { name: 'label', selector: { text: {} } }] },
      { type: 'grid', name: '', schema: [{ name: 'icon', selector: { icon: {} } }, { name: 'preset', selector: { select: { options: ['moisture', 'battery', 'generic'] } } }] },
      { type: 'grid', name: '', schema: [{ name: 'battery', selector: { entity: { domain: 'sensor' } } }, { name: 'temperature', selector: { entity: { domain: 'sensor' } } }] },
      { type: 'expandable', name: 'thresholds', title: 'Thresholds', schema: [{ type: 'grid', name: '', schema: [{ name: 'bad', selector: { number: { mode: 'box' } } }, { name: 'warn', selector: { number: { mode: 'box' } } }, { name: 'high', selector: { number: { mode: 'box' } } }] }] },
      { name: 'direction', selector: { select: { options: [{ value: 'low', label: 'Value is low' }, { value: 'high', label: 'Value is high' }] } } },
      { name: 'accent', selector: JV_ACCENT_SEL },
    ]);
  }
  validate(c) { if (!c.entity && !Array.isArray(c.entities)) throw new Error('entity or entities required'); }

  _p() {
    const c = this._config;
    const p = JV_METER_PRESETS[c.preset || 'generic'] || JV_METER_PRESETS.generic;
    return { ...p, ...(c.thresholds || {}), labels: { ...p.labels, ...(c.labels || {}) }, direction: c.direction || p.direction, min: c.min ?? 0, max: c.max ?? 100 };
  }

  _level(v, P) {
    if (!Number.isFinite(v)) return 'offline';
    if (P.direction === 'high') {
      if (P.bad != null && v > P.bad) return 'bad';
      if (P.warn != null && v > P.warn) return 'warn';
    } else {
      if (P.bad != null && v < P.bad) return 'bad';
      if (P.warn != null && v < P.warn) return 'warn';
      if (P.high != null && v > P.high) return 'high';
    }
    return 'ok';
  }

  _lvlRgb(l) {
    if (l === 'bad' || l === 'offline') return JV_COLORS.red;
    if (l === 'warn') return JV_COLORS.amber;
    return jvRgb(this._val(this._config.accent)) || JV_COLORS.green;
  }

  _pctOf(v, P) { return Number.isFinite(v) ? jvClamp(((v - P.min) / (P.max - P.min)) * 100, 0, 100) : 0; }

  _render() {
    const c = this._config; const P = this._p();
    if (Array.isArray(c.entities)) return this._renderList(P);
    const s = this._st(c.entity);
    const v = s ? jvNum(s.state) : NaN;
    const lvl = this._level(v, P);
    this._flags.accent = this._lvlRgb(lvl);
    this._flags.dead = !s;
    this._acts.card = { entity: c.entity, tap_action: c.tap_action || { action: 'more-info' }, hold_action: c.hold_action || { action: 'none' } };
    const sevCls = lvl === 'bad' || lvl === 'offline' ? 'bad' : lvl === 'warn' ? 'warn' : '';
    const marks = [];
    if (P.bad != null) marks.push(`<i class="mk" style="left:${this._pctOf(P.bad, P)}%;background:rgb(var(--jv-bad))"></i>`);
    if (P.warn != null) marks.push(`<i class="mk" style="left:${this._pctOf(P.warn, P)}%;background:rgb(var(--jv-warn));opacity:.7"></i>`);
    const chips = [this._chip('Status', P.labels[lvl] ?? lvl, sevCls)];
    const B = c.battery && this._st(c.battery);
    if (c.battery) { const b = B ? Math.round(jvNum(B.state)) : NaN; chips.push(this._chip('Batt', isNaN(b) ? '—' : `${b}%`, !isNaN(b) && b <= 20 ? 'warn' : '')); }
    const T = c.temperature && this._st(c.temperature);
    if (c.temperature) { const t = T ? Math.round(jvNum(T.state)) : NaN; chips.push(this._chip('Temp', isNaN(t) ? '—' : `${t}°`)); }
    if (s) chips.push(this._chip('Upd', jvDur(Date.now() - Date.parse(s.last_updated))));
    const extra = this._chips(c.chips).replace(/^<div class="chips">|<\/div>$/g, '');
    const name = this._val(c.name) ?? (s && s.attributes.friendly_name) ?? c.entity;
    const unit = c.unit ?? (s && s.attributes.unit_of_measurement) ?? '%';
    const label = this._val(c.label);
    return `<div class="one">${this._icon(this._val(c.icon) || P.icon, null, 'ic on')}<div class="nm">${jvEsc(name)}</div><div class="lb">${jvEsc(label ?? '')}</div><div class="pct gt">${Number.isFinite(v) ? Math.round(v) : '—'}<small>${jvEsc(unit)}</small></div><div class="bar"><i class="fill" style="width:${this._pctOf(v, P)}%"></i>${marks.join('')}</div><div class="meta"><div class="chips">${chips.join('')}${extra}</div></div></div>`;
  }

  _renderList(P) {
    const c = this._config;
    if (c.accent === undefined) this._flags.accent = 'green';
    const rows = c.entities.map((e) => (typeof e === 'string' ? { entity: e } : e)).map((e) => {
      const s = this._st(e.entity);
      return { ...e, s, v: s ? jvNum(s.state) : NaN };
    });
    const dir = c.sort ?? (P.direction === 'high' ? 'desc' : 'asc');
    if (dir !== 'none') {
      rows.sort((a, b) => {
        if (isNaN(a.v) && isNaN(b.v)) return 0;
        if (isNaN(a.v)) return -1;
        if (isNaN(b.v)) return 1;
        return dir === 'desc' ? b.v - a.v : a.v - b.v;
      });
    }
    const limit = c.limit ?? rows.length;
    return rows.slice(0, limit).map((r, i) => {
      const lvl = this._level(r.v, P);
      const rgb = this._lvlRgb(lvl);
      const sev = lvl === 'bad' || lvl === 'offline' ? 'bad' : lvl === 'warn' ? 'warn' : '';
      const k = `r${i}`;
      this._acts[k] = { entity: r.entity, tap_action: { action: 'more-info' }, hold_action: { action: 'none' } };
      const name = r.name ?? (r.s && r.s.attributes.friendly_name) ?? r.entity;
      return `<div class="row" data-act="${k}" style="--rc:${rgb}"><div style="min-width:0"><div class="nm">${jvEsc(name)}</div><div class="rm">${jvEsc(r.label ?? '')}</div><div class="mini"><i style="width:${this._pctOf(r.v, P)}%"></i></div></div><div class="v">${Number.isFinite(r.v) ? `${Math.round(r.v)}%` : '—'}</div>${this._chip(P.labels[lvl] ?? lvl, '', sev)}</div>`;
    }).join('');
  }

  getCardSize() { return this._config && Array.isArray(this._config.entities) ? Math.ceil(this._config.entities.length * 0.9) + 1 : 2; }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }
}

/* ================================================================== */
/* jv-zigbee-card — mesh health, maintenance orders, fleet, roster    */
/* ================================================================== */
class JvZigbeeCard extends JvBase {
  static tag = 'jv-zigbee-card';
  static cardName = 'JV Zigbee';
  static desc = 'Zigbee mesh health from the device registry (ZHA or Zigbee2MQTT): summary, maintenance orders, offline nodes, battery fleet, roster.';
  static watchAll = true;
  static defaults = { mode: 'maintenance', integration: 'zha' };
  static css = `
.li{display:grid;gap:10px;align-items:start;padding:8px 0;border-bottom:1px solid rgba(var(--jv-rgb),.08)}
.mo{grid-template-columns:24px minmax(0,1fr)}
.mo ha-icon{--mdc-icon-size:20px;color:rgb(var(--rc))}
.t{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgb(var(--rc));white-space:normal}
.d{font-size:10.5px;line-height:1.45;opacity:.8;margin-top:2px;white-space:normal}
.sm{font-size:9px;letter-spacing:.1em;text-transform:uppercase;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.n1{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.of{grid-template-columns:minmax(0,1fr) auto;align-items:center;padding:6px 0}
.bt{grid-template-columns:20px minmax(0,1fr) 54px;align-items:center;padding:6px 0;gap:8px}
.bt ha-icon{--mdc-icon-size:18px;color:rgb(var(--rc))}
.mini{margin-top:4px;height:4px;background:rgba(var(--rc),.14)}.mini i{display:block;height:100%;background:rgb(var(--rc))}
.num{text-align:right;font-size:15px;font-weight:700;color:var(--jv-bright)}
.ah{margin:10px 0 4px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(var(--jv-rgb),.35);padding-bottom:3px}
.ah span:first-child{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:rgb(var(--jv-rgb))}
.ah span:last-child{font-size:9px;letter-spacing:.14em;text-transform:uppercase}
.ro{display:grid;grid-template-columns:8px minmax(0,1fr) auto 22px;gap:8px;align-items:center;padding:5px 0}
.dot{display:block;width:8px;height:8px;border-radius:50%;background:rgb(var(--rc))}
.ctl{--mdc-icon-size:18px;color:rgba(214,249,255,.4);cursor:pointer}
.ctl.on{color:rgb(var(--jv-ok))}
.clear{padding:8px 0;color:rgb(var(--jv-ok));letter-spacing:.12em;text-transform:uppercase;font-size:11px}
.sumline{margin-top:8px;font-size:10.5px;line-height:1.55;letter-spacing:.12em;text-transform:uppercase;color:#a9eefb}`;

  static getStubConfig() { return { type: 'custom:jv-zigbee-card', mode: 'maintenance' }; }
  static getConfigForm() {
    return jvForm([
      { type: 'grid', name: '', schema: [{ name: 'mode', selector: { select: { options: ['summary', 'maintenance', 'offline', 'batteries', 'roster'] } } }, { name: 'integration', selector: { select: { options: [{ value: 'zha', label: 'ZHA' }, { value: 'mqtt', label: 'Zigbee2MQTT (MQTT)' }] } } }] },
      { type: 'grid', name: '', schema: [{ name: 'battery_low', selector: { number: { min: 1, max: 100, mode: 'box' } } }, { name: 'battery_critical', selector: { number: { min: 1, max: 100, mode: 'box' } } }] },
      { type: 'grid', name: '', schema: [{ name: 'lqi_weak', selector: { number: { min: 0, max: 255, mode: 'box' } } }, { name: 'quiet_hours', selector: { number: { min: 1, max: 720, mode: 'box' } } }] },
      { name: 'accent', selector: JV_ACCENT_SEL },
    ]);
  }

  _opts() {
    const c = this._config;
    const o = { integration: c.integration };
    for (const k of ['battery_low', 'battery_critical', 'lqi_weak', 'quiet_hours', 'exclude_areas', 'exclude_devices']) if (c[k] != null) o[k] = c[k];
    return o;
  }

  _sevRgb(s) { return s === 3 ? JV_COLORS.red : s === 2 ? JV_COLORS.amber : s === 1 ? JV_COLORS.cyan : JV_COLORS.green; }

  _render() {
    const c = this._config;
    const Z = jvZigbeeNodes(this._hass, this._opts());
    const o = { battery_low: 30, battery_critical: 15, lqi_weak: 80, quiet_hours: 48, ...this._opts() };
    if (!Z.length) return `<div class="clear" style="color:rgb(var(--jv-warn))">No ${jvEsc(c.integration)} devices found</div>`;
    switch (c.mode) {
      case 'summary': return this._summary(Z, o);
      case 'offline': return this._offline(Z);
      case 'batteries': return this._batteries(Z, o);
      case 'roster': return this._roster(Z);
      default: return this._maintenance(Z, o);
    }
  }

  _summary(Z, o) {
    const off = Z.filter((d) => d.off).length;
    const R = Z.filter((d) => !d.batt); const rOn = R.filter((d) => !d.off).length;
    const lb = Z.filter((d) => !d.off && d.bat !== null && d.bat <= o.battery_low).length;
    const iss = Z.filter((d) => d.sev >= 2).length;
    const pct = Math.round((100 * (Z.length - off)) / Z.length);
    const sev = iss ? (Z.some((d) => d.sev === 3) ? 'bad' : 'warn') : 'ok';
    const chips = [this._chip('Nodes', Z.length), this._chip('Online', Z.length - off), this._chip('Offline', off, off ? 'bad' : ''), this._chip('Routers', `${rOn}/${R.length}`, rOn < R.length ? 'warn' : ''), this._chip('Low Batt', lb, lb ? 'warn' : '')];
    return `<div class="chips hud">${chips.join('')}</div><div class="sumline">Mesh availability ${pct}%<br><span class="s-${sev}">${iss ? `${iss} node${iss > 1 ? 's' : ''} need attention` : 'All nodes nominal'}</span></div>`;
  }

  _maintenance(Z, o) {
    const it = [];
    const g = {};
    Z.filter((d) => d.off && !d.batt).forEach((d) => { (g[d.area] = g[d.area] || []).push(d); });
    Object.keys(g).sort().forEach((a) => {
      const L = g[a];
      it.push({ s: 3, i: 'mdi:power-plug-off', t: `Restore power · ${a}`, d: `${L.length} mains node${L.length > 1 ? 's' : ''} offline ~${jvDur(Date.now() - Math.max(...L.map((x) => x.lastAny)))}: ${L.map((x) => x.name).join(', ')}. Mains devices are mesh routers, so keep their wall switches on.` });
    });
    Z.filter((d) => d.off && d.batt).forEach((d) => it.push({ s: 3, i: 'mdi:link-variant-off', t: `Reconnect · ${d.name}`, d: `${d.area} · battery node offline ~${jvDur(Date.now() - d.lastAny)}. Check the battery, press its button to wake it, and re-pair if it stays offline.` }));
    Z.filter((d) => !d.off && d.bat !== null && d.bat <= o.battery_critical).sort((a, b) => a.bat - b.bat).forEach((d) => it.push({ s: 3, i: 'mdi:battery-alert-variant-outline', t: `Replace battery · ${d.name}`, d: `${d.area} · ${Math.round(d.bat)}% remaining.` }));
    Z.filter((d) => !d.off && d.bat !== null && d.bat > o.battery_critical && d.bat <= o.battery_low).sort((a, b) => a.bat - b.bat).forEach((d) => it.push({ s: 2, i: 'mdi:battery-30', t: `Plan battery swap · ${d.name}`, d: `${d.area} · ${Math.round(d.bat)}% remaining.` }));
    Z.filter((d) => !d.off && d.lqi !== null && d.lqi < o.lqi_weak).forEach((d) => it.push({ s: 1, i: 'mdi:signal-cellular-1', t: `Weak link · ${d.name}`, d: `${d.area} · LQI ${d.lqi}${d.rssi !== null ? ` / RSSI ${d.rssi}` : ''}. Add a powered router nearby.` }));
    Z.filter((d) => !d.off && d.batt && d.quiet !== null && d.quiet > o.quiet_hours).forEach((d) => it.push({ s: 1, i: 'mdi:sleep', t: `Verify · ${d.name}`, d: `${d.area} · no state change for ${jvDur(Date.now() - d.last)}. May just be idle; trigger it to confirm.` }));
    if (!it.length) return '<div class="clear">No maintenance required · mesh nominal</div>';
    return it.slice(0, this._config.limit ?? it.length).map((x, k) => `<div class="li mo" style="--rc:${this._sevRgb(x.s)}"><ha-icon icon="${x.i}"></ha-icon><div style="min-width:0"><div class="t">${String(k + 1).padStart(2, '0')} › ${jvEsc(x.t)}</div><div class="d">${jvEsc(x.d)}</div></div></div>`).join('');
  }

  _offline(Z) {
    const L = Z.filter((d) => d.off).sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
    if (!L.length) return '<div class="clear">All nodes reporting</div>';
    return L.map((d) => `<div class="li of" style="--rc:${JV_COLORS.red}"><div style="min-width:0"><div class="n1" style="color:#ff8080">${jvEsc(d.name)}</div><div class="sm">${jvEsc(d.area)} · ${d.batt ? 'End device' : 'Router'} · ${jvEsc(d.model)}</div></div>${this._chip('Lost', jvDur(Date.now() - d.lastAny), 'bad')}</div>`).join('');
  }

  _batteries(Z, o) {
    const L = Z.filter((d) => d.batt).sort((a, b) => (a.off ? -1 : a.bat === null ? 0 : a.bat) - (b.off ? -1 : b.bat === null ? 0 : b.bat));
    if (!L.length) return '<div class="clear">No battery nodes</div>';
    return L.map((d) => {
      const n = d.bat;
      const bad = d.off || (n !== null && n <= o.battery_critical);
      const rgb = bad ? JV_COLORS.red : (n !== null && n <= o.battery_low) ? JV_COLORS.amber : JV_COLORS.green;
      const p = d.off || n === null ? 0 : jvClamp(n, 0, 100);
      const ic = d.off ? 'mdi:battery-off-outline' : n === null ? 'mdi:battery-unknown' : n > 80 ? 'mdi:battery' : n > 50 ? 'mdi:battery-70' : n > 30 ? 'mdi:battery-40' : n > 15 ? 'mdi:battery-20' : 'mdi:battery-alert-variant-outline';
      return `<div class="li bt" style="--rc:${rgb}"><ha-icon icon="${ic}"></ha-icon><div style="min-width:0"><div class="n1" style="color:rgb(var(--rc))">${jvEsc(d.name)}</div><div class="sm">${jvEsc(d.area)}</div><div class="mini"><i style="width:${p}%"></i></div></div><div class="num">${d.off ? 'OFF' : n === null ? '—' : `${Math.round(n)}%`}</div></div>`;
    }).join('');
  }

  _roster(Z) {
    const L = [...Z].sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
    const g = {};
    L.forEach((d) => { (g[d.area] = g[d.area] || []).push(d); });
    let k = 0;
    return Object.keys(g).map((a) => {
      const G = g[a];
      const bad = G.filter((d) => d.sev >= 2).length;
      const rows = G.map((d) => {
        const ps = d.ctl && this._st(d.ctl) ? this._st(d.ctl).state : null;
        const meta = [d.batt ? 'End device' : 'Router', d.model, d.lqi !== null ? `LQI ${d.lqi}` : null, d.off ? null : `Act ${jvDur(Date.now() - d.last)}`].filter(Boolean).join(' · ');
        const cls = d.sev === 3 ? 'bad' : d.sev === 2 ? 'warn' : '';
        let ctl = '<span></span>';
        if (d.ctl) {
          const key = `z${k++}`;
          this._acts[key] = { entity: d.ctl, tap_action: { action: 'toggle', haptic: 'light' }, hold_action: { action: 'more-info' } };
          ctl = `<ha-icon class="ctl ${ps === 'on' ? 'on' : ''}" data-act="${key}" icon="${d.ctl.startsWith('light.') ? 'mdi:lightbulb' : 'mdi:power'}"></ha-icon>`;
        }
        return `<div class="ro" style="--rc:${this._sevRgb(d.sev)}"><i class="dot"></i><div style="min-width:0"><div class="n1" style="color:#e9fdff;letter-spacing:.08em">${jvEsc(d.name)}</div><div class="sm" style="opacity:.55">${jvEsc(meta)}</div></div>${this._chip(d.st, '', cls)}${ctl}</div>`;
      }).join('');
      return `<div class="ah"><span>${jvEsc(a)}</span><span class="${bad ? 's-warn' : 's-ok'}">${G.length} node${G.length > 1 ? 's' : ''}${bad ? ` · ${bad} alert` : ''}</span></div>${rows}`;
    }).join('');
  }

  getCardSize() { return 4; }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }
}

/* ================================================================== */
/* jv-timeline-card — state bands, attribute bands, lines, multi-line */
/* ================================================================== */
const JV_LOC_LEGEND = [{ label: 'Home', color: '0,229,255' }, { label: 'Away', color: '255,176,32' }, { label: 'Zone', color: '178,102,255' }, { label: 'No signal', color: '90,110,125' }];

class JvTimelineCard extends HTMLElement {
  static tag = 'jv-timeline-card';
  static cardName = 'JV Timeline';
  static desc = 'History timeline: state bands, attribute bands with duty cycle, sparklines and multi-series temperature lines.';

  static getStubConfig(hass) {
    const p = Object.keys(hass.states).filter((id) => jvDomain(id) === 'person').slice(0, 4);
    return { type: 'custom:jv-timeline-card', title: 'Presence Log', hours: 12, entities: p.length ? p : ['sun.sun'] };
  }
  static getConfigForm() {
    return jvForm([{ type: 'grid', name: '', schema: [{ name: 'title', selector: { text: {} } }, { name: 'hours', selector: { number: { min: 1, max: 336, mode: 'box' } } }] }, { name: 'accent', selector: JV_ACCENT_SEL }]);
  }

  setConfig(c) {
    if (!c || !Array.isArray(c.entities) || !c.entities.length) throw new Error('entities required');
    this._ents = c.entities.map((e) => (typeof e === 'string' ? { entity: e } : e));
    const locOnly = this._ents.every((e) => e.type !== 'multi' && e.type !== 'line' && !e.attribute && ['person', 'device_tracker'].includes(jvDomain(e.entity)));
    this._c = { hours: 12, title: 'History', ...c };
    if (c.legend === undefined) this._c.legend = locOnly ? JV_LOC_LEGEND : [];
    this._ids = []; this._attrIds = [];
    this._ents.forEach((e) => {
      if (e.type === 'multi') (e.series || []).forEach((s) => this._ids.push(s.entity));
      else if (e.attribute) this._attrIds.push(e.entity);
      else this._ids.push(e.entity);
    });
    this._ids = [...new Set(this._ids)]; this._attrIds = [...new Set(this._attrIds)];
    this._data = null; this._last = 0; this._sig = '';
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const rgb = jvRgb(c.accent);
    if (rgb) this.style.setProperty('--jv-rgb', rgb); else this.style.removeProperty('--jv-rgb');
    if (c.glow === true) this.style.setProperty('--jv-glow-strength', '1'); else if (c.glow === false) this.style.setProperty('--jv-glow-strength', '0'); else this.style.removeProperty('--jv-glow-strength');
    if (this._h) this._fetch();
  }

  set hass(h) {
    this._h = h;
    if (!this._ents) return;
    const sig = this._ents.filter((e) => e.type !== 'line' && e.type !== 'multi').map((e) => { const s = h.states[e.entity]; return s ? s.state + (e.attribute ? s.attributes[e.attribute] : '') + s.last_changed : ''; }).join('|');
    const age = this._ents.some((e) => e.type === 'line' || e.type === 'multi') ? 60000 : 300000;
    if (sig !== this._sig || Date.now() - this._last > age) { this._sig = sig; this._fetch(); }
  }

  async _fetch() {
    if (this._busy || !this._h) return;
    this._busy = true; this._last = Date.now();
    const end = new Date(); const start = new Date(end - this._c.hours * 3600000);
    const base = { type: 'history/history_during_period', start_time: start.toISOString(), end_time: end.toISOString(), significant_changes_only: false };
    try {
      const out = {};
      if (this._ids.length) Object.assign(out, await this._h.callWS({ ...base, entity_ids: this._ids, minimal_response: true, no_attributes: true }));
      if (this._attrIds.length) Object.assign(out, await this._h.callWS({ ...base, entity_ids: this._attrIds, minimal_response: false, no_attributes: false }));
      this._err = null; this._data = out;
    } catch (err) { this._err = String((err && err.message) || err); }
    this._start = +start; this._end = +end; this._busy = false; this._render();
  }

  _col(s, e) {
    const m = e && e.colors; const lab = (x) => (e && e.labels && e.labels[x]) || String(x).replace(/_/g, ' ').toUpperCase();
    if (m && m[s]) return [jvRgb(m[s]) || m[s], lab(s)];
    if (s === 'unavailable' || s === 'unknown' || s == null) return ['90,110,125', 'NO SIG'];
    if (m && m._other) return [jvRgb(m._other) || m._other, lab(s)];
    if (s === 'home') return ['0,229,255', 'HOME'];
    if (s === 'not_home') return ['255,176,32', 'AWAY'];
    if (s === 'on') return ['var(--jv-rgb)', lab('on')];
    if (s === 'off') return ['40,70,85', lab('off')];
    return ['178,102,255', lab(s)];
  }

  _t(ms) { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

  _pts(id, attr) {
    const S = this._start; const E = this._end;
    const raw = (this._data && this._data[id]) || [];
    let prev; const pts = [];
    raw.forEach((p) => {
      let s = attr ? (p.a && attr in p.a ? p.a[attr] : prev) : p.s;
      if (attr && (p.s === 'unavailable' || p.s === 'unknown')) s = 'unavailable';
      const t = (attr ? p.lu : (p.lc || p.lu)) * 1000;
      if (pts.length && pts[pts.length - 1].s === s) { prev = s; return; }
      pts.push({ s, t }); prev = s;
    });
    return pts.map((p, i) => ({ s: p.s, t0: Math.max(S, p.t), t1: pts[i + 1] ? pts[i + 1].t : E })).filter((x) => x.t1 > x.t0);
  }

  _path(segs, S, span, y) {
    let d = '';
    segs.forEach((g, i) => {
      const x0 = (((g.t0 - S) / span) * 1000).toFixed(1); const x1 = (((g.t1 - S) / span) * 1000).toFixed(1); const yy = y(g.v);
      d += (i ? `L${x0},${yy}` : `M${x0},${yy}`) + `L${x1},${yy}`;
    });
    return d;
  }

  _num(segs) { return segs.map((g) => ({ ...g, v: parseFloat(g.s) })).filter((g) => !isNaN(g.v)); }

  _line(e) {
    const S = this._start; const span = this._end - S;
    const vals = this._num(this._pts(e.entity));
    const cur = this._h.states[e.entity];
    const unit = (cur && cur.attributes.unit_of_measurement) || '';
    const rgb = jvRgb(e.color) || 'var(--jv-rgb)';
    const cv = cur && !isNaN(parseFloat(cur.state)) ? Math.round(parseFloat(cur.state)) + (unit ? ` ${unit}` : '') : 'NO SIG';
    let svg = '';
    if (vals.length) {
      const max = Math.max(...vals.map((g) => g.v), 1); const min = Math.min(0, ...vals.map((g) => g.v));
      const y = (v) => (38 - ((v - min) / (max - min || 1)) * 34).toFixed(1);
      const d = this._path(vals, S, span, y);
      const first = (((vals[0].t0 - S) / span) * 1000).toFixed(1); const last = (((vals[vals.length - 1].t1 - S) / span) * 1000).toFixed(1);
      const gid = `g${e.entity.replace(/\W/g, '')}`;
      svg = `<svg viewBox="0 0 1000 40" preserveAspectRatio="none"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:rgba(${rgb},.45)"/><stop offset="1" style="stop-color:rgba(${rgb},0)"/></linearGradient></defs><path d="${d}L${last},40L${first},40Z" fill="url(#${gid})"/><path d="${d}" fill="none" style="stroke:rgb(${rgb})" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg><em class="pk">PK ${Math.round(max)}${unit ? ` ${unit}` : ''}</em>`;
    }
    return `<div class="row"><div class="nm">${jvEsc(e.name || e.entity)}<b style="color:rgb(${rgb})">${jvEsc(cv)}</b></div><div class="trk ln">${svg}</div></div>`;
  }

  _multi(e) {
    const S = this._start; const span = this._end - S; const H = e.height || 80;
    const ser = (e.series || []).map((s) => ({ ...s, rgb: jvRgb(s.color) || 'var(--jv-rgb)', vals: this._num(this._pts(s.entity)) }));
    const all = ser.flatMap((s) => s.vals.map((g) => g.v));
    const unit = e.unit ?? '°';
    let svg = ''; let rng = '—';
    if (all.length) {
      let max = Math.max(...all); let min = Math.min(...all);
      const pad = Math.max(1, (max - min) * 0.08); max = Math.ceil(max + pad); min = Math.floor(min - pad);
      rng = `${min}–${max}${unit}`;
      const y = (v) => (H - 2 - ((v - min) / (max - min || 1)) * (H - 6)).toFixed(1);
      const mid = Math.round((max + min) / 2);
      svg = `<svg viewBox="0 0 1000 ${H}" preserveAspectRatio="none">`
        + `<line x1="0" x2="1000" y1="${y(mid)}" y2="${y(mid)}" style="stroke:rgba(var(--jv-rgb),.12)" stroke-dasharray="4 6" vector-effect="non-scaling-stroke"/>`
        + ser.filter((s) => s.vals.length).map((s) => `<path d="${this._path(s.vals, S, span, y)}" fill="none" style="stroke:rgb(${s.rgb})" stroke-width="${s.width || 1.6}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity="${s.opacity || 1}"/>`).join('') + '</svg>'
        + `<em class="pk">${max}${unit}</em><em class="pk lo">${min}${unit}</em>`;
    }
    const chips = ser.map((s) => { const st = this._h.states[s.entity]; const v = st && !isNaN(parseFloat(st.state)) ? `${Math.round(parseFloat(st.state) * 10) / 10}${unit}` : '—'; return `<span><i style="border-top:2px ${s.dash ? 'dashed' : 'solid'} rgb(${s.rgb})"></i>${jvEsc(s.name || s.entity)}<b>${v}</b></span>`; }).join('');
    return `<div class="row"><div class="nm">${jvEsc(e.name || 'Series')}<b style="color:#7fd8e8">${rng}</b></div><div class="trk ln" style="height:${H}px">${svg}</div></div><div class="sl">${chips}</div>`;
  }

  _render() {
    if (!this.shadowRoot || !this._h) return;
    const c = this._c; const S = this._start; const E = this._end; const span = E - S; const L = c.label_width || 66;
    const rows = this._ents.map((e) => {
      if (e.type === 'multi') return this._multi(e);
      if (e.type === 'line') return this._line(e);
      const segs = this._pts(e.entity, e.attribute);
      const cur = this._h.states[e.entity];
      const cs = cur ? (e.attribute ? cur.attributes[e.attribute] : cur.state) : 'unknown';
      let [cc, cl] = this._col(cs, e);
      cl = jvEsc(cl);
      if (e.duty) {
        const on = segs.filter((g) => e.duty.includes(g.s)).reduce((a, g) => a + (g.t1 - g.t0), 0);
        cl = `${cl}<br><span class="dt">RUN ${Math.round((on / span) * 100)}%</span>`;
      }
      const bars = segs.map((g) => {
        const [rgb, lbl] = this._col(g.s, e);
        const l = ((g.t0 - S) / span) * 100; const w = ((g.t1 - g.t0) / span) * 100;
        return `<i class="seg" style="left:${l}%;width:${w}%;--c:${rgb}" title="${jvEsc(lbl)} · ${this._t(g.t0)}–${this._t(g.t1)}">${w > 16 ? `<span>${jvEsc(lbl)}</span>` : ''}</i>`;
      }).join('');
      return `<div class="row"><div class="nm">${jvEsc(e.name || (cur && cur.attributes.friendly_name) || e.entity)}<b style="color:rgb(${cc})">${cl}</b></div><div class="trk">${bars}</div></div>`;
    }).join('');
    const step = c.tick_hours || (c.hours <= 4 ? 1 : c.hours <= 12 ? 3 : c.hours <= 48 ? 6 : 24);
    const first = new Date(S); first.setMinutes(0, 0, 0); first.setHours(first.getHours() + 1);
    let ticks = ''; let lines = '';
    for (let t = +first; t < E; t += 3600000) {
      const d = new Date(t);
      if (step >= 24 ? d.getHours() !== 0 : d.getHours() % step) continue;
      const p = (t - S) / span; if (p > 0.95) continue;
      const lbl = step >= 24 ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleTimeString([], { hour: 'numeric' });
      ticks += `<span style="left:${p * 100}%">${lbl}</span>`;
      lines += `<i class="gl" style="left:calc(${L}px + (100% - ${L}px) * ${p.toFixed(4)})"></i>`;
    }
    const lg = (c.legend || []).map((x) => `<span><i style="background:rgb(${jvRgb(x.color) || x.color})"></i>${jvEsc(x.label)}</span>`).join('');
    this.shadowRoot.innerHTML = `<style>
:host{display:block;--jv-rgb:var(--jv-accent-rgb,0,229,255);--jv-glow:var(--jv-glow-strength,0);--jv-cut:var(--jv-corner,12px);--jv-bg:var(--jv-surface-rgb,2,9,16)}
ha-card{display:block;position:relative;padding:12px 12px 10px;border-radius:0;box-shadow:none;font-family:var(--jv-font-family,'SF Mono',ui-monospace,Menlo,Consolas,monospace);color:var(--jv-text-color,#d6f9ff);background:linear-gradient(155deg,rgba(var(--jv-rgb),.12) 0%,rgba(var(--jv-bg),.92) 70%);border:1px solid rgba(var(--jv-rgb),.45);clip-path:polygon(0 0,calc(100% - var(--jv-cut)) 0,100% var(--jv-cut),100% 100%,var(--jv-cut) 100%,0 calc(100% - var(--jv-cut)))}
.hd{display:flex;justify-content:space-between;align-items:baseline;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgb(var(--jv-rgb));margin-bottom:10px}
.hd em{font-style:normal;color:#a9eefb;opacity:.7;letter-spacing:.12em}
.grid{position:relative}
.gl{position:absolute;top:0;bottom:0;width:1px;background:rgba(var(--jv-rgb),.14);pointer-events:none}
.row{display:grid;grid-template-columns:${L}px 1fr;align-items:center;margin-bottom:9px;position:relative}
.nm{font-size:10px;letter-spacing:.1em;text-transform:uppercase;line-height:1.25;color:#e9fdff;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.nm b{display:block;font-size:8.5px;letter-spacing:.1em;overflow:hidden;text-overflow:ellipsis}
.dt{color:#d6f9ff;opacity:.8}
.trk{position:relative;height:18px;background:rgba(var(--jv-rgb),.05);border:1px solid rgba(var(--jv-rgb),.15);overflow:hidden}
.trk.ln{height:40px}
.trk svg{position:absolute;inset:0;width:100%;height:100%}
.pk{position:absolute;left:4px;top:2px;font-style:normal;font-size:8px;letter-spacing:.1em;color:#7fd8e8;opacity:.8}
.pk.lo{top:auto;bottom:2px}
.sl{display:flex;flex-wrap:wrap;gap:4px 12px;margin:-4px 0 12px ${L}px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#a9eefb}
.sl i{display:inline-block;width:14px;height:0;margin-right:5px;vertical-align:3px}
.sl b{color:#effdff;margin-left:4px}
.seg{position:absolute;top:2px;bottom:2px;background:linear-gradient(180deg,rgba(var(--c),.85),rgba(var(--c),.45));box-shadow:0 0 calc(var(--jv-glow) * 6px) rgba(var(--c),calc(var(--jv-glow) * .6));border-right:1px solid rgba(var(--jv-bg),.9);display:flex;align-items:center;overflow:hidden}
.seg span{font-size:8px;letter-spacing:.12em;padding-left:4px;color:#021018;font-weight:700;white-space:nowrap}
.ax{position:relative;height:12px;margin-left:${L}px;font-size:8.5px;color:#7fd8e8;letter-spacing:.06em}
.ax span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.lg{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:#a9eefb}
.lg i{display:inline-block;width:8px;height:8px;margin-right:4px;vertical-align:-1px}
.err{font-size:10px;color:#ff8a8a;margin-bottom:6px}
</style><ha-card><div class="hd">${jvEsc(c.title)}<em>${c.hours}h · now ${this._t(E)}</em></div>${this._err ? `<div class="err">${jvEsc(this._err)}</div>` : ''}<div class="grid">${lines}${rows}</div><div class="ax">${ticks}</div>${lg ? `<div class="lg">${lg}</div>` : ''}</ha-card>`;
  }

  getCardSize() { return 4; }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }
}

/* ================================================================== */
/* register                                                           */
/* ================================================================== */
[JvSectionCard, JvTileCard, JvReadoutCard, JvChipsCard, JvReactorCard, JvNavCard, JvPersonCard,
  JvThermostatCard, JvMeterCard, JvZigbeeCard, JvTimelineCard].forEach(jvDefine);

console.info(`%c JV-HUD-CARDS %c v${JV_VERSION} `, 'color:#021018;background:#00e5ff;font-weight:700', 'color:#00e5ff;background:#021018');

/* ================================================================== */
/* Visual editor — one element serves every jv-* card.                */
/* Self-contained: works bundled or loaded as a separate module.      */
/* ================================================================== */
const JVE_TAGS = ['jv-section-card', 'jv-tile-card', 'jv-readout-card', 'jv-chips-card', 'jv-reactor-card', 'jv-nav-card',
  'jv-person-card', 'jv-thermostat-card', 'jv-meter-card', 'jv-zigbee-card', 'jv-timeline-card'];
const JVE_COLOR_SEL = { select: { mode: 'dropdown', custom_value: true, options: ['cyan', 'blue', 'amber', 'orange', 'red', 'green', 'violet', 'magenta', 'white', 'slate', 'grey'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) } };
const JVE_ICON_SEL = { icon: {} };
const JVE_TEXT = { text: {} };
const JVE_NUM = { number: { mode: 'box', step: 'any' } };
const JVE_BOOL = { boolean: {} };
const JVE_ENT = { entity: {} };
const JVE_ENTS = { entity: { multiple: true } };
const JVE_TPL = { template: {} };
const jveSel = (options) => ({ select: { mode: 'dropdown', options } });
const jveClone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const jveEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) ? !v.length : typeof v === 'object' && !Object.keys(v).length);
const jveTpl = (s) => typeof s === 'string' && (s.includes('{{') || s.includes('{%'));
const jveCsv = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));
const jveFromCsv = (s) => { const a = String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean); return a.length ? a : undefined; };
const jveFromCsv1 = (s) => { const a = jveFromCsv(s); return a && a.length === 1 ? a[0] : a; };
const jveNum = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v));
const jveStrip = (o) => { const r = {}; for (const [k, v] of Object.entries(o || {})) if (!jveEmpty(v)) r[k] = v; return r; };
const jveNames = (schema) => schema.flatMap((s) => (s.schema && (s.flatten || s.type === 'grid' || !s.name) ? jveNames(s.schema) : s.name ? [s.name] : []));
const jveEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const jveSub = (acc, key) => ({
  get: () => { const o = acc.get(); return o && typeof o === 'object' ? o[key] : undefined; },
  set: (v) => { const o = { ...(acc.get() || {}) }; if (jveEmpty(v) && v !== false) delete o[key]; else o[key] = v; acc.set(o); },
});

const JVE_LABELS = {
  entity: 'Entity', name: 'Name', icon: 'Icon', label: 'Label', show_state: 'Show state line', active_states: 'Active states (comma separated)',
  tap_action: 'Tap action', hold_action: 'Hold action', double_tap_action: 'Double-tap action', navigation_path: 'Navigate to',
  unit: 'Unit', decimals: 'Decimals', attribute: 'Attribute', relative: 'Show as relative time', uppercase: 'Upper-case text', wrap: 'Wrap long text',
  font_size: 'Value font size (e.g. 17px)', size: 'Reactor size (px)', greeting: 'Greeting line', greeting_name: 'Greeting name (blank = your first name)',
  clock: 'Date and time line', chips_layout: 'Chip layout', ok_text: 'All-clear text', max_alerts: 'Alerts shown at once', alert_accent: 'Panel colour while alerting',
  glow: 'Glow effects', layout: 'Layout', background: 'Card background', battery: 'Battery sensor', charging: 'Charging sensor', location: 'Location sensor',
  address: 'Geocoded address sensor', tracker: 'Device tracker', speed: 'Speed sensor', driving: 'Driving sensor', speed_unit: 'Speed unit',
  home_text: 'Text when home', away_text: 'Text when away', lost_text: 'Text when no location', min: 'Minimum', max: 'Maximum', controls: 'Show − / + setpoint buttons',
  temperature: 'Temperature sensor', preset: 'Preset', direction: 'A bad value is', bad: 'Critical', warn: 'Warning', high: 'High', ok: 'Normal', offline: 'Offline',
  sort: 'Sort', limit: 'Show at most', mode: 'Mode', integration: 'Integration', battery_low: 'Low battery %', battery_critical: 'Critical battery %',
  lqi_weak: 'Weak-link LQI below', quiet_hours: 'Quiet after (hours)', exclude_areas: 'Exclude areas (comma separated names)',
  exclude_devices: 'Exclude devices (comma separated names)', title: 'Title', hours: 'Hours shown', tick_hours: 'Gridline every (hours)', label_width: 'Label column width (px)',
  accent: 'Colour', hide_zero: 'Hide when the value is 0', prefix: 'Text before', suffix: 'Text after', fallback: 'Text when missing', zero: 'Text when 0',
  height: 'Height (px)', width: 'Line width', dash: 'Dash pattern (e.g. 6 4)', color: 'Colour', duty: 'Count as running (states, comma separated)',
  message: 'Message', severity: 'Severity', op: 'Test', value: 'Value', value2: 'Upper value (between)', template: 'Template', text: 'Text',
};

const JVE_SOURCES = [
  { value: 'none', label: '— none —' }, { value: 'text', label: 'Text' }, { value: 'entity', label: 'Entity state or attribute' },
  { value: 'count', label: 'Count of entities' }, { value: 'agg', label: 'Average / min / max / sum' }, { value: 'countdown', label: 'Countdown to a date' },
  { value: 'zigbee', label: 'Zigbee statistic' }, { value: 'cond', label: 'If … then … else' }, { value: 'template', label: 'Template (Jinja)' },
];
const JVE_ZIGBEE = [['total', 'Total nodes'], ['online', 'Online nodes'], ['offline', 'Offline nodes'], ['online_total', 'Online / total'], ['routers', 'Routers online / total'],
  ['low_battery', 'Low-battery nodes'], ['attention', 'Nodes needing attention'], ['availability', 'Availability %'], ['status', '"n offline · n low batt"'], ['headline', 'Status headline']]
  .map(([value, label]) => ({ value, label }));
const JVE_OPS = [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }, { value: 'above', label: 'is above' }, { value: 'below', label: 'is below' },
  { value: 'between', label: 'is between' }, { value: 'template', label: 'template is true' }];

function jveSource(s) {
  if (s == null || s === '') return 'none';
  if (typeof s !== 'object') return jveTpl(s) ? 'template' : 'text';
  if (s.template !== undefined) return 'template';
  if (s.count) return 'count';
  if (s.avg || s.min || s.max || s.sum) return 'agg';
  if (s.countdown) return 'countdown';
  if (s.zigbee) return 'zigbee';
  if (s.any || s.all) return 'cond';
  if (s.entity !== undefined) return 'entity';
  return 'text';
}

function jveSummary(s) {
  switch (jveSource(s)) {
    case 'none': return '—';
    case 'text': return String(s);
    case 'template': return 'Template';
    case 'entity': return `${s.entity || 'entity'}${s.attribute ? ` · ${s.attribute}` : ''}`;
    case 'count': return `Count of ${(s.count || []).length} entities`;
    case 'agg': { const op = ['avg', 'min', 'max', 'sum'].find((k) => s[k]); return `${op} of ${(s[op] || []).length} entities`; }
    case 'countdown': return `Countdown to ${s.countdown}`;
    case 'zigbee': return `Zigbee · ${s.zigbee}`;
    default: return 'If … then … else';
  }
}

function jveCondSummary(c) {
  if (typeof c === 'string' || (c && c.template)) return 'Template';
  if (!c || !c.entity) return 'New condition';
  const v = c.state != null ? `= ${jveCsv(c.state)}` : c.state_not != null ? `≠ ${jveCsv(c.state_not)}` : `${c.above != null ? `> ${c.above}` : ''}${c.below != null ? ` < ${c.below}` : ''}`;
  return `${c.entity}${c.attribute ? `.${c.attribute}` : ''} ${v}`;
}

let _jveLoading;
function jveLoadHa() {
  if (customElements.get('ha-form')) return Promise.resolve();
  if (!_jveLoading) {
    _jveLoading = (async () => {
      try {
        for (const t of ['hui-tile-card', 'hui-button-card', 'hui-entities-card']) {
          const C = customElements.get(t);
          if (C && C.getConfigElement) { await C.getConfigElement(); break; }
        }
      } catch (_) { /* ignore */ }
      await Promise.race([customElements.whenDefined('ha-form'), new Promise((r) => setTimeout(r, 4000))]);
    })();
  }
  return _jveLoading;
}

const JVE_CSS = `
:host{display:block}
.sec{border:1px solid var(--divider-color,rgba(127,127,127,.3));border-radius:8px;margin:0 0 10px;background:var(--card-background-color,transparent)}
.sec>summary{cursor:pointer;padding:10px 12px;font-weight:500;list-style:none;display:flex;align-items:center;gap:8px;user-select:none}
.sec>summary::-webkit-details-marker,.item>summary::-webkit-details-marker{display:none}
.sec>summary::before,.item>summary::before{content:'▸';display:inline-block;transition:transform .15s;color:var(--secondary-text-color)}
.sec[open]>summary::before,.item[open]>summary::before{transform:rotate(90deg)}
.sec>.bd{padding:2px 12px 12px;display:grid;gap:12px}
.blk{display:grid;gap:8px}
.blk>.h{font-size:12px;font-weight:500;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.05em}
.nest{border-left:2px solid var(--primary-color,#03a9f4);padding-left:10px;display:grid;gap:8px}
.item{border:1px solid var(--divider-color,rgba(127,127,127,.3));border-radius:6px;background:var(--secondary-background-color,rgba(127,127,127,.06))}
.item>summary{display:flex;align-items:center;gap:4px;padding:4px 6px 4px 8px;cursor:pointer;list-style:none;min-height:32px}
.item>summary .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.item>.bd{padding:8px 10px 10px;display:grid;gap:10px}
.ib{border:none;background:none;color:var(--secondary-text-color);cursor:pointer;padding:4px;border-radius:50%;display:inline-flex;line-height:0}
.ib:hover{background:rgba(127,127,127,.15);color:var(--primary-text-color)}
.ib ha-icon{--mdc-icon-size:18px}
.add{justify-self:start;display:inline-flex;align-items:center;gap:6px;border:1px dashed var(--primary-color,#03a9f4);color:var(--primary-color,#03a9f4);background:none;border-radius:6px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.add ha-icon{--mdc-icon-size:16px}
.maprow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px;align-items:center}
.hint{font-size:12px;color:var(--secondary-text-color);line-height:1.4}
.empty{font-size:13px;color:var(--secondary-text-color);font-style:italic}`;

class JvHudEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._forms = new Set();
    this._open = {};
  }

  set hass(h) {
    this._hass = h;
    for (const f of this._forms) { if (f.isConnected) f.hass = h; }
    if (!this._built && this._config) this._build();
  }

  get hass() { return this._hass; }

  setConfig(config) {
    const s = JSON.stringify(config);
    if (s === this._last) return;
    this._config = jveClone(config);
    this._last = s;
    this._build();
  }

  _emit() {
    this._last = JSON.stringify(this._config);
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: jveClone(this._config) }, bubbles: true, composed: true }));
  }

  get _tag() { return String((this._config && this._config.type) || '').replace(/^custom:/, ''); }

  async _build() {
    if (!this._hass || !this._config) return;
    const token = (this._token = (this._token || 0) + 1);
    await jveLoadHa();
    if (token !== this._token) return;
    this._forms.clear();
    const root = jveEl('div');
    const layout = JVE_LAYOUTS[this._tag];
    root.append(...(layout ? layout(this) : [jveEl('div', 'hint', 'No visual editor for this card type.')]));
    this.shadowRoot.replaceChildren(Object.assign(jveEl('style'), { textContent: JVE_CSS }), root);
    this._built = true;
  }

  /* ---- accessors ---- */
  get R() {
    return {
      get: () => this._config,
      set: (v) => { const type = this._config.type; this._config = { ...v, type }; this._emit(); },
    };
  }

  /* ---- building blocks ---- */
  sec(title, kids, open = false) {
    const d = jveEl('details', 'sec');
    const key = `sec:${title}`;
    d.open = this._open[key] ?? open;
    d.addEventListener('toggle', () => { this._open[key] = d.open; });
    const body = jveEl('div', 'bd');
    body.append(...kids.filter(Boolean));
    d.append(jveEl('summary', null, title), body);
    return d;
  }

  blk(title, kids, nested = false) {
    const b = jveEl('div', nested ? 'blk nest' : 'blk');
    if (title) b.append(jveEl('div', 'h', title));
    b.append(...kids.filter(Boolean));
    return b;
  }

  hint(t) { return jveEl('div', 'hint', t); }

  /* ha-form bound to an accessor. to/from convert between stored config and form data. */
  form(acc, schema, conv = {}) {
    const f = document.createElement('ha-form');
    f.hass = this._hass;
    f.schema = schema;
    f.computeLabel = (s) => s.label || JVE_LABELS[s.name] || s.name;
    f.computeHelper = (s) => s.helper;
    f.data = conv.to ? conv.to(acc.get() ?? {}) : { ...(acc.get() || {}) };
    const names = jveNames(schema);
    f.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      const v = ev.detail.value || {};
      f.data = v;
      if (conv.from) { acc.set(conv.from(v, acc.get())); return; }
      const cur = { ...(acc.get() || {}) };
      for (const n of names) { if (jveEmpty(v[n]) && v[n] !== false) delete cur[n]; else cur[n] = v[n]; }
      acc.set(cur);
    });
    this._forms.add(f);
    return f;
  }

  btn(icon, title, fn) {
    const b = jveEl('button', 'ib');
    b.type = 'button';
    b.title = title;
    b.append(Object.assign(document.createElement('ha-icon'), { icon }));
    b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); });
    return b;
  }

  addBtn(text, fn) {
    const b = jveEl('button', 'add');
    b.type = 'button';
    b.append(Object.assign(document.createElement('ha-icon'), { icon: 'mdi:plus' }), text);
    b.addEventListener('click', (ev) => { ev.preventDefault(); fn(); });
    return b;
  }

  /* region that can re-render itself after a structural change */
  region(render) {
    const host = jveEl('div', 'blk');
    const draw = () => host.replaceChildren(...render(draw).filter(Boolean));
    draw();
    return host;
  }

  /* ---- generic list ---- */
  list(acc, o) {
    const id = o.id || o.title;
    return this.region((redraw) => {
      const arr = acc.get() || [];
      const out = [];
      if (o.title) out.push(jveEl('div', 'h', o.title));
      if (!arr.length) out.push(jveEl('div', 'empty', o.empty || 'Nothing added yet.'));
      arr.forEach((_, i) => {
        const itemAcc = {
          get: () => { const it = (acc.get() || [])[i]; return o.norm ? o.norm(it) : it; },
          set: (v) => { const a = [...(acc.get() || [])]; a[i] = v; acc.set(a); t.textContent = o.summary(itemAcc.get(), i); },
        };
        const d = jveEl('details', 'item');
        const key = `${id}:${i}`;
        d.open = !!this._open[key];
        d.addEventListener('toggle', () => { this._open[key] = d.open; if (d.open && !d._filled) fill(); });
        const s = jveEl('summary');
        const t = jveEl('span', 't', o.summary(itemAcc.get(), i));
        const move = (j) => {
          const a = [...(acc.get() || [])]; if (j < 0 || j >= a.length) return;
          [a[i], a[j]] = [a[j], a[i]];
          const oi = this._open[`${id}:${i}`]; this._open[`${id}:${i}`] = this._open[`${id}:${j}`]; this._open[`${id}:${j}`] = oi;
          acc.set(a); redraw();
        };
        s.append(t, this.btn('mdi:arrow-up', 'Move up', () => move(i - 1)), this.btn('mdi:arrow-down', 'Move down', () => move(i + 1)),
          this.btn('mdi:delete-outline', 'Remove', () => {
            const a = [...(acc.get() || [])]; a.splice(i, 1);
            for (let k = i; k < a.length; k++) this._open[`${id}:${k}`] = this._open[`${id}:${k + 1}`];
            acc.set(a.length ? a : undefined); redraw();
          }));
        const body = jveEl('div', 'bd');
        const fill = () => { body.replaceChildren(...o.item(itemAcc, i).filter(Boolean)); d._filled = true; };
        if (d.open) fill();
        d.append(s, body);
        out.push(d);
      });
      out.push(this.addBtn(o.add || 'Add', () => {
        const a = [...(acc.get() || []), o.newItem()];
        this._open[`${id}:${a.length - 1}`] = true;
        acc.set(a); redraw();
      }));
      return out;
    });
  }

  /* ---- key → value map (state labels, colour maps) ---- */
  map(acc, o = {}) {
    const rows = Object.entries(acc.get() || {}).filter(([k]) => !o.skipDefault || k !== '_default').map(([k, v]) => ({ k, v }));
    const write = () => {
      const obj = {};
      if (o.skipDefault && (acc.get() || {})._default !== undefined) obj._default = acc.get()._default;
      for (const r of rows) if (r.k !== '' && r.k != null) obj[r.k] = r.v;
      acc.set(Object.keys(obj).length ? obj : undefined);
    };
    return this.region((redraw) => {
      const out = [];
      if (o.title) out.push(jveEl('div', 'h', o.title));
      rows.forEach((r, i) => {
        const line = jveEl('div', 'maprow');
        const rAcc = { get: () => r, set: (v) => { r.k = v.k ?? ''; r.v = v.v; write(); } };
        line.append(this.form(rAcc, [{ type: 'grid', name: '', schema: [{ name: 'k', label: o.keyLabel || 'State', selector: JVE_TEXT }, { name: 'v', label: o.valLabel || 'Shows', selector: o.valSel || JVE_TEXT }] }], {
          to: (x) => ({ k: x.k, v: x.v }), from: (v) => ({ k: v.k, v: v.v }),
        }), this.btn('mdi:delete-outline', 'Remove', () => { rows.splice(i, 1); write(); redraw(); }));
        out.push(line);
      });
      out.push(this.addBtn(o.add || 'Add state', () => { rows.push({ k: '', v: '' }); redraw(); }));
      if (o.help) out.push(this.hint(o.help));
      return out;
    });
  }

  /* ---- dynamic value (source picker) ---- */
  value(acc, title, o = {}) {
    let type = jveSource(acc.get());
    const sources = o.sources ? JVE_SOURCES.filter((s) => o.sources.includes(s.value)) : JVE_SOURCES;
    return this.region((redraw) => {
      const typeAcc = { get: () => ({ src: type }), set: (v) => { if (v.src && v.src !== type) { const old = acc.get(); type = v.src; acc.set(this._defaultFor(type, old)); redraw(); } } };
      const out = [jveEl('div', 'h', title), this.form(typeAcc, [{ name: 'src', label: 'Source', selector: jveSel(sources) }], { to: (x) => x, from: (v) => v })];
      const fields = this._sourceFields(acc, type);
      if (fields.length) out.push(this.blk(null, fields, true));
      if (o.help) out.push(this.hint(o.help));
      return out;
    });
  }

  _defaultFor(t, old) {
    const pre = old && typeof old === 'object' ? jveStrip({ prefix: old.prefix, suffix: old.suffix }) : {};
    switch (t) {
      case 'none': return undefined;
      case 'text': return typeof old === 'string' && !jveTpl(old) ? old : '';
      case 'template': return jveTpl(old) ? old : '{{ }}';
      case 'entity': return { entity: '', ...pre };
      case 'count': return { count: [], ...pre };
      case 'agg': return { avg: [], ...pre };
      case 'countdown': return { countdown: '12-25' };
      case 'zigbee': return { zigbee: 'online_total', ...pre };
      case 'cond': return { any: [], then: '', else: '' };
      default: return undefined;
    }
  }

  _sourceFields(acc, type) {
    const pre = { type: 'grid', name: '', schema: [{ name: 'prefix', selector: JVE_TEXT }, { name: 'suffix', selector: JVE_TEXT }] };
    switch (type) {
      case 'text': return [this.form({ get: () => ({ text: acc.get() ?? '' }), set: (v) => acc.set(v.text) }, [{ name: 'text', selector: JVE_TEXT }], { to: (x) => x, from: (v) => v })];
      case 'template': return [this.form({ get: () => ({ template: typeof acc.get() === 'string' ? acc.get() : (acc.get() || {}).template }), set: (v) => acc.set(v.template) },
        [{ name: 'template', selector: JVE_TPL }], { to: (x) => x, from: (v) => v }),
      this.hint('Rendered live by Home Assistant. Example: {{ states(\'sensor.x\') | round(0) }}')];
      case 'entity': return [
        this.form(acc, [
          { name: 'entity', selector: JVE_ENT },
          { name: 'attribute', selector: { attribute: {} }, context: { filter_entity: 'entity' } },
          { type: 'grid', name: '', schema: [{ name: 'decimals', selector: { number: { mode: 'box', min: 0, max: 4 } } }, { name: 'unit', label: 'Unit (blank = entity unit)', selector: JVE_TEXT }] },
          { type: 'grid', name: '', schema: [{ name: 'hide_unit', label: 'Hide unit', selector: JVE_BOOL }, { name: 'relative', selector: JVE_BOOL }] },
          { type: 'grid', name: '', schema: [{ name: 'since', label: 'Show time since last change', selector: JVE_BOOL }, { name: 'fallback', selector: JVE_TEXT }] },
          pre,
        ], {
          to: (s) => ({ ...s, hide_unit: s.unit === false, unit: s.unit === false ? '' : s.unit }),
          from: (v, s) => jveStrip({
            ...jveStrip(s), entity: v.entity, attribute: v.attribute, decimals: jveNum(v.decimals), unit: v.hide_unit ? false : (v.unit || undefined),
            relative: v.relative || undefined, since: v.since || undefined, fallback: v.fallback, prefix: v.prefix, suffix: v.suffix,
          }),
        }),
        this.map(jveSub(acc, 'map'), { title: 'Show different text for states', valLabel: 'Shows', help: 'Use _default as the state to cover every other state.' }),
      ];
      case 'count': return [this.form(acc, [
        { name: 'count', label: 'Entities', selector: JVE_ENTS },
        { name: 'state', label: 'Count when state is (comma separated; blank = on/home/open/…)', selector: JVE_TEXT },
        { name: 'attribute', label: 'Use attribute instead of state', selector: JVE_TEXT },
        { type: 'grid', name: '', schema: [{ name: 'above', label: 'Count when above', selector: JVE_NUM }, { name: 'below', label: 'Count when below', selector: JVE_NUM }] },
        { type: 'grid', name: '', schema: [{ name: 'total', label: 'Show as count / total', selector: JVE_BOOL }, { name: 'hide_zero_line', label: 'Show nothing when 0', selector: JVE_BOOL }] },
        { name: 'zero', selector: JVE_TEXT },
        pre,
      ], {
        to: (s) => ({ ...s, count: Array.isArray(s.count) ? s.count : s.count ? [s.count] : [], state: jveCsv(s.state), hide_zero_line: s.zero === '', zero: s.zero === '' ? '' : s.zero }),
        from: (v, s) => {
          const r = jveStrip({ ...jveStrip(s), count: v.count, state: jveFromCsv1(v.state), attribute: v.attribute, above: jveNum(v.above), below: jveNum(v.below), total: v.total || undefined, zero: v.zero, prefix: v.prefix, suffix: v.suffix });
          if (!r.count) r.count = [];
          if (v.hide_zero_line) r.zero = '';
          return r;
        },
      })];
      case 'agg': return [this.form(acc, [
        { name: 'op', label: 'Calculate', selector: jveSel([{ value: 'avg', label: 'Average' }, { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' }, { value: 'sum', label: 'Sum' }]) },
        { name: 'ents', label: 'Entities', selector: JVE_ENTS },
        { type: 'grid', name: '', schema: [{ name: 'attribute', label: 'Attribute (blank = state)', selector: JVE_TEXT }, { name: 'decimals', selector: { number: { mode: 'box', min: 0, max: 4 } } }] },
        pre, { name: 'fallback', selector: JVE_TEXT },
      ], {
        to: (s) => { const op = ['avg', 'min', 'max', 'sum'].find((k) => s[k]) || 'avg'; return { ...s, op, ents: s[op] || [] }; },
        from: (v, s) => {
          const r = jveStrip({ ...jveStrip(s), attribute: v.attribute, decimals: jveNum(v.decimals), prefix: v.prefix, suffix: v.suffix, fallback: v.fallback });
          ['avg', 'min', 'max', 'sum'].forEach((k) => delete r[k]);
          r[v.op || 'avg'] = v.ents || [];
          return r;
        },
      })];
      case 'countdown': return [this.form(acc, [
        { type: 'grid', name: '', schema: [{ name: 'countdown', label: 'Date (MM-DD)', selector: JVE_TEXT }, { name: 'live', label: 'Text on the day', selector: JVE_TEXT }] },
        { type: 'grid', name: '', schema: [{ name: 'prefix', label: 'Text before (default T-)', selector: JVE_TEXT }, { name: 'suffix', selector: JVE_TEXT }] },
      ])];
      case 'zigbee': return [this.form(acc, [{ name: 'zigbee', label: 'Statistic', selector: jveSel(JVE_ZIGBEE) }, pre])];
      case 'cond': {
        const mode = (acc.get() || {}).all ? 'all' : 'any';
        return [
          this.form(acc, [{ name: 'mode', label: 'Match', selector: jveSel([{ value: 'any', label: 'Any condition' }, { value: 'all', label: 'All conditions' }]) },
            { type: 'grid', name: '', schema: [{ name: 'then', label: 'Then show', selector: JVE_TEXT }, { name: 'else', label: 'Otherwise show', selector: JVE_TEXT }] }], {
            to: (s) => ({ mode: s.all ? 'all' : 'any', then: typeof s.then === 'string' ? s.then : '', else: typeof s.else === 'string' ? s.else : '' }),
            from: (v, s) => { const conds = s.any || s.all || []; const r = { ...s }; delete r.any; delete r.all; r[v.mode || 'any'] = conds; r.then = v.then ?? ''; r.else = v.else ?? ''; return r; },
          }),
          this.conditions({ get: () => { const s = acc.get() || {}; return s.all || s.any; }, set: (c) => { const s = { ...(acc.get() || {}) }; const k = s.all ? 'all' : 'any'; s[k] = c || []; acc.set(s); } }, `${mode}-conds`),
        ];
      }
      default: return [];
    }
  }

  /* ---- conditions ---- */
  condForm(acc, extra = []) {
    return this.form(acc, [
      { name: 'entity', selector: JVE_ENT },
      { type: 'grid', name: '', schema: [{ name: 'attribute', label: 'Attribute (optional)', selector: JVE_TEXT }, { name: 'op', selector: jveSel(JVE_OPS) }] },
      { type: 'grid', name: '', schema: [{ name: 'value', label: 'Value (states comma separated, or template)', selector: JVE_TEXT }, { name: 'value2', selector: JVE_NUM }] },
      ...extra,
    ], {
      to: (c) => {
        if (typeof c === 'string') return { op: 'template', value: c };
        c = c || {};
        const base = { ...c };
        if (c.template) return { ...base, op: 'template', value: c.template };
        if (c.state != null) return { ...base, op: 'is', value: jveCsv(c.state) };
        if (c.state_not != null) return { ...base, op: 'is_not', value: jveCsv(c.state_not) };
        if (c.above != null && c.below != null) return { ...base, op: 'between', value: String(c.above), value2: c.below };
        if (c.above != null) return { ...base, op: 'above', value: String(c.above) };
        if (c.below != null) return { ...base, op: 'below', value: String(c.below) };
        return { ...base, op: 'is', value: '' };
      },
      from: (v, old) => {
        const keep = {};
        for (const s of extra) for (const n of jveNames([s])) if (!jveEmpty(v[n])) keep[n] = v[n];
        if (v.op === 'template') return Object.keys(keep).length ? { template: v.value || '', ...keep } : (v.value || '');
        const r = { entity: v.entity || '', ...(v.attribute ? { attribute: v.attribute } : {}), ...keep };
        if (old && typeof old === 'object' && old.missing) r.missing = old.missing;
        const vals = jveFromCsv(v.value);
        if (v.op === 'is') r.state = vals && vals.length === 1 ? vals[0] : vals;
        else if (v.op === 'is_not') r.state_not = vals && vals.length === 1 ? vals[0] : vals;
        else if (v.op === 'above') r.above = jveNum(v.value);
        else if (v.op === 'below') r.below = jveNum(v.value);
        else if (v.op === 'between') { r.above = jveNum(v.value); r.below = jveNum(v.value2); }
        return jveStrip(r);
      },
    });
  }

  conditions(acc, id, extra = [], o = {}) {
    return this.list(acc, {
      id, title: o.title || 'Conditions', add: o.add || 'Add condition', empty: o.empty || 'No conditions.',
      newItem: () => ({ entity: '', state: 'on', ...(o.newExtra || {}) }),
      summary: (c) => (o.summary ? o.summary(c) : jveCondSummary(c)),
      item: (ia) => [this.condForm(ia, extra)],
    });
  }

  /* ---- severity rules ---- */
  severity(acc, title = 'Colour by severity') {
    const detect = (s) => (s == null || s === '' ? 'none' : typeof s === 'string' ? (jveTpl(s) ? 'template' : 'fixed') : 'rules');
    let mode = detect(acc.get());
    return this.region((redraw) => {
      const mAcc = { get: () => ({ m: mode }), set: (v) => { if (v.m !== mode) { mode = v.m; acc.set(mode === 'fixed' ? 'warn' : mode === 'rules' ? { warn_above: 0 } : mode === 'template' ? "{{ 'warn' if false else '' }}" : undefined); redraw(); } } };
      const out = [jveEl('div', 'h', title), this.form(mAcc, [{ name: 'm', label: 'Severity', selector: jveSel([{ value: 'none', label: 'None (accent colour)' }, { value: 'fixed', label: 'Always the same' }, { value: 'rules', label: 'By value' }, { value: 'template', label: 'Template' }]) }], { to: (x) => x, from: (v) => v })];
      if (mode === 'fixed') out.push(this.form({ get: () => ({ s: acc.get() }), set: (v) => acc.set(v.s) }, [{ name: 's', label: 'Severity', selector: jveSel([{ value: 'ok', label: 'OK (green)' }, { value: 'warn', label: 'Warning (amber)' }, { value: 'bad', label: 'Alert (red)' }, { value: 'info', label: 'Info (accent)' }]) }], { to: (x) => x, from: (v) => v }));
      if (mode === 'template') out.push(this.form({ get: () => ({ t: acc.get() }), set: (v) => acc.set(v.t) }, [{ name: 't', label: 'Template returning ok, warn or bad', selector: JVE_TPL }], { to: (x) => x, from: (v) => v }));
      if (mode === 'rules') {
        out.push(this.blk(null, [this.form(acc, [
          { type: 'grid', name: '', schema: [{ name: 'warn_above', label: 'Warning above', selector: JVE_NUM }, { name: 'warn_below', label: 'Warning below', selector: JVE_NUM }] },
          { type: 'grid', name: '', schema: [{ name: 'bad_above', label: 'Alert above', selector: JVE_NUM }, { name: 'bad_below', label: 'Alert below', selector: JVE_NUM }] },
          { name: 'warn_states', label: 'Warning states (comma separated)', selector: JVE_TEXT },
          { name: 'bad_states', label: 'Alert states (comma separated)', selector: JVE_TEXT },
          { name: 'ok_states', label: 'OK states (comma separated)', selector: JVE_TEXT },
          { name: 'else', label: 'Otherwise', selector: jveSel([{ value: '', label: 'Accent colour' }, { value: 'ok', label: 'OK' }, { value: 'warn', label: 'Warning' }, { value: 'bad', label: 'Alert' }]) },
        ], {
          to: (s) => ({ ...s, warn_states: jveCsv(s.warn_states), bad_states: jveCsv(s.bad_states), ok_states: jveCsv(s.ok_states), else: s.else || '' }),
          from: (v) => jveStrip({
            warn_above: jveNum(v.warn_above), warn_below: jveNum(v.warn_below), bad_above: jveNum(v.bad_above), bad_below: jveNum(v.bad_below),
            warn_states: jveFromCsv(v.warn_states), bad_states: jveFromCsv(v.bad_states), ok_states: jveFromCsv(v.ok_states), else: v.else || undefined,
          }),
        })], true));
      }
      return out;
    });
  }

  /* ---- colour or icon that can follow state ---- */
  styled(acc, title, leafSel, o = {}) {
    const detect = (v) => (v == null || v === '' ? 'default' : typeof v === 'string' ? (jveTpl(v) ? 'template' : 'fixed') : v.any || v.all ? 'cond' : v.entity !== undefined ? 'entity' : 'fixed');
    let mode = detect(acc.get());
    const modes = [{ value: 'default', label: o.defaultLabel || 'Default' }, { value: 'fixed', label: 'Fixed' }, { value: 'entity', label: 'Follows an entity\'s state' },
      { value: 'cond', label: 'If conditions match' }, { value: 'template', label: 'Template' }];
    return this.region((redraw) => {
      const mAcc = { get: () => ({ m: mode }), set: (v) => {
        if (v.m === mode) return;
        mode = v.m;
        acc.set(mode === 'entity' ? { entity: '', map: {} } : mode === 'cond' ? { any: [], then: '', else: '' } : mode === 'template' ? '{{ }}' : undefined);
        redraw();
      } };
      const out = [jveEl('div', 'h', title), this.form(mAcc, [{ name: 'm', label: 'Set by', selector: jveSel(modes) }], { to: (x) => x, from: (v) => v })];
      if (mode === 'fixed') out.push(this.form({ get: () => ({ v: acc.get() }), set: (x) => acc.set(x.v) }, [{ name: 'v', label: title, selector: leafSel }], { to: (x) => x, from: (v) => v }));
      if (mode === 'template') out.push(this.form({ get: () => ({ t: acc.get() }), set: (x) => acc.set(x.t) }, [{ name: 't', label: 'Template', selector: JVE_TPL }], { to: (x) => x, from: (v) => v }));
      if (mode === 'entity') {
        out.push(this.blk(null, [
          this.form(acc, [{ name: 'entity', selector: JVE_ENT }, { name: 'attribute', selector: { attribute: {} }, context: { filter_entity: 'entity' } }]),
          this.map(jveSub(acc, 'map'), { title: 'When the state is', valLabel: title, valSel: leafSel, skipDefault: true, add: 'Add state' }),
          this.form(jveSub(acc, 'map'), [{ name: '_default', label: 'Any other state', selector: leafSel }]),
        ], true));
      }
      if (mode === 'cond') {
        out.push(this.blk(null, [
          this.form(acc, [{ name: 'mode', label: 'Match', selector: jveSel([{ value: 'any', label: 'Any condition' }, { value: 'all', label: 'All conditions' }]) },
            { type: 'grid', name: '', schema: [{ name: 'then', label: 'When matched', selector: leafSel }, { name: 'else', label: 'Otherwise', selector: leafSel }] }], {
            to: (s) => ({ mode: s.all ? 'all' : 'any', then: s.then, else: s.else }),
            from: (v, s) => { const conds = s.any || s.all || []; const r = { ...s }; delete r.any; delete r.all; r[v.mode || 'any'] = conds; r.then = v.then; r.else = v.else; return jveStrip(r); },
          }),
          this.conditions({ get: () => { const s = acc.get() || {}; return s.all || s.any; }, set: (c) => { const s = { ...(acc.get() || {}) }; const k = s.all ? 'all' : 'any'; s[k] = c || []; acc.set(s); } }, `${title}-conds`),
        ], true));
      }
      return out;
    });
  }

  /* ---- chips ---- */
  chipValueAcc(ia) {
    const K = ['entity', 'attribute', 'decimals', 'unit', 'map'];
    return {
      get: () => { const c = ia.get() || {}; if (c.value !== undefined) return c.value; if (c.entity) { const r = {}; K.forEach((k) => { if (c[k] !== undefined) r[k] = c[k]; }); return r; } return undefined; },
      set: (v) => {
        const c = { ...(ia.get() || {}) };
        ['value', ...K].forEach((k) => delete c[k]);
        if (v && typeof v === 'object' && v.entity !== undefined && Object.keys(v).every((k) => K.includes(k))) Object.assign(c, v);
        else if (v !== undefined) c.value = v;
        ia.set(c);
      },
    };
  }

  chips(acc, id = 'chips', title = 'Chips') {
    return this.list(acc, {
      id, title, add: 'Add chip', empty: 'No chips.',
      newItem: () => ({ label: 'New', value: '' }),
      summary: (c) => `${(c && c.label) || 'Chip'} · ${jveSummary(this.chipValueAcc({ get: () => c }).get())}`,
      item: (ia) => [
        this.form(ia, [{ type: 'grid', name: '', schema: [{ name: 'label', selector: JVE_TEXT }, { name: 'icon', selector: JVE_ICON_SEL }] }, { name: 'hide_zero', selector: JVE_BOOL }]),
        this.value(this.chipValueAcc(ia), 'Value'),
        this.severity(jveSub(ia, 'severity')),
        this.blk('Show only when', [this.conditions({
          get: () => { const v = (ia.get() || {}).visible; return v == null ? undefined : [v]; },
          set: (a) => { const c = { ...(ia.get() || {}) }; if (a && a.length) c.visible = a[a.length - 1]; else delete c.visible; ia.set(c); },
        }, `${id}-vis`, [], { title: ' ', add: 'Add a condition', empty: 'Always shown.' })]),
        this.form(ia, [{ name: 'tap_action', selector: { ui_action: {} } }]),
      ],
    });
  }

  /* ---- shared sections ---- */
  appearance(o = {}) {
    const kids = [];
    if (o.staticAccent) kids.push(this.form(this.R, [{ name: 'accent', selector: JVE_COLOR_SEL }]));
    else kids.push(this.styled(jveSub(this.R, 'accent'), 'Accent colour', JVE_COLOR_SEL, { defaultLabel: o.accentDefault || 'Theme default' }));
    kids.push(this.form(this.R, [{ name: 'glow', label: 'Glow effects (default: theme setting)', selector: JVE_BOOL }]));
    return this.sec('Appearance', kids);
  }

  actions(keys = ['tap_action', 'hold_action', 'double_tap_action'], hint) {
    return this.sec('Interactions', [this.form(this.R, keys.map((k) => ({ name: k, selector: { ui_action: {} } }))), hint ? this.hint(hint) : null]);
  }
}

/* ------------------------------------------------------------------ */
/* Per-card layouts                                                   */
/* ------------------------------------------------------------------ */
const jveBoolDefaultTrue = (key) => ({
  to: (c) => ({ ...c, [key]: c[key] !== false }),
  from: (v, c) => { const r = { ...c }; for (const [k, x] of Object.entries(v)) { if (k === key) { if (x) delete r[k]; else r[k] = false; } else if (jveEmpty(x) && x !== false) delete r[k]; else r[k] = x; } return r; },
});

const JVE_LAYOUTS = {
  'jv-section-card': (E) => [
    E.sec('Heading', [E.form(E.R, [{ name: 'name', selector: JVE_TEXT }]), E.styled(jveSub(E.R, 'icon'), 'Icon', JVE_ICON_SEL, { defaultLabel: 'No icon' })], true),
    E.appearance(), E.actions(['tap_action']),
  ],

  'jv-tile-card': (E) => [
    E.sec('Entity', [
      E.form(E.R, [{ name: 'entity', selector: JVE_ENT }, { name: 'name', selector: JVE_TEXT }]),
      E.hint('Leave the entity empty to make an action button (set the tap action under Interactions).'),
      E.styled(jveSub(E.R, 'icon'), 'Icon', JVE_ICON_SEL, { defaultLabel: 'Entity icon' }),
    ], true),
    E.sec('Text', [
      E.form(E.R, [{ name: 'show_state', selector: JVE_BOOL }], jveBoolDefaultTrue('show_state')),
      E.value(jveSub(E.R, 'label'), 'Label line'),
      E.value(jveSub(E.R, 'state'), 'Replace the state line with'),
      E.map(jveSub(E.R, 'state_map'), { title: 'Rename states', valLabel: 'Shows' }),
      E.form(E.R, [{ name: 'active_states', selector: JVE_TEXT }], {
        to: (c) => ({ active_states: jveCsv(c.active_states) }), from: (v, c) => jveStrip({ ...c, active_states: jveFromCsv(v.active_states) }),
      }),
      E.hint('Active states light the tile up. Blank = on, open, playing, home, heating, cooling…'),
    ]),
    E.appearance(), E.actions(undefined, 'Defaults: tap toggles (or opens details), hold opens details.'),
  ],

  'jv-readout-card': (E) => [
    E.sec('Entity', [
      E.form(E.R, [{ name: 'entity', selector: JVE_ENT }, { name: 'attribute', selector: { attribute: {} }, context: { filter_entity: 'entity' } }, { name: 'name', selector: JVE_TEXT }]),
      E.styled(jveSub(E.R, 'icon'), 'Icon', JVE_ICON_SEL, { defaultLabel: 'Entity icon' }),
    ], true),
    E.sec('Value', [
      E.form(E.R, [
        { type: 'grid', name: '', schema: [{ name: 'unit', selector: JVE_TEXT }, { name: 'decimals', selector: { number: { mode: 'box', min: 0, max: 4 } } }] },
        { type: 'grid', name: '', schema: [{ name: 'relative', selector: JVE_BOOL }, { name: 'uppercase', selector: JVE_BOOL }] },
        { type: 'grid', name: '', schema: [{ name: 'wrap', selector: JVE_BOOL }, { name: 'font_size', selector: JVE_TEXT }] },
      ], jveBoolDefaultTrue('uppercase')),
      E.map(jveSub(E.R, 'state_map'), { title: 'Rename states', valLabel: 'Shows' }),
      E.value(jveSub(E.R, 'value'), 'Replace the value with'),
      E.value(jveSub(E.R, 'label'), 'Label line'),
    ]),
    E.sec('Severity', [E.severity(jveSub(E.R, 'severity'), 'Recolour the card by severity')]),
    E.appearance(), E.actions(['tap_action', 'hold_action']),
  ],

  'jv-chips-card': (E) => [
    E.sec('Chips', [E.chips(jveSub(E.R, 'chips'))], true),
    E.sec('Layout', [E.form(E.R, [{ name: 'layout', selector: jveSel([{ value: 'wrap', label: 'Wrap' }, { value: 'hud', label: 'Equal columns (HUD)' }]) }, { name: 'background', selector: JVE_BOOL }])]),
    E.appearance(),
  ],

  'jv-reactor-card': (E) => [
    E.sec('Header', [E.form(E.R, [
      { name: 'name', label: 'Title', selector: JVE_TEXT },
      { type: 'grid', name: '', schema: [{ name: 'greeting', selector: JVE_BOOL }, { name: 'clock', selector: JVE_BOOL }] },
      { name: 'greeting_name', selector: JVE_TEXT },
      { name: 'size', selector: { number: { mode: 'box', min: 40, max: 160, unit_of_measurement: 'px' } } },
    ])], true),
    E.sec('Status lines', [E.list(jveSub(E.R, 'lines'), {
      id: 'lines', add: 'Add line', empty: 'No extra lines.',
      newItem: () => 'New line',
      norm: (l) => (l && typeof l === 'object' && 'text' in l ? l : { text: l }),
      summary: (l) => jveSummary(l.text),
      item: (ia) => {
        const write = (o) => { const s = jveStrip(o); ia.set(Object.keys(s).length === 1 && 'text' in s ? s.text : s); };
        const objAcc = { get: () => ia.get(), set: write };
        return [
          E.value(jveSub(objAcc, 'text'), 'Text'),
          E.severity(jveSub(objAcc, 'severity'), 'Colour'),
          E.blk('Show only when', [E.conditions({
            get: () => { const v = objAcc.get().visible; return v == null ? undefined : [v]; },
            set: (a) => { const o = { ...objAcc.get() }; if (a && a.length) o.visible = a[a.length - 1]; else delete o.visible; write(o); },
          }, 'line-vis', [], { title: ' ', add: 'Add a condition', empty: 'Always shown.' })]),
        ];
      },
    })]),
    E.sec('Alerts', [
      E.hint('Shows the all-clear text, or the messages of any alerts that are active.'),
      E.conditions(jveSub(E.R, 'alerts'), 'alerts', [
        { type: 'grid', name: '', schema: [{ name: 'message', selector: JVE_TEXT }, { name: 'severity', selector: jveSel([{ value: 'warn', label: 'Warning' }, { value: 'bad', label: 'Alert' }]) }] },
      ], { title: 'Alert conditions', add: 'Add alert', empty: 'No alerts.', newExtra: { message: 'New alert' }, summary: (c) => (c && c.message) || jveCondSummary(c) }),
      E.form(E.R, [
        { name: 'ok_text', selector: JVE_TEXT },
        { type: 'grid', name: '', schema: [{ name: 'max_alerts', selector: { number: { mode: 'box', min: 1, max: 5 } } }, { name: 'alert_accent', selector: { select: { mode: 'dropdown', custom_value: true, options: [{ value: 'auto', label: 'Severity colour' }, { value: 'off', label: 'Keep accent' }, ...JVE_COLOR_SEL.select.options] } } }] },
      ], {
        to: (c) => ({ ...c, alert_accent: c.alert_accent === false ? 'off' : c.alert_accent == null || c.alert_accent === true ? 'auto' : c.alert_accent }),
        from: (v, c) => { const r = { ...c }; r.ok_text = v.ok_text || undefined; r.max_alerts = jveNum(v.max_alerts); r.alert_accent = v.alert_accent === 'off' ? false : v.alert_accent === 'auto' ? undefined : v.alert_accent; return Object.fromEntries(Object.entries(r).filter(([, x]) => x !== undefined)); },
      }),
    ]),
    E.sec('Chips', [E.chips(jveSub(E.R, 'chips')), E.form(E.R, [{ name: 'chips_layout', selector: jveSel([{ value: 'hud', label: 'Equal columns (HUD)' }, { value: 'wrap', label: 'Wrap' }]) }])]),
    E.appearance({ accentDefault: 'Theme default' }), E.actions(['tap_action', 'hold_action']),
  ],

  'jv-nav-card': (E) => [
    E.sec('Tile', [
      E.form(E.R, [{ name: 'name', selector: JVE_TEXT }, { name: 'navigation_path', selector: { navigation: {} } }]),
      E.styled(jveSub(E.R, 'icon'), 'Icon', JVE_ICON_SEL, { defaultLabel: 'No icon' }),
    ], true),
    E.sec('Headline stat', [E.value(jveSub(E.R, 'stat'), 'Stat')], true),
    E.sec('Subtitle', [E.value(jveSub(E.R, 'sub'), 'Subtitle')]),
    E.appearance(), E.actions(['tap_action', 'hold_action'], 'A tap action here overrides "Navigate to".'),
  ],

  'jv-person-card': (E) => [
    E.sec('Person', [E.form(E.R, [{ name: 'entity', selector: { entity: { domain: 'person' } } }, { name: 'name', selector: JVE_TEXT }])], true),
    E.sec('Telemetry sources', [E.form(E.R, [
      { name: 'battery', selector: { entity: { domain: 'sensor' } } }, { name: 'charging', selector: JVE_ENT },
      { name: 'location', selector: { entity: { domain: 'sensor' } } }, { name: 'address', selector: { entity: { domain: 'sensor' } } },
      { name: 'tracker', selector: { entity: { domain: 'device_tracker' } } }, { name: 'speed', selector: { entity: { domain: 'sensor' } } },
      { name: 'driving', selector: { entity: { domain: 'binary_sensor' } } }, { name: 'speed_unit', selector: JVE_TEXT },
    ])]),
    E.sec('Text', [
      E.form(E.R, [{ type: 'grid', name: '', schema: [{ name: 'home_text', selector: JVE_TEXT }, { name: 'away_text', selector: JVE_TEXT }] }, { name: 'lost_text', selector: JVE_TEXT }]),
      E.map(jveSub(E.R, 'state_map'), { title: 'Rename states (zones)', valLabel: 'Shows' }),
    ]),
    E.sec('Extra chips', [E.chips(jveSub(E.R, 'chips'))]),
    E.appearance({ accentDefault: 'Cyan home · amber away' }), E.actions(['tap_action', 'hold_action']),
  ],

  'jv-thermostat-card': (E) => [
    E.sec('Thermostat', [E.form(E.R, [
      { name: 'entity', selector: { entity: { domain: 'climate' } } }, { name: 'name', selector: JVE_TEXT },
      { type: 'grid', name: '', schema: [{ name: 'min', label: 'Gauge minimum', selector: JVE_NUM }, { name: 'max', label: 'Gauge maximum', selector: JVE_NUM }] },
      { name: 'controls', selector: JVE_BOOL },
    ], jveBoolDefaultTrue('controls'))], true),
    E.appearance({ accentDefault: 'Orange heating · cyan otherwise' }), E.actions(['tap_action', 'hold_action']),
  ],

  'jv-meter-card': (E) => {
    const isList = Array.isArray(E._config.entities);
    const modeForm = E.form({ get: () => ({ m: isList ? 'list' : 'single' }), set: (v) => {
      if ((v.m === 'list') === isList) return;
      const c = { ...E._config };
      if (v.m === 'list') { c.entities = c.entity ? [{ entity: c.entity, name: c.name, label: typeof c.label === 'string' ? c.label : undefined }].map(jveStrip) : []; ['entity', 'name', 'label', 'icon', 'battery', 'temperature', 'chips', 'unit'].forEach((k) => delete c[k]); }
      else { const first = (c.entities || [])[0]; c.entity = (first && (first.entity || first)) || ''; delete c.entities; delete c.sort; delete c.limit; }
      E._config = c; E._emit(); E._build();
    } }, [{ name: 'm', label: 'Show', selector: jveSel([{ value: 'single', label: 'One meter' }, { value: 'list', label: 'Ranked list of several' }]) }], { to: (x) => x, from: (v) => v });
    const thresholds = E.sec('Thresholds', [
      E.form(E.R, [{ name: 'preset', selector: jveSel([{ value: 'moisture', label: 'Soil moisture' }, { value: 'battery', label: 'Battery' }, { value: 'generic', label: 'Generic' }]) },
        { name: 'direction', selector: jveSel([{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }]) },
        { type: 'grid', name: '', schema: [{ name: 'min', label: 'Bar minimum', selector: JVE_NUM }, { name: 'max', label: 'Bar maximum', selector: JVE_NUM }] }]),
      E.form(jveSub(E.R, 'thresholds'), [{ type: 'grid', name: '', schema: [{ name: 'bad', selector: JVE_NUM }, { name: 'warn', selector: JVE_NUM }, { name: 'high', selector: JVE_NUM }] }]),
      E.hint('Leave a threshold blank to use the preset.'),
      E.blk('Status text', [E.form(jveSub(E.R, 'labels'), [{ type: 'grid', name: '', schema: [{ name: 'bad', selector: JVE_TEXT }, { name: 'warn', selector: JVE_TEXT }] }, { type: 'grid', name: '', schema: [{ name: 'high', selector: JVE_TEXT }, { name: 'ok', selector: JVE_TEXT }] }, { name: 'offline', selector: JVE_TEXT }])]),
    ]);
    if (isList) {
      return [
        E.sec('Entities', [modeForm,
          E.list(jveSub(E.R, 'entities'), {
            id: 'mentities', add: 'Add entity', newItem: () => ({ entity: '' }), norm: (e) => (typeof e === 'string' ? { entity: e } : e || {}),
            summary: (e) => `${e.name || e.entity || 'Entity'}${e.label ? ` · ${e.label}` : ''}`,
            item: (ia) => [E.form(ia, [{ name: 'entity', selector: JVE_ENT }, { type: 'grid', name: '', schema: [{ name: 'name', selector: JVE_TEXT }, { name: 'label', label: 'Room / label', selector: JVE_TEXT }] }])],
          }),
          E.form(E.R, [{ type: 'grid', name: '', schema: [{ name: 'sort', selector: jveSel([{ value: 'asc', label: 'Lowest first' }, { value: 'desc', label: 'Highest first' }, { value: 'none', label: 'As listed' }]) }, { name: 'limit', selector: { number: { mode: 'box', min: 1 } } }] }]),
        ], true),
        thresholds, E.appearance({ accentDefault: 'Green' }),
      ];
    }
    return [
      E.sec('Meter', [modeForm,
        E.form(E.R, [{ name: 'entity', selector: JVE_ENT }, { name: 'name', selector: JVE_TEXT }, { type: 'grid', name: '', schema: [{ name: 'icon', selector: JVE_ICON_SEL }, { name: 'unit', selector: JVE_TEXT }] },
          { type: 'grid', name: '', schema: [{ name: 'battery', selector: { entity: { domain: 'sensor' } } }, { name: 'temperature', selector: { entity: { domain: 'sensor' } } }] }]),
        E.value(jveSub(E.R, 'label'), 'Label line'),
      ], true),
      thresholds,
      E.sec('Extra chips', [E.chips(jveSub(E.R, 'chips'))]),
      E.appearance({ accentDefault: 'Green when normal' }), E.actions(['tap_action', 'hold_action']),
    ];
  },

  'jv-zigbee-card': (E) => [
    E.sec('Zigbee', [E.form(E.R, [
      { type: 'grid', name: '', schema: [{ name: 'mode', selector: jveSel([{ value: 'summary', label: 'Summary' }, { value: 'maintenance', label: 'Maintenance orders' }, { value: 'offline', label: 'Offline nodes' }, { value: 'batteries', label: 'Battery fleet' }, { value: 'roster', label: 'Device roster' }]) },
        { name: 'integration', selector: jveSel([{ value: 'zha', label: 'ZHA' }, { value: 'mqtt', label: 'Zigbee2MQTT' }]) }] },
      { type: 'grid', name: '', schema: [{ name: 'battery_low', selector: { number: { mode: 'box', min: 1, max: 100 } } }, { name: 'battery_critical', selector: { number: { mode: 'box', min: 1, max: 100 } } }] },
      { type: 'grid', name: '', schema: [{ name: 'lqi_weak', selector: { number: { mode: 'box', min: 0, max: 255 } } }, { name: 'quiet_hours', selector: { number: { mode: 'box', min: 1 } } }] },
      { name: 'limit', label: 'Show at most (maintenance)', selector: { number: { mode: 'box', min: 1 } } },
      { name: 'exclude_areas', selector: JVE_TEXT }, { name: 'exclude_devices', selector: JVE_TEXT },
    ], {
      to: (c) => ({ ...c, exclude_areas: jveCsv(c.exclude_areas), exclude_devices: jveCsv(c.exclude_devices) }),
      from: (v, c) => {
        const r = { ...c };
        for (const k of ['mode', 'integration', 'battery_low', 'battery_critical', 'lqi_weak', 'quiet_hours', 'limit']) { if (jveEmpty(v[k])) delete r[k]; else r[k] = v[k]; }
        for (const k of ['exclude_areas', 'exclude_devices']) { const a = jveFromCsv(v[k]); if (a) r[k] = a; else delete r[k]; }
        return r;
      },
    })], true),
    E.appearance(),
  ],

  'jv-timeline-card': (E) => {
    const rowType = (r) => (r.type === 'multi' ? 'multi' : r.type === 'line' ? 'line' : r.attribute !== undefined ? 'attribute' : 'state');
    const rowTitle = (r) => {
      const t = rowType(r);
      const n = r.name || r.entity || 'Row';
      return t === 'multi' ? `${n} · ${(r.series || []).length} lines` : t === 'line' ? `${n} · line` : t === 'attribute' ? `${n} · ${r.attribute || 'attribute'}` : `${n} · states`;
    };
    return [
      E.sec('Timeline', [E.form(E.R, [
        { type: 'grid', name: '', schema: [{ name: 'title', selector: JVE_TEXT }, { name: 'hours', selector: { number: { mode: 'box', min: 1, max: 336 } } }] },
        { type: 'grid', name: '', schema: [{ name: 'tick_hours', selector: { number: { mode: 'box', min: 1 } } }, { name: 'label_width', selector: { number: { mode: 'box', min: 30, max: 200 } } }] },
      ])], true),
      E.sec('Rows', [E.list(jveSub(E.R, 'entities'), {
        id: 'trows', add: 'Add row', empty: 'No rows.', newItem: () => ({ entity: '' }),
        norm: (r) => (typeof r === 'string' ? { entity: r } : r || {}),
        summary: rowTitle,
        item: (ia) => [E.region((redraw) => {
          const r = ia.get();
          const t = rowType(r);
          const tAcc = { get: () => ({ t }), set: (v) => {
            if (v.t === t) return;
            const cur = ia.get();
            const base = jveStrip({ entity: cur.entity, name: cur.name });
            ia.set(v.t === 'multi' ? { type: 'multi', name: cur.name || 'Series', series: cur.entity ? [{ entity: cur.entity }] : [] } : v.t === 'line' ? { ...base, type: 'line' } : v.t === 'attribute' ? { ...base, attribute: '' } : base);
            redraw();
          } };
          const out = [E.form(tAcc, [{ name: 't', label: 'Row type', selector: jveSel([{ value: 'state', label: 'State band' }, { value: 'attribute', label: 'Attribute band' }, { value: 'line', label: 'Line graph' }, { value: 'multi', label: 'Multi-line graph' }]) }], { to: (x) => x, from: (v) => v })];
          if (t === 'multi') {
            out.push(E.form(ia, [{ name: 'name', selector: JVE_TEXT }, { type: 'grid', name: '', schema: [{ name: 'height', selector: { number: { mode: 'box', min: 30, max: 400 } } }, { name: 'unit', label: 'Unit (default °)', selector: JVE_TEXT }] }]));
            out.push(E.list(jveSub(ia, 'series'), {
              id: 'tseries', title: 'Lines', add: 'Add line', newItem: () => ({ entity: '' }), summary: (s) => (s && (s.name || s.entity)) || 'Line',
              item: (sa) => [E.form(sa, [{ name: 'entity', selector: JVE_ENT }, { type: 'grid', name: '', schema: [{ name: 'name', selector: JVE_TEXT }, { name: 'color', selector: JVE_COLOR_SEL }] },
                { type: 'grid', name: '', schema: [{ name: 'width', selector: { number: { mode: 'box', min: 0.5, max: 6, step: 0.1 } } }, { name: 'dash', selector: JVE_TEXT }] }])],
            }));
          } else if (t === 'line') {
            out.push(E.form(ia, [{ name: 'entity', selector: JVE_ENT }, { type: 'grid', name: '', schema: [{ name: 'name', selector: JVE_TEXT }, { name: 'color', selector: JVE_COLOR_SEL }] }]));
          } else {
            const sch = [{ name: 'entity', selector: JVE_ENT }];
            if (t === 'attribute') sch.push({ name: 'attribute', selector: { attribute: {} }, context: { filter_entity: 'entity' } });
            sch.push({ name: 'name', selector: JVE_TEXT }, { name: 'duty', selector: JVE_TEXT });
            out.push(E.form(ia, sch, {
              to: (x) => ({ ...x, duty: jveCsv(x.duty) }),
              from: (v, x) => { const n = { ...x }; for (const k of jveNames(sch)) { const val = k === 'duty' ? jveFromCsv(v.duty) : v[k]; if (jveEmpty(val) && !(k === 'attribute' && t === 'attribute')) delete n[k]; else n[k] = val ?? ''; } return n; },
            }));
            out.push(E.map(jveSub(ia, 'colors'), { title: 'State colours', valLabel: 'Colour', valSel: JVE_COLOR_SEL, help: 'Use _other for any state not listed.' }));
            out.push(E.map(jveSub(ia, 'labels'), { title: 'State labels', valLabel: 'Label' }));
          }
          return out;
        })],
      })], true),
      E.sec('Legend', [E.list(jveSub(E.R, 'legend'), {
        id: 'legend', add: 'Add legend entry', empty: 'Automatic (Home / Away for people, otherwise none).', newItem: () => ({ label: 'Label', color: 'cyan' }),
        summary: (l) => `${(l && l.label) || 'Entry'} · ${(l && l.color) || ''}`,
        item: (ia) => [E.form(ia, [{ type: 'grid', name: '', schema: [{ name: 'label', selector: JVE_TEXT }, { name: 'color', selector: JVE_COLOR_SEL }] }])],
      })]),
      E.appearance({ staticAccent: true }),
    ];
  },
};

/* ------------------------------------------------------------------ */
/* register the editor and attach it to every card                    */
/* ------------------------------------------------------------------ */
if (!customElements.get('jv-hud-editor')) customElements.define('jv-hud-editor', JvHudEditor);
for (const tag of JVE_TAGS) {
  customElements.whenDefined(tag).then(() => {
    const C = customElements.get(tag);
    C.getConfigElement = () => document.createElement('jv-hud-editor');
  });
}

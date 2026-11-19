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

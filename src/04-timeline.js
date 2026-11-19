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

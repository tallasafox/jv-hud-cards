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

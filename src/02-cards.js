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

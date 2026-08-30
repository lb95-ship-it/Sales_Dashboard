/* ===========================================================================
   Territory Hub — shell.js
   Cross-page shell only: navigation, active-page state, page init, and the
   zone dial (shared between Home and Route Planning).

   Deliberately NOT in here: anything a single tool owns. Parsing, drag and
   drop, date math and storage for a given tool stay in that tool's own page
   script. The only shared state between pages is the `th_*` localStorage
   keys, and those are read/written through assets/js/data-store.js (Phase 2),
   not through this file.

   Usage — every page ends with:
       <script src="assets/js/shell.js"></script>
   and sets  <body data-page="home">  to tell the nav which tab is current.
   =========================================================================== */
(function (window, document) {
  'use strict';

  /* -------------------------------------------------------------------------
     Navigation model — the single source of truth for every destination.
     Adding a pillar page means adding one entry here, not editing five files.

     Order is the user's, set 2026-08-29, and it is not alphabetical or
     conventional: Home sits in the MIDDLE rather than at the left edge, under
     the thumb on a phone, with the planning pages to its left and the reporting
     pages to its right. index.html is still the landing page — where the tab
     sits in the bar says nothing about that. Do not "fix" this back to
     Home-first.
     ------------------------------------------------------------------------- */
  var PAGES = [
    { id: 'strategy', href: 'strategy.html',       label: 'Strategy', icon: 'target' },
    { id: 'route',    href: 'route-planning.html', label: 'Route',    icon: 'pin' },
    /* Key Accounts is its own destination rather than a Sales sub-tab: the
       worksheets are a standing record of an account, not a monthly report,
       and they have nothing to do with the bonus period Sales is scoped to. */
    { id: 'keyaccts', href: 'key-accounts.html',   label: 'Accounts', icon: 'star' },
    { id: 'home',     href: 'index.html',          label: 'Home',     icon: 'home' },
    { id: 'sales',    href: 'sales.html',          label: 'Sales',    icon: 'chart' },
    { id: 'rx',       href: 'prescriptions.html',  label: 'Rx',       icon: 'rx' },
    /* The label is short because the bottom bar splits its width evenly
       between however many entries are in this list — "Performance" does not
       fit on a phone alongside six others, "Perf" does. The page itself is
       titled in full. Same reason "Key Accounts" is "Accounts" above. */
    { id: 'perf',     href: 'performance.html',    label: 'Perf',     icon: 'gauge' }
  ];

  /* -------------------------------------------------------------------------
     The six routes of the rotation — the single source of truth for their
     names, week numbers and colours. Colours mirror the --zone-* tokens in
     shell.css; they are repeated here because JS needs the value to set an
     inline `--zone`, and a token name alone will not resolve in that context.

     `aliases` exists because the same route is spelled differently by the
     tools that predate this list: Route Board's account book says
     "Waco/East Austin", Schedule Builder says "East Austin/ Waco". zoneByName()
     resolves any of them so a route assignment survives whichever spelling an
     import happens to carry.
     ------------------------------------------------------------------------- */
  var ZONES = [
    { id: 'waco', week: 1, name: 'Waco/East Austin',      color: '#17805A', label: 'green',
      aliases: ['east austin/ waco', 'east austin/waco', 'waco/ east austin',
                'north i-35 waco', 'waco', 'east austin'] },
    { id: 'nwa',  week: 2, name: 'North West Austin',     color: '#C4365F', label: 'reddish pink',
      aliases: ['northwest austin', 'nw austin'] },
    { id: 'hill', week: 3, name: 'Hill Country',          color: '#6E4FC9', label: 'purple',
      aliases: [] },
    { id: 'nca',  week: 4, name: 'North Central Austin',  color: '#2F6FD0', label: 'blue',
      aliases: ['n central austin'] },
    { id: 'sca',  week: 5, name: 'South Central Austin',  color: '#8A6D00', label: 'yellow',
      aliases: ['s central austin', 'southcentral austin'] },
    { id: 'swa',  week: 6, name: 'South West Austin',     color: '#B4531F', label: 'orange',
      aliases: ['southwest austin', 'sw austin'] }
  ];

  function zoneById(id) {
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].id === id) return ZONES[i];
    return null;
  }

  /* The dial draws one segment per week of the rotation, so it needs the zone
     for a week number rather than an id or a name. Returns null past week 6 —
     a dial asked for more weeks than there are zones falls back to teal. */
  function zoneByWeek(week) {
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].week === week) return ZONES[i];
    return null;
  }

  /* Matches on the canonical name or any known alias, case- and
     punctuation-insensitive. Returns null rather than guessing. */
  function zoneByName(name) {
    if (!name) return null;
    var norm = String(name).toLowerCase().replace(/\s+/g, ' ').trim();
    for (var i = 0; i < ZONES.length; i++) {
      if (ZONES[i].name.toLowerCase() === norm) return ZONES[i];
      for (var a = 0; a < ZONES[i].aliases.length; a++) {
        if (ZONES[i].aliases[a] === norm) return ZONES[i];
      }
    }
    return null;
  }

  /* Icon geometry, 24x24 viewBox. Stroke colour and width come from CSS so a
     single `.nav a` rule controls every icon's appearance. */
  var ICONS = {
    home:   '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5.5h-6V20H5a1 1 0 0 1-1-1z"/>',
    pin:    '<path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21z"/>' +
            '<circle cx="12" cy="10.4" r="2.4"/>',
    chart:  '<path d="M4 20V4"/><path d="M4 20h16"/>' +
            '<path d="M8.5 20v-6"/><path d="M13 20V8.5"/><path d="M17.5 20v-9"/>',
    rx:     '<path d="M7 20V6h3.6a3.2 3.2 0 0 1 0 6.4H7"/>' +
            '<path d="M10.6 12.4 17 20"/><path d="M13 14.5 17.5 10"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6"/>' +
            '<circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none"/>',
    gauge:  '<path d="M4 16.5a8 8 0 0 1 16 0"/><path d="M12 16.5 16.4 11.9"/>' +
            '<circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none"/>',
    star:   '<path d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 17l-5.25 2.75 1-5.85' +
            'L3.5 9.75l5.9-.85z"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
           (ICONS[name] || '') + '</svg>';
  }

  /* -------------------------------------------------------------------------
     Nav rendering + active-page state
     ------------------------------------------------------------------------- */
  function navMarkup(activeId) {
    var html = '<div class="nav-brand">Territory Hub<small>Field dashboard</small></div>';
    for (var i = 0; i < PAGES.length; i++) {
      var p = PAGES[i];
      var current = p.id === activeId ? ' aria-current="page"' : '';
      html += '<a href="' + p.href + '" data-page-id="' + p.id + '"' + current + '>' +
                icon(p.icon) +
                '<span>' + p.label + '</span>' +
              '</a>';
    }
    return html;
  }

  /* Mounts into an existing <nav class="nav"> if the page provides one,
     otherwise appends its own. Pages do not need to carry nav markup. */
  function mountNav(activeId) {
    var nav = document.querySelector('nav.nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'nav';
      document.body.appendChild(nav);
    }
    nav.setAttribute('aria-label', 'Primary');
    nav.innerHTML = navMarkup(activeId);
    return nav;
  }

  /* -------------------------------------------------------------------------
     Zone dial — the signature element.

     Six segments of a ring, one per week of the territory rotation. Weeks
     already completed in the current cycle read as a mid tone, the current
     week is filled, upcoming weeks stay dim. Geometry is drawn in a 0-100
     viewBox and scaled by --dial-size, so one renderer serves both the
     compact Home instance and the full-size Route Planning one.

       Shell.zoneDial(el, { week: 3, zones: [...], totalWeeks: 6 })

     `week` is 1-based. `zones` is optional; when supplied it labels the
     caption with the zone name for the current week.
     ------------------------------------------------------------------------- */
  var DIAL = { cx: 50, cy: 50, rOuter: 46, rInner: 32.5, gapDeg: 3.2 };

  function polar(cx, cy, r, deg) {
    var rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function ringSegment(startDeg, endDeg) {
    var d = DIAL;
    var o1 = polar(d.cx, d.cy, d.rOuter, startDeg);
    var o2 = polar(d.cx, d.cy, d.rOuter, endDeg);
    var i2 = polar(d.cx, d.cy, d.rInner, endDeg);
    var i1 = polar(d.cx, d.cy, d.rInner, startDeg);
    var large = (endDeg - startDeg) > 180 ? 1 : 0;
    return 'M' + o1.x.toFixed(2) + ' ' + o1.y.toFixed(2) +
           'A' + d.rOuter + ' ' + d.rOuter + ' 0 ' + large + ' 1 ' + o2.x.toFixed(2) + ' ' + o2.y.toFixed(2) +
           'L' + i2.x.toFixed(2) + ' ' + i2.y.toFixed(2) +
           'A' + d.rInner + ' ' + d.rInner + ' 0 ' + large + ' 0 ' + i1.x.toFixed(2) + ' ' + i1.y.toFixed(2) +
           'Z';
  }

  function zoneDial(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var total = opts.totalWeeks || 6;
    var week = Math.min(Math.max(parseInt(opts.week, 10) || 1, 1), total);
    var step = 360 / total;
    var gap = DIAL.gapDeg;

    var svg = '<svg viewBox="0 0 100 100" role="img" aria-label="Week ' + week +
              ' of ' + total + ' in the territory rotation">';
    for (var i = 0; i < total; i++) {
      var state = (i + 1) === week ? ' is-active' : ((i + 1) < week ? ' is-done' : '');
      var start = i * step + gap / 2;
      var end = (i + 1) * step - gap / 2;
      var mid = polar(DIAL.cx, DIAL.cy, (DIAL.rOuter + DIAL.rInner) / 2, (start + end) / 2);
      /* Each segment carries its own territory colour. Done / active /
         upcoming are opacity steps in shell.css, not different hues, so a
         week keeps the same colour it has on every swatch and chip in the
         app whatever its state. */
      var zone = zoneByWeek(i + 1);
      var segStyle = zone ? ' style="--seg:' + zone.color + '"' : '';
      /* seg and its number are adjacent siblings — shell.css relies on that
         to flip the active segment's label to white. */
      svg += '<path class="seg' + state + '"' + segStyle + ' d="' + ringSegment(start, end) + '"/>' +
             '<text class="seg-num" x="' + mid.x.toFixed(2) + '" y="' + mid.y.toFixed(2) + '">' +
             (i + 1) + '</text>';
    }
    svg += '</svg>';

    el.classList.add('dial');
    el.innerHTML = svg +
      '<div class="dial-center" aria-hidden="true">' +
        '<span class="dial-week">' + week + '</span>' +
        '<span class="dial-of">of ' + total + '</span>' +
      '</div>';

    if (opts.zones && opts.zones[week - 1]) {
      el.setAttribute('data-zone', opts.zones[week - 1]);
    }
    return el;
  }

  /* -------------------------------------------------------------------------
     Sub-tabs — switches panels inside one pillar page.

     Markup contract:
        <div class="subtabs" role="tablist" data-tabs>
          <button role="tab" data-panel="board">Route Board</button>
          <button role="tab" data-panel="builder">Schedule Builder</button>
        </div>
        <div class="tabpanel" data-panel="board" role="tabpanel">…</div>
        <div class="tabpanel" data-panel="builder" role="tabpanel">…</div>

     The chosen panel is remembered per page in sessionStorage, so switching
     to another pillar and coming back does not dump you on the first tab.
     Not localStorage — a tab choice is not data worth persisting across days,
     and the `th_*` namespace is reserved for things that are.

     Fires `th:tab` on the tablist when the panel changes. Route Board needs
     this in Phase 3: a component mounted inside a hidden panel measures its
     container as zero, so it has to be told when it becomes visible.
     ------------------------------------------------------------------------- */
  function tabs(root) {
    var list = root || document.querySelector('[data-tabs]');
    if (!list) return null;

    var buttons = list.querySelectorAll('[data-panel]');
    var memoryKey = 'th_tab:' + (document.body.getAttribute('data-page') || 'page');

    function select(name, remember) {
      var chosen = null;
      for (var i = 0; i < buttons.length; i++) {
        var on = buttons[i].getAttribute('data-panel') === name;
        buttons[i].setAttribute('aria-selected', on ? 'true' : 'false');
        buttons[i].setAttribute('tabindex', on ? '0' : '-1');
        if (on) chosen = buttons[i];
      }
      var panels = document.querySelectorAll('.tabpanel[data-panel]');
      for (var j = 0; j < panels.length; j++) {
        panels[j].hidden = panels[j].getAttribute('data-panel') !== name;
      }
      if (remember) {
        try { window.sessionStorage.setItem(memoryKey, name); } catch (e) {}
      }
      try {
        list.dispatchEvent(new CustomEvent('th:tab', { detail: { panel: name } }));
      } catch (e) {}
      return chosen;
    }

    for (var k = 0; k < buttons.length; k++) {
      (function (btn) {
        btn.setAttribute('role', 'tab');
        btn.addEventListener('click', function () {
          select(btn.getAttribute('data-panel'), true);
        });
      })(buttons[k]);
    }

    /* Left/right arrows move between tabs, per the ARIA tabs pattern. */
    list.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var order = Array.prototype.slice.call(buttons);
      var at = order.indexOf(document.activeElement);
      if (at === -1) return;
      e.preventDefault();
      var next = order[(at + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
      select(next.getAttribute('data-panel'), true);
      next.focus();
    });

    var remembered = null;
    try { remembered = window.sessionStorage.getItem(memoryKey); } catch (e) {}
    var initial = list.getAttribute('data-default') ||
                  (buttons[0] && buttons[0].getAttribute('data-panel'));
    var valid = false;
    for (var m = 0; m < buttons.length; m++) {
      if (buttons[m].getAttribute('data-panel') === remembered) valid = true;
    }
    select(valid ? remembered : initial, false);

    return { select: select, list: list };
  }

  /* -------------------------------------------------------------------------
     Small shared helpers. Kept minimal on purpose — this is not a utility
     library, and tool-specific helpers belong in the tool's own script.
     ------------------------------------------------------------------------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /* -------------------------------------------------------------------------
     Page init — auto-runs. Reads <body data-page="..."> for the active tab.
     ------------------------------------------------------------------------- */
  function init() {
    var activeId = document.body.getAttribute('data-page') || '';
    mountNav(activeId);

    /* Any element marked data-dial renders one, configured by data attributes,
       so a static page needs no inline script just to draw its dial. */
    var dials = document.querySelectorAll('[data-dial]');
    for (var i = 0; i < dials.length; i++) {
      zoneDial(dials[i], {
        week: dials[i].getAttribute('data-week'),
        totalWeeks: parseInt(dials[i].getAttribute('data-total'), 10) || 6
      });
    }

    /* Any page carrying a [data-tabs] list gets sub-tabs wired automatically. */
    if (document.querySelector('[data-tabs]')) tabs();
  }

  window.Shell = {
    PAGES: PAGES,
    ZONES: ZONES,
    zoneById: zoneById,
    zoneByName: zoneByName,
    icon: icon,
    mountNav: mountNav,
    zoneDial: zoneDial,
    tabs: tabs,
    escapeHtml: escapeHtml,
    ready: ready
  };

  ready(init);

})(window, document);

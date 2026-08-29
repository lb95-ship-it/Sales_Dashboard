/* ===========================================================================
   Territory Hub — data-store.js
   The `th_*` localStorage layer. This is the ONLY sanctioned channel of shared
   state between pillar pages; there is no shared global JS state.

   Two rules this file exists to enforce:

   1. Home only ever reads SUMMARIES. Each pillar writes a small summary object
      after any update, and Home renders from that. Home never re-parses raw
      tool data — that is what keeps it a live overview instead of a mockup you
      have to remember to update.

   2. Route Board's three keys (`th_route.book.v2`, `.annotations.v2`,
      `.week.v2`) are managed entirely inside route-board.js, in its own dot
      naming. Nothing here writes them. The single read accessor below exists
      because Home renders day counts straight off `th_route.week.v2` rather
      than asking Route Board for a summary — see §5 of the plan.

   Known limitation, by design: localStorage is per-browser, per-device. Phone
   and laptop do not sync. Cross-device sync would need a real backend and is
   explicitly out of scope.
   =========================================================================== */
(function (window) {
  'use strict';

  /* -------------------------------------------------------------------------
     Key registry — one place to look up what exists and who owns it.
     ------------------------------------------------------------------------- */
  var KEYS = {
    scheduleSummary:  'th_schedule_summary',      // Route Planning -> Home
    scheduleAnchor:   'th_schedule_anchor',       // Route Planning (internal)
    scheduleRoutes:   'th_schedule_routes_',      // prefix + ISO Monday
    bonusSummary:     'th_bonus_summary',         // Sales -> Home
    bonusLastUpload:  'th_bonus_lastUpload',      // Sales (internal)
    keyAcctBook:      'th_keyaccts_book',         // Sales / Key Accounts (internal)
    keyAcctSummary:   'th_keyaccts_summary',      // Sales / Key Accounts -> Home
    prescriberRoster: 'th_prescribers_roster',    // Prescriptions (internal)
    prescriberFollow: 'th_prescribers_followups', // Prescriptions (internal)
    prescriberSummary:'th_prescribers_summary',   // Prescriptions -> Home
    perfEvals:        'th_performance_evals',     // Performance (internal)
    perfSummary:      'th_performance_summary',   // Performance -> Home
    routeBoardWeek:   'th_route.week.v2'          // Route Board (READ ONLY here)
  };

  /* -------------------------------------------------------------------------
     Availability. Safari private mode and locked-down browsers throw on
     setItem rather than failing quietly, so probe once and degrade to a
     session-lifetime memory map instead of letting a tool blow up mid-edit.
     ------------------------------------------------------------------------- */
  var memory = {};
  var available = (function () {
    try {
      var probe = '__th_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function rawGet(key) {
    if (!available) return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function rawSet(key, str) {
    if (!available) { memory[key] = str; return true; }
    try {
      window.localStorage.setItem(key, str);
      return true;
    } catch (e) {
      /* Quota exceeded is the realistic failure here — the account book is
         large. Fall back to memory so the current session keeps working, and
         let the caller decide whether to surface it. */
      memory[key] = str;
      console.warn('[data-store] write failed for ' + key + ', kept in memory only:', e);
      return false;
    }
  }

  /* -------------------------------------------------------------------------
     Typed read/write. A corrupt or hand-edited value must not take a page
     down, so a failed parse returns the fallback and the bad value is left in
     place for inspection rather than silently deleted.
     ------------------------------------------------------------------------- */
  function get(key, fallback) {
    var raw = rawGet(key);
    if (raw === null || raw === undefined) return fallback === undefined ? null : fallback;
    try {
      var parsed = JSON.parse(raw);
      return parsed === null ? (fallback === undefined ? null : fallback) : parsed;
    } catch (e) {
      console.warn('[data-store] unparseable value at ' + key + ', using fallback');
      return fallback === undefined ? null : fallback;
    }
  }

  function set(key, value) {
    if (value === undefined || value === null) return remove(key);
    var ok = rawSet(key, JSON.stringify(value));
    emit(key, value);
    return ok;
  }

  function remove(key) {
    delete memory[key];
    if (available) { try { window.localStorage.removeItem(key); } catch (e) {} }
    emit(key, null);
    return true;
  }

  /* Same-tab change notification. The native `storage` event only fires in
     OTHER tabs, which is exactly backwards for "Home refreshes after Sales
     writes a summary in the same tab" — so pages listen here instead. */
  function emit(key, value) {
    try {
      window.dispatchEvent(new CustomEvent('th:store', { detail: { key: key, value: value } }));
    } catch (e) { /* CustomEvent unsupported — nothing to do */ }
  }

  function onChange(handler) {
    window.addEventListener('th:store', function (e) { handler(e.detail.key, e.detail.value); });
    /* Cross-tab: mirror real localStorage events into the same handler. */
    window.addEventListener('storage', function (e) {
      if (e.key && e.key.indexOf('th_') === 0) handler(e.key, get(e.key));
    });
  }

  /* -------------------------------------------------------------------------
     Date helper — the schedule keys are indexed by the ISO Monday of a week,
     so both the writer (Route Planning) and any reader must agree on how that
     Monday is derived. Defining it once here is the point.
     ------------------------------------------------------------------------- */
  function isoMonday(date) {
    var d = new Date(date || Date.now());
    d.setHours(0, 0, 0, 0);
    var dow = d.getDay();              // 0 Sun .. 6 Sat
    var delta = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + delta);
    /* Local-date ISO, not toISOString() — that shifts to UTC and can land on
       the previous Sunday for anyone west of Greenwich. */
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  /* -------------------------------------------------------------------------
     Per-pillar accessors. Shapes are fixed by §5 of the plan; Home depends on
     them, so change them in both places or not at all.
     ------------------------------------------------------------------------- */
  var schedule = {
    /* { weekNum, zone, followup, dateRange, days }

       `days` is the five Mon-Fri route notes for the CURRENT week. It rides
       along in the summary so Home can show today's route without reading
       th_schedule_routes_* directly — Home reads summaries, and adding a
       second raw-data exception for this would erode the rule that keeps it
       a real overview. */
    readSummary: function () { return get(KEYS.scheduleSummary, null); },
    writeSummary: function (s) {
      return set(KEYS.scheduleSummary, {
        weekNum:   s.weekNum,
        zone:      s.zone,
        followup:  s.followup,
        dateRange: s.dateRange,
        days:      Array.isArray(s.days) ? s.days : [],
        updatedAt: new Date().toISOString()
      });
    },

    /* ISO date string marking week 1 of the current 6-week cycle. */
    readAnchor:  function () { return get(KEYS.scheduleAnchor, null); },
    writeAnchor: function (isoDate) { return set(KEYS.scheduleAnchor, isoDate); },

    /* Array of 5 strings, Mon-Fri, for the week beginning `mondayIso`. */
    readRoutes:  function (mondayIso) { return get(KEYS.scheduleRoutes + mondayIso, null); },
    writeRoutes: function (mondayIso, days) { return set(KEYS.scheduleRoutes + mondayIso, days); }
  };

  var bonus = {
    /* { growthPct, bonusEarned, bonusPossible, onTrack, reportDate } */
    readSummary: function () { return get(KEYS.bonusSummary, null); },
    writeSummary: function (s) {
      return set(KEYS.bonusSummary, {
        growthPct:     s.growthPct,
        bonusEarned:   s.bonusEarned,
        bonusPossible: s.bonusPossible,
        onTrack:       !!s.onTrack,
        reportDate:    s.reportDate,
        updatedAt:     new Date().toISOString()
      });
    },
    readLastUpload:  function () { return get(KEYS.bonusLastUpload, null); },
    writeLastUpload: function (report) { return set(KEYS.bonusLastUpload, report); }
  };

  /* -------------------------------------------------------------------------
     Key Accounts. One imported Key Account Worksheet per account:

       { generated, accounts: [{ id, file, importedAt, sections… }] }

     Same class of data as the account book and the prescriber roster — real
     clinic names, doctor names, contract pricing and sales figures. Device
     local, never committed, never exported unless explicitly asked for.

     The book is wholly replaced on every write, not merged. Nothing here is
     typed by hand — every field comes from a worksheet — so unlike the
     prescriber roster there is no second half to protect from a re-import.
     ------------------------------------------------------------------------- */
  var keyAccounts = {
    readBook:  function () { return get(KEYS.keyAcctBook, null); },
    writeBook: function (book) {
      return set(KEYS.keyAcctBook, {
        generated: new Date().toISOString(),
        accounts:  Array.isArray(book && book.accounts) ? book.accounts : []
      });
    },

    /* { total, atRisk, watch, openSteps, attention[], updatedAt }

       `updatedAt` is passed in rather than stamped here, and it is the moment
       the WORKSHEETS were imported, not the moment this line was written. Home
       ages every card off updatedAt, so stamping it at write time would let a
       summary rebuilt on page load report six-week-old worksheets as checked
       today — the same trap the Bonus Tracker avoids by not rewriting its
       summary when it restores a cached report. */
    readSummary: function () { return get(KEYS.keyAcctSummary, null); },
    writeSummary: function (s) {
      return set(KEYS.keyAcctSummary, {
        total:     s.total || 0,
        atRisk:    s.atRisk || 0,
        watch:     s.watch || 0,
        openSteps: s.openSteps || 0,
        attention: Array.isArray(s.attention) ? s.attention : [],
        updatedAt: s.updatedAt || new Date().toISOString()
      });
    },

    /* Both keys go together. A summary left behind after the book was cleared
       would keep a Home card reporting accounts that are no longer there. */
    clear: function () {
      remove(KEYS.keyAcctSummary);
      return remove(KEYS.keyAcctBook);
    }
  };

  var prescribers = {
    /* { needFollowUp, flagged } — how many prescriptions are still waiting on
       a follow-up, and how many doctors are flagged high priority.

       §5 specified { dueThisWeek, overdue }. There are no due dates: nothing
       in the tracker is scheduled, a script has either been followed up or it
       has not. Home renders these two counts instead. */
    readSummary: function () { return get(KEYS.prescriberSummary, null); },
    writeSummary: function (s) {
      return set(KEYS.prescriberSummary, {
        needFollowUp: s.needFollowUp,
        flagged:      s.flagged,
        /* Per-route tallies keyed by zone id — { waco: {open, flagged}, … }.
           Lets Home answer "what is waiting on the route I am working this
           week" without reading the whole roster. */
        byRoute:      s.byRoute || {},
        updatedAt:    new Date().toISOString()
      });
    },
    /* Follow-up state: { [prescriberId]: {status, notes, updatedAt} }.
       §5 describes this as "array with due dates". It is a map keyed by
       prescriber id instead, because the tool has no due-date field — status
       and notes hang off a prescriber, and a map is what the UI reads. */
    readFollowups:  function () { return get(KEYS.prescriberFollow, {}); },
    writeFollowups: function (map) { return set(KEYS.prescriberFollow, map); },

    /* The imported prescriber + order data. Kept apart from the follow-up
       state above for the same reason Route Board separates book from
       annotations: this half is disposable and re-importable from a fresh
       dispensing export, the other half is typed by hand and must survive
       every re-import. Not in §5 — §5 predates the paste import having
       anywhere to put its results. */
    readRoster:  function () { return get(KEYS.prescriberRoster, null); },
    writeRoster: function (roster) { return set(KEYS.prescriberRoster, roster); }
  };

  /* -------------------------------------------------------------------------
     Performance. Coaching items carry a manager's assessment of the rep, so
     this is the most sensitive thing in the store: device-local, never in the
     repo, and never in an export unless it is explicitly asked for.
     ------------------------------------------------------------------------- */
  var performance = {
    /* [{ id, date, rep, evaluator, territory, scaleMax, scale[{score,label}],
         sections{TER,PRE,SAL}, criteria[{id,label,score,option,note}],
         flagged[{id,label,note,worked}], distribution, reported{got,max,pct},
         narrative{strengths,improvements,overall}, actionItems[{text,owner,due}],
         source, file, createdAt, updatedAt }]

       All thirty criteria are now stored, along with the evaluator's note on
       each. The original shape kept only the flagged ones on the grounds that
       the other twenty-two were entry work that bought nothing — which was
       true while the scores were typed in by hand. They are read out of the
       evaluation PDF now, so that cost is gone and keeping them buys a
       per-criterion history across rides.

       `flagged` is still written, derived as the criteria sitting at the
       bottom of that evaluation's scale. It stays because `worked` hangs off
       it — the one field on this page that is typed rather than extracted, and
       the one thing a re-import must preserve.

       Evaluations entered by hand before this carry no `criteria`, so anything
       reading it must tolerate its absence rather than assume a PDF import.

       scaleMax rides on each evaluation because the scale is NOT stable — the
       May 2026 form used 1-5, the July 2026 one used 1-3. Nothing here may
       assume a fixed maximum, and two evaluations on different scales must
       never be compared as raw scores. */
    readEvals: function () {
      var a = get(KEYS.perfEvals, []);
      return Array.isArray(a) ? a : [];
    },
    writeEvals: function (list) {
      return set(KEYS.perfEvals, Array.isArray(list) ? list : []);
    },

    readSummary: function () { return get(KEYS.perfSummary, null); },

    /* Merged, not replaced. Home's Performance card is fed by more than one
       part of the page — evaluations now, rankings later — built in different
       phases. A writer that replaced the whole object would blank whichever
       fields it does not own. */
    writeSummary: function (patch) {
      var cur = get(KEYS.perfSummary, {}) || {};
      var out = {}, k;
      for (k in cur) if (Object.prototype.hasOwnProperty.call(cur, k)) out[k] = cur[k];
      for (k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) out[k] = patch[k];
      out.updatedAt = new Date().toISOString();
      return set(KEYS.perfSummary, out);
    }
  };

  /* Read-only window into Route Board's own store. No writer here on purpose.
     Shape: { primary, follow, top25only, assign, order }. `assign` maps an
     account id to a day key, which is what Home counts. */
  var routeBoard = {
    readWeek: function () { return get(KEYS.routeBoardWeek, null); },

    /* Returns { mon, tue, wed, thu, fri } counts, or null if no week saved.
       Day keys are whatever route-board.js wrote, so match case-insensitively
       on the first three letters rather than assuming an exact spelling. */
    dayCounts: function () {
      var wk = routeBoard.readWeek();
      if (!wk || !wk.assign) return null;
      var out = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };
      var ids = Object.keys(wk.assign);
      for (var i = 0; i < ids.length; i++) {
        var day = String(wk.assign[ids[i]] || '').slice(0, 3).toLowerCase();
        if (Object.prototype.hasOwnProperty.call(out, day)) out[day]++;
      }
      return out;
    }
  };

  window.Store = {
    KEYS: KEYS,
    available: available,
    get: get,
    set: set,
    remove: remove,
    onChange: onChange,
    isoMonday: isoMonday,
    schedule: schedule,
    bonus: bonus,
    keyAccounts: keyAccounts,
    prescribers: prescribers,
    performance: performance,
    routeBoard: routeBoard
  };

})(window);

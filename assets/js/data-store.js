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
    keyAcctBook:      'th_keyaccts_book',         // Key Accounts (internal)
    keyAcctSummary:   'th_keyaccts_summary',      // Key Accounts -> Home
    lostSalesMonths:  'th_lostsales_months',      // Sales / Lost Sales (internal)
    lostSalesState:   'th_lostsales_state',       // Sales / Lost Sales (internal)
    lostSalesSummary: 'th_lostsales_summary',     // Sales / Lost Sales -> Home
    prescriberRoster: 'th_prescribers_roster',    // Prescriptions (internal)
    prescriberFollow: 'th_prescribers_followups', // Prescriptions (internal)
    prescriberSummary:'th_prescribers_summary',   // Prescriptions -> Home
    perfEvals:        'th_performance_evals',     // Performance (internal)
    perfSummary:      'th_performance_summary',   // Performance -> Home
    accountXref:      'th_account_xref',          // Territory Master overlay (Route Board)
    purchaseCats:     'th_purchases_categories',  // Purchases (internal)
    purchaseMonths:   'th_purchases_months',      // Purchases (internal)
    visits:           'th_visits',                // Visit log (internal)
    pins:             'th_pins',                  // Maps pins -> Route Board book
    rankings:         'th_rankings',              // Field rankings (internal)
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

  /* -------------------------------------------------------------------------
     Lost Sales — the manager's monthly variance report.

     Two keys, split along the same line as the prescriber roster: one holds
     what was IMPORTED and is replaced wholesale by a re-import, the other
     holds what was TYPED and must survive one.

     `months` is a map of "YYYY-MM" -> one month's report, not a single latest
     report. The whole point of the page is that an account showing up three
     months running is a different problem from one that showed up once, and
     that comparison is impossible if each import overwrites the last. Keyed by
     month rather than appended to a list so re-pasting a month you already
     imported corrects it instead of double-counting it.

     `state` is keyed by CardCode — the account number from the report, which
     is stable across months in a way the clinic name is not.

     Both hold real clinic names and real sales figures. localStorage only,
     never committed, never exported unless explicitly asked for.
     ------------------------------------------------------------------------- */
  var lostSales = {
    /* { "2026-07": { month, importedAt, repNames: [], rows: [] }, … } */
    readMonths: function () { return get(KEYS.lostSalesMonths, {}) || {}; },
    writeMonths: function (months) {
      return set(KEYS.lostSalesMonths, months && typeof months === 'object' ? months : {});
    },

    /* { [cardCode]: { worked: bool, flagged: bool, updatedAt } }

       Deliberately two booleans and nothing else. The Performance page was
       rejected for asking its user to type a record of work already done, and
       the same judgement applies here: a tick and a flag are worth their entry
       cost, a notes field and a due date are not. */
    readState: function () { return get(KEYS.lostSalesState, {}) || {}; },
    writeState: function (state) {
      return set(KEYS.lostSalesState, state && typeof state === 'object' ? state : {});
    },

    /* { month, belowRunRate, accountsDown, quiet, running, open, attention[],
         updatedAt }

       `belowRunRate` is a NUMBER and it is negative — Home formats it, the way
       it formats the bonus dollars, rather than storing a pre-rendered string.

       `updatedAt` is passed in rather than stamped here, and it is the moment
       the month was IMPORTED, not the moment this line was written. Home ages
       every card off updatedAt, so stamping it at write time would let a
       summary rebuilt on page load — or one rewritten by ticking an account
       off — report a six-week-old report as arriving today. Same trap the Key
       Accounts summary avoids. */
    readSummary: function () { return get(KEYS.lostSalesSummary, null); },
    writeSummary: function (s) {
      return set(KEYS.lostSalesSummary, {
        month:        s.month || '',
        belowRunRate: typeof s.belowRunRate === 'number' ? s.belowRunRate : 0,
        accountsDown: s.accountsDown || 0,
        quiet:        s.quiet || 0,
        running:      s.running || 0,
        open:         s.open || 0,
        attention:    Array.isArray(s.attention) ? s.attention : [],
        updatedAt:    s.updatedAt || new Date().toISOString()
      });
    },

    /* Clearing the reports leaves the ticks and flags alone on purpose: they
       are the only thing on the page the user typed, and re-importing the same
       months restores the rows they hang off. The summary goes with the
       reports, though — one left behind would keep a Home card naming accounts
       that are no longer on the page. `clearAll` is the one that also drops the
       ticks, and the page asks separately before calling it. */
    clear: function () {
      remove(KEYS.lostSalesSummary);
      return remove(KEYS.lostSalesMonths);
    },
    clearAll: function () {
      remove(KEYS.lostSalesState);
      remove(KEYS.lostSalesSummary);
      return remove(KEYS.lostSalesMonths);
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

       scaleMax rides on each evaluation rather than being a constant. Every
       evaluation so far has been marked 1-3; this is defensive, not a record
       of a change that happened. It is cheap insurance against the form being
       revised, and it is what lets two evaluations be refused a raw-score
       comparison if they were ever marked on different scales. */
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

  /* -------------------------------------------------------------------------
     Territory Master overlay — the columns of the Accounts sheet that the
     Google-derived account book cannot carry: CardCode, city and route,
     keyed on SFAccountID.

     Keyed on SFAccountID rather than place ID because the workbook carries an
     SFAccountID on all 185 rows but a PlaceID on only 182, and SFAccountID is
     the join key the Visits sheet uses. Under place-ID keying the three
     accounts with no map pin were unreachable by anything except Route Board.
     Place ID is a FIELD here; readers that need it (Route Board) index on it
     themselves.

     A side table, deliberately. It joins to the account book on place ID and
     is never merged into it: the book is Google's and gets regenerated, the
     annotations are typed by hand, and this is the workbook's. Keeping the
     three apart is what lets any one of them be re-imported without
     disturbing the other two.

     Unlike Route Board's three dot-named keys, this one is a plain th_* key
     and is NOT namespaced per mount — the standalone board and the board
     inside Route Planning read the same workbook.

     Written today by Route Board's Data panel, which does not load this file
     and uses its own localStorage helpers. The accessors here are for any
     page that wants the overlay without re-deriving the shape.

     Real clinic names, account numbers and cities. Device local, never
     committed, never exported unless explicitly asked for.
     ------------------------------------------------------------------------- */
  var accountXref = {
    /* { generated,
         accounts:  { [sfAccountId]: { sfAccountId, cardCode, city, route,
                                       name, placeId } },
         unmatched: [ { name, cardCode, sfAccountId, city, route, reason } ] }

       `placeId` is '' on the rows with no map pin. That is normal, not a
       failure — those accounts still join to Visits and Purchases, they just
       cannot be drawn on the Route Board.

       `cardCode` is a STRING and must stay one — 024060 is not 24060, and the
       leading zero is part of the account number. It is also the join key for
       the purchase CSVs, so this is where SFAccountID and CardCode meet. */
    read: function () { return get(KEYS.accountXref, null); },
    write: function (x) {
      return set(KEYS.accountXref, {
        generated: (x && x.generated) || new Date().toISOString(),
        accounts:  (x && x.accounts && typeof x.accounts === 'object') ? x.accounts : {},
        unmatched: Array.isArray(x && x.unmatched) ? x.unmatched : []
      });
    },
    clear: function () { return remove(KEYS.accountXref); }
  };

  /* -------------------------------------------------------------------------
     Purchases — the per-category order CSVs out of the Report Builder portal.

     Two keys, split the way Lost Sales splits its own:

       categories  the CURRENT working set, keyed by category id. Re-importing
                   one category replaces only that category, because the export
                   is per-category and a partial import is the normal case, not
                   an error. Ten files at once is one import; one file is also
                   one import.
       months      month-end snapshots, keyed "YYYY-MM". Archiving is an
                   explicit act, not a side effect of importing: only the user
                   knows when a month is final.

     Keyed on CardCode throughout, which is TEXT — 83 accounts are 6-digit and
     102 are 7-digit beginning with 5, and the leading zeros are significant.
     Never parseInt it, never compare it numerically. This is the single most
     likely silent failure in the system, so it is a string from the CSV cell
     all the way to the object key.

     Real account names and real order dollars. Device local, never committed.
     ------------------------------------------------------------------------- */
  var purchases = {
    /* { generated, categories: { [catId]: { id, name, bonus, importedAt,
           fileName, rowCount, total, accounts: { [cardCode]: {...} } } } } */
    readCategories: function () { return get(KEYS.purchaseCats, {}) || {}; },
    writeCategories: function (cats) {
      return set(KEYS.purchaseCats, cats && typeof cats === 'object' ? cats : {});
    },

    /* { "2026-08": { archivedAt, categories: { … same shape … } } } */
    readMonths: function () { return get(KEYS.purchaseMonths, {}) || {}; },
    writeMonths: function (months) {
      return set(KEYS.purchaseMonths, months && typeof months === 'object' ? months : {});
    },

    /* Clears the working set only. The archives are the history the working
       set exists to produce, so they outlive it and go separately. */
    clear:    function () { return remove(KEYS.purchaseCats); },
    clearAll: function () {
      remove(KEYS.purchaseMonths);
      return remove(KEYS.purchaseCats);
    }
  };

  /* -------------------------------------------------------------------------
     Visit log — the Visits sheet of the master workbook, itself a Salesforce
     activity export.

     The first thing in the Hub that records that a call HAPPENED. Until this
     existed, `th_route.week.v2` held exactly one week and was overwritten on
     save, so touch counts, last-visited dates and NQV reconciliation had
     nothing to stand on.

     ACCUMULATES, unlike every other import here. A re-upload of an
     overlapping week corrects those rows and leaves the rest of the history
     alone, so `rows` is a map keyed SFAccountID|Date|Subject rather than a
     list that would double on the second upload.

     Joined on SFAccountID, never on the account name — the same office is
     spelled differently across the systems this data passes through.

     `subject` is stored verbatim. The export carries five values (Visit,
     Email, Outbound call, Stop, Inbound call) and only `Visit` earns bonus
     credit; the other four are touches. They are matched case-insensitively
     but never collapsed, because the distinction is the point.
     ------------------------------------------------------------------------- */
  var visits = {
    /* { generated,
         rows: { "<sfAccountId>|<date>|<subject>": { sfAccountId, accountName,
                 date, subject, comments1, contactFirst, contactLast, comments2 } } } */
    read: function () {
      var v = get(KEYS.visits, null);
      if (!v || typeof v !== 'object') return { generated: null, rows: {} };
      return { generated: v.generated || null,
               rows: (v.rows && typeof v.rows === 'object') ? v.rows : {} };
    },
    write: function (v) {
      return set(KEYS.visits, {
        generated: (v && v.generated) || new Date().toISOString(),
        rows: (v && v.rows && typeof v.rows === 'object') ? v.rows : {}
      });
    },
    clear: function () { return remove(KEYS.visits); }
  };

  /* -------------------------------------------------------------------------
     Pins — the Maps saved-places export, carried in the workbook's Pins sheet.
     Name, note, territory, tags and Maps URL for every saved place.

     A HANDOFF, not a destination. The workbook uploader parses this sheet and
     parks it here; Route Board's Data panel is what turns it into the account
     book, because that is where the merge rules, the diff preview and the
     >10%-loss guard already live. Rebuilding those in a second writer is how
     an import quietly destroys the notes and pillar tags that exist nowhere
     else.

     So this key is written by Key Accounts and read by Route Board, and the
     book itself still has exactly one writer.

     Rows keep sheet order: Route Board renders each territory's pool in it.
     ------------------------------------------------------------------------- */
  var pins = {
    /* { generated, fileName, rows: [ { label, title, territory, mapsUrl,
         placeId, tags: [], note } ] } */
    read: function () {
      var p = get(KEYS.pins, null);
      if (!p || typeof p !== 'object') return null;
      return { generated: p.generated || null, fileName: p.fileName || '',
               rows: Array.isArray(p.rows) ? p.rows : [] };
    },
    write: function (p) {
      return set(KEYS.pins, {
        generated: (p && p.generated) || new Date().toISOString(),
        fileName:  (p && p.fileName) || '',
        rows:      Array.isArray(p && p.rows) ? p.rows : []
      });
    },
    clear: function () { return remove(KEYS.pins); }
  };

  /* -------------------------------------------------------------------------
     Field rankings — the company's periodic ranking of the whole rep field,
     carried in the workbook's Rankings sheet.

     TWO RULES, both of which produce a confidently wrong chart if ignored:

     1. `basis` is "Monthly" or "90-day trailing" and rows of different basis
        ARE NOT COMPARABLE. The same rep placed #17 on a 90-day report and #11
        on a monthly one covering the same period. Plot them on one line and
        the page renders a collapse that never happened. Every read here is
        filtered to a single basis, and the key carries it.
     2. `totalReps` is the denominator and it moves (34 and 36 both seen).
        A rank without its total is meaningless — #12 of 34 is not #12 of 36.
        Nothing should ever display one without the other.

     Keyed reportDate|basis, so re-importing a workbook corrects a report
     rather than appending a duplicate, and history accumulates.

     `revPct` is stored as the FRACTION the sheet holds (0.068), not 6.8.
     ------------------------------------------------------------------------- */
  var rankings = {
    /* { generated, reports: { "<reportDate>|<basis>": { reportDate, basis,
         totalReps, overallRank, region, repName, pdMonth, pdRank,
         primeraMonth, primeraRank, ordersRank, revPct, revRank } } }

       There is no Orders VALUE column in the source — the monthly report
       publishes only an Orders rank, so `ordersRank` has no sibling total. */
    read: function () {
      var r = get(KEYS.rankings, null);
      if (!r || typeof r !== 'object') return { generated: null, reports: {} };
      return { generated: r.generated || null,
               reports: (r.reports && typeof r.reports === 'object') ? r.reports : {} };
    },
    write: function (r) {
      return set(KEYS.rankings, {
        generated: (r && r.generated) || new Date().toISOString(),
        reports: (r && r.reports && typeof r.reports === 'object') ? r.reports : {}
      });
    },
    /* Every distinct basis present, so a reader can offer them without
       hardcoding the two spellings seen so far. */
    bases: function () {
      var reports = rankings.read().reports, seen = {}, out = [];
      Object.keys(reports).forEach(function (k) {
        var b = reports[k].basis;
        if (b && !seen[b]) { seen[b] = 1; out.push(b); }
      });
      return out.sort();
    },
    /* One basis, oldest first. The only sanctioned way to read a series. */
    series: function (basis) {
      var reports = rankings.read().reports;
      return Object.keys(reports).map(function (k) { return reports[k]; })
        .filter(function (r) { return r.basis === basis; })
        .sort(function (a, b) { return a.reportDate < b.reportDate ? -1 : 1; });
    },
    clear: function () { return remove(KEYS.rankings); }
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
    lostSales: lostSales,
    prescribers: prescribers,
    performance: performance,
    accountXref: accountXref,
    purchases: purchases,
    visits: visits,
    pins: pins,
    rankings: rankings,
    routeBoard: routeBoard
  };

})(window);

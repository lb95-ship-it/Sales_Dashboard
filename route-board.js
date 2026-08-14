/* =====================================================================
   Route Board — an embeddable component.

   Usage on any page (no bundler, no server; works over file://):

     <div id="board" style="height:100vh"></div>
     <script src="data/accounts.js"></script>
     <script src="route-board.js"></script>
     <script>RouteBoard.mount(document.getElementById('board'));</script>

   Options: { book, storagePrefix }
     book          - an account book object; defaults to window.__ROUTE_BOARD_BOOK__
     storagePrefix - localStorage namespace; defaults to "routeBoard"

   Everything lives in a shadow root, so the host page cannot restyle the
   board and the board cannot leak styles onto the host page. The only
   global it defines is RouteBoard. Theming still works from outside via
   the custom properties on :host (--bg, --accent, ...), which pierce the
   shadow boundary by design.

   Converting to a real ES module later is a two-line change: drop the
   IIFE wrapper and `export` mount. That is not done here because ES
   module imports are blocked over file://, and this has to keep working
   as a double-clicked local file.
   ===================================================================== */
(function(global){
'use strict';
const CSS = `  :host{
    /* Owns a box, not the page: height comes from whatever contains it. */
    display:block; position:relative; height:100%; overflow:hidden;
    container-type:inline-size;
    background:var(--bg); color:var(--ink);
    font-family:var(--sans); font-size:14px; line-height:1.4;
    /* ---- Light theme, matched to the Territory Hub shell. ---------------
       Every colour is split into the roles it actually plays, because one
       value cannot serve both: --accent is text on a light panel, while
       --accent-fill is a background with --on-accent text on top of it, and
       --accent-soft / --accent-line are a pill's tint and border. The
       original dark palette conflated these, which is exactly why it could
       not be re-themed from the host page.

       Original dark values, kept so this is reversible:
         --bg:#12100e --panel:#1b1815 --panel2:#221e1a --line:#332d27
         --ink:#f2ede6 --ink-dim:#a89e93 --ink-faint:#6d645b
         --accent:#e8b24c --accent-deep:#c8862a --unassigned:#6d645b
         --mon:#5b8def --tue:#e8b24c --wed:#e0653f --thu:#8b6fd6 --fri:#4fae7d

       Every text colour below is >=4.5:1 on both --bg and --panel, and
       --on-accent / --on-day are >=4.8:1 on their fills. Measured, not
       eyeballed: re-check before changing any of them.
       ------------------------------------------------------------------- */
    --bg:#ffffff; --panel:#f7f7f8; --panel2:#ffffff; --line:#e0e0e3;
    --ink:#1c1c1e; --ink-dim:#48484a; --ink-faint:#6e6e73;

    --accent:#1a6b72; --accent-deep:#12494e;
    --accent-fill:#1a6b72; --on-accent:#ffffff;
    --accent-soft:rgba(26,107,114,0.10); --accent-line:rgba(26,107,114,0.30);
    --accent-glow:rgba(26,107,114,0.45);

    --mon:#2f6fd0; --tue:#9a6508; --wed:#c8433a; --thu:#6e4fc9; --fri:#17805a;
    --on-day:#ffffff;
    --mon-soft:rgba(47,111,208,0.09); --mon-line:rgba(47,111,208,0.32);
    --wed-soft:rgba(200,67,58,0.09);  --wed-line:rgba(200,67,58,0.36);
    --fri-line:rgba(23,128,90,0.36);

    /* Salesforce links carried a literal #5b8def in six separate rules. */
    --sf:#2f6fd0; --sf-line:rgba(47,111,208,0.35);

    /* Territory colours, previously hardcoded inside terrColor(). These are
       the route colours already used to organise routes and meetings, and
       they match --zone-* in assets/css/shell.css — change both together. */
    --terr-hill:#6e4fc9; /* purple       week 3 */
    --terr-nca:#2f6fd0;  /* blue         week 4 */
    --terr-nwa:#c4365f;  /* reddish pink week 2 */
    --terr-sca:#8a6d00;  /* yellow/gold  week 5 */
    --terr-swa:#b4531f;  /* orange       week 6 */
    --terr-waco:#17805a; /* green        week 1 */

    --unassigned:#6e6e73;
    --hover-tint:rgba(28,28,30,0.06);
    --scrim:rgba(28,28,30,0.45);
    --shadow-modal:0 20px 60px rgba(28,28,30,0.18);
    --radius:10px;
    --sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    --mono:'SF Mono',ui-monospace,'Cascadia Mono',Menlo,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  #app{display:flex; flex-direction:column; height:100%;}

  /* ---- Top bar ---- */
  header{
    background:var(--panel); border-bottom:1px solid var(--line);
    padding:10px 14px; display:flex; align-items:center; gap:14px; flex-wrap:wrap;
    flex-shrink:0;
  }
  .brand{font-weight:700; letter-spacing:-0.01em; font-size:15px; white-space:nowrap;}
  .brand .wk{color:var(--accent);}
  .ctrl{display:flex; align-items:center; gap:6px;}
  .ctrl label{font-size:11px; color:var(--ink-dim); text-transform:uppercase; letter-spacing:0.06em;}
  select{
    background:var(--panel2); color:var(--ink); border:1px solid var(--line);
    border-radius:7px; padding:6px 9px; font-family:var(--sans); font-size:13px; cursor:pointer;
    max-width:190px;
  }
  select:focus{outline:2px solid var(--accent-deep); outline-offset:1px;}
  .spacer{flex:1;}
  .btn{
    background:var(--panel2); color:var(--ink-dim); border:1px solid var(--line);
    border-radius:7px; padding:6px 11px; font-family:var(--sans); font-size:12.5px; cursor:pointer;
    white-space:nowrap; transition:.12s;
  }
  .btn:hover{color:var(--ink); border-color:var(--ink-faint);}
  .btn.warn:hover{color:var(--wed); border-color:var(--wed);}
  .count-pill{
    font-size:11px; color:var(--ink-faint); font-family:var(--mono);
  }
  .book-pill{
    font-size:10.5px; color:var(--ink-faint); font-family:var(--mono);
    border:1px solid var(--line); border-radius:20px; padding:3px 9px; white-space:nowrap;
  }
  .book-pill.warn{color:var(--wed); border-color:var(--wed);}

  /* ---- Body split ---- */
  .board{display:flex; flex:1; min-height:0;}

  /* Source column */
  .source{
    width:340px; flex-shrink:0; background:var(--panel); border-right:1px solid var(--line);
    display:flex; flex-direction:column; min-height:0;
  }
  .source-head{
    padding:10px 14px 8px; border-bottom:1px solid var(--line); flex-shrink:0;
  }
  .source-title{font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:var(--ink-dim); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;}
  .source-title b{color:var(--accent); font-size:13px;}
  .search{
    width:100%; background:var(--bg); border:1px solid var(--line); border-radius:7px;
    padding:7px 10px; color:var(--ink); font-family:var(--sans); font-size:13px;
  }
  .search:focus{outline:none; border-color:var(--accent-deep);}
  .filters{display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;}
  .chip{
    font-size:11px; padding:3px 8px; border-radius:20px; border:1px solid var(--line);
    background:transparent; color:var(--ink-dim); cursor:pointer; transition:.1s; user-select:none;
  }
  .chip.on{background:var(--accent-fill); color:var(--on-accent); border-color:var(--accent-fill); font-weight:600;}
  .source-list{overflow-y:auto; flex:1; padding:8px; min-height:0;}
  .source-list.dragover{background:var(--accent-soft);}

  /* Day columns */
  .days{flex:1; display:flex; overflow-x:auto; min-height:0;}
  .day{
    flex:1 1 0; min-width:150px; border-right:1px solid var(--line);
    display:flex; flex-direction:column; min-height:0;
  }
  .day:last-child{border-right:none;}
  .day-head{
    padding:9px 12px; border-bottom:1px solid var(--line); flex-shrink:0;
    display:flex; align-items:center; gap:8px; background:var(--panel);
  }
  .day-dot{width:9px; height:9px; border-radius:50%; flex-shrink:0;}
  .day-name{font-weight:700; font-size:13px; letter-spacing:0.02em;}
  .day-n{font-size:11px; color:var(--ink-faint); font-family:var(--mono); margin-left:auto;}
  .day-list{overflow-y:auto; flex:1; padding:7px; min-height:0; transition:.1s;}
  .day-list.dragover{background:var(--accent-soft);}
  .day[data-day="Mon"] .day-dot{background:var(--mon);} .day[data-day="Mon"] .day-name{color:var(--mon);}
  .day[data-day="Tue"] .day-dot{background:var(--tue);} .day[data-day="Tue"] .day-name{color:var(--tue);}
  .day[data-day="Wed"] .day-dot{background:var(--wed);} .day[data-day="Wed"] .day-name{color:var(--wed);}
  .day[data-day="Thu"] .day-dot{background:var(--thu);} .day[data-day="Thu"] .day-name{color:var(--thu);}
  .day[data-day="Fri"] .day-dot{background:var(--fri);} .day[data-day="Fri"] .day-name{color:var(--fri);}

  /* ---- Account card ---- */
  .card{
    background:var(--panel2); border:1px solid var(--line); border-radius:var(--radius);
    padding:8px 9px 7px; margin-bottom:6px; cursor:grab; position:relative;
    border-left:3px solid var(--src-color,var(--unassigned)); transition:.1s;
  }
  .card:active{cursor:grabbing;}
  .card.dragging{opacity:0.4;}
  .card:hover{border-color:var(--ink-faint);}
.card-name{font-weight:600; font-size:13px; line-height:1.25; padding-right:14px;}
  .card.placed .card-name{
    padding-right:58px;
    display:-webkit-box;
    -webkit-line-clamp:2;
    -webkit-box-orient:vertical;
    overflow:hidden;
  }
  .stopno{
    display:inline-flex; align-items:center; justify-content:center;
    min-width:17px; height:17px; padding:0 4px; margin-right:5px; border-radius:5px;
    background:var(--src-color,var(--unassigned)); color:var(--on-day);
    font-family:var(--mono); font-size:10.5px; font-weight:700; vertical-align:1px;
  }
  .card-ctl{position:absolute; top:5px; right:6px; display:flex; gap:2px; align-items:center;}
  .card-ctl button{
    width:17px; height:17px; padding:0; border-radius:4px; border:1px solid transparent;
    background:transparent; color:var(--ink-faint); font-size:10px; line-height:1;
    cursor:pointer; font-family:var(--sans);
  }
  .card-ctl button:hover:not(:disabled){color:var(--ink); background:var(--hover-tint);}
  .card-ctl button:disabled{opacity:0.25; cursor:default;}
  .card-ctl button.rm{font-size:14px;}
  .card-ctl button.rm:hover{color:var(--wed); background:var(--wed-soft);}
  .drop-line{
    height:2px; margin:2px 1px; border-radius:2px; background:var(--accent-fill);
    box-shadow:0 0 6px var(--accent-glow);
  }
  .card-note{
    font-size:11.5px; color:var(--accent); margin-top:3px; line-height:1.3;
    white-space:pre-line; font-style:italic;
  }
  /* City / disambiguation label. Same size and spacing as the note it sits
     above, but upright and neutral: seven accounts are called Texas State
     Optical and this line is what tells them apart, so it has to read as a
     fact about the account rather than as another note. */
  .card-city{
    font-size:11.5px; color:var(--ink-dim); margin-top:3px; line-height:1.3;
  }
  .sched{
    display:inline-flex; align-items:center; gap:4px; margin-top:4px;
    font-family:var(--mono); font-size:10px; line-height:1.4;
    padding:2px 6px; border-radius:5px;
    background:var(--accent-soft); color:var(--accent);
    border:1px solid var(--accent-line);
  }
  .sched.you{background:var(--mon-soft); color:var(--mon); border-color:var(--mon-line);}
  .sched .t{opacity:0.8;}
  .card.conflict{border-color:var(--wed); background:var(--wed-soft);}
  .card.conflict .sched{background:var(--wed-soft); color:var(--wed); border-color:var(--wed-line);}
  .fits-row{display:flex; align-items:center; gap:4px; margin-top:8px; flex-wrap:wrap;}
  .fits-row .lbl{font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-faint);}
  .fits-row button{
    font-size:11px; font-family:var(--mono); padding:3px 8px; border-radius:20px;
    border:1px solid var(--line); background:transparent; color:var(--ink-dim); cursor:pointer;
  }
  .fits-row button.on{background:var(--accent-fill); color:var(--on-accent); border-color:var(--accent-fill); font-weight:700;}
  .conflict-pill{font-size:11px; font-family:var(--mono); color:var(--wed);}

  /* Visit-window review list in the Data panel */
  .win-list{max-height:320px; overflow-y:auto; margin-top:9px; border:1px solid var(--line); border-radius:8px;}
  .win-row{padding:8px 10px; border-bottom:1px solid var(--line);}
  .win-row:last-child{border-bottom:none;}
  .win-row.edited{background:var(--mon-soft);}
  .win-row.review{background:var(--wed-soft);}
  .win-name{font-size:12px; font-weight:600;}
  .win-note{font-size:11px; color:var(--accent); font-style:italic; margin-top:2px; white-space:pre-line;}
  .win-ctl{display:flex; align-items:center; gap:3px; margin-top:6px; flex-wrap:wrap;}
  .win-ctl button.d{
    font-size:10.5px; font-family:var(--mono); width:30px; padding:3px 0; border-radius:5px;
    border:1px solid var(--line); background:transparent; color:var(--ink-faint); cursor:pointer;
  }
  .win-ctl button.d.on{background:var(--accent-fill); color:var(--on-accent); border-color:var(--accent-fill); font-weight:700;}
  .win-ctl input{
    width:104px; background:var(--bg); border:1px solid var(--line); border-radius:5px;
    padding:3px 7px; color:var(--ink); font-family:var(--mono); font-size:10.5px;
  }
  .win-ctl input:focus{outline:none; border-color:var(--accent-deep);}
  .win-ctl .reset{
    font-size:10.5px; padding:3px 8px; border-radius:5px; border:1px solid var(--line);
    background:transparent; color:var(--ink-faint); cursor:pointer; font-family:var(--sans);
  }
  .win-ctl .reset:hover{color:var(--ink);}
  .win-flag{font-size:10px; color:var(--wed); margin-left:auto; font-family:var(--mono);}
  .card-tags{display:flex; flex-wrap:wrap; gap:3px; margin-top:5px;}
  .tag{font-size:11px; line-height:1; opacity:0.9;}
  .card-actions{display:flex; gap:6px; margin-top:6px; align-items:center;}
  .card-actions a{
    font-size:11px; text-decoration:none; padding:2px 7px; border-radius:5px;
    border:1px solid var(--line); color:var(--ink-dim); transition:.1s; white-space:nowrap;
  }
  .card-actions a:hover{color:var(--ink); border-color:var(--ink-faint);}
  .card-actions a.dir{color:var(--fri); border-color:var(--fri-line);}
  .card-actions a.dir:hover{border-color:var(--fri);}
  .card-actions a.sf{color:var(--sf); border-color:var(--sf-line);}
  .card-actions a.sf:hover{border-color:var(--sf);}
  .card-actions .sf-add{
    font-size:11px; padding:2px 7px; border-radius:5px; border:1px dashed var(--line);
    color:var(--ink-faint); cursor:pointer; background:transparent; font-family:var(--sans);
  }
  .card-actions .sf-add:hover{color:var(--sf); border-color:var(--sf);}
  .sf-pop{
    margin-top:6px; display:flex; gap:5px; align-items:center;
  }
  .sf-pop input{
    flex:1; background:var(--bg); border:1px solid var(--line); border-radius:6px;
    padding:5px 8px; color:var(--ink); font-family:var(--mono); font-size:11px;
  }
  .sf-pop input:focus{outline:none; border-color:var(--sf);}
  .sf-pop button{
    font-size:11px; padding:5px 9px; border-radius:6px; border:1px solid var(--line);
    background:var(--panel); color:var(--ink-dim); cursor:pointer;
  }
  .sf-pop button.save{color:var(--sf); border-color:var(--sf-line);}
  .sf-pop button.save:hover{background:var(--sf); color:var(--on-day);}
  .terr-mini{font-size:10px; color:var(--ink-faint); font-family:var(--mono); margin-left:auto;}
  .card .x{
    position:absolute; top:6px; right:7px; width:16px; height:16px; border-radius:4px;
    display:flex; align-items:center; justify-content:center; color:var(--ink-faint);
    font-size:14px; cursor:pointer; line-height:1;
  }
  .card .x:hover{color:var(--wed); background:var(--wed-soft);}
  /* Skipped: still readable, clearly out of play. Shown only when the
     Show skipped chip is on, and always after the live pool. */
  .card.skipped{opacity:0.5;}
  .card.skipped:hover{opacity:0.8;}
  .card .x.unskip:hover{color:var(--mon); background:var(--mon-soft);}

  /* Quick-assign row (tap targets, mobile-friendly) */
  .qa{display:flex; gap:3px; margin-top:6px;}
  .qa button{
    flex:1; font-size:11px; font-weight:700; padding:4px 0; border-radius:5px;
    border:1px solid var(--line); background:transparent; cursor:pointer; color:var(--ink-faint);
    font-family:var(--mono); transition:.08s;
  }
  .qa button[data-d="Mon"]:hover{color:var(--on-day);background:var(--mon);border-color:var(--mon);}
  .qa button[data-d="Tue"]:hover{color:var(--on-day);background:var(--tue);border-color:var(--tue);}
  .qa button[data-d="Wed"]:hover{color:var(--on-day);background:var(--wed);border-color:var(--wed);}
  .qa button[data-d="Thu"]:hover{color:var(--on-day);background:var(--thu);border-color:var(--thu);}
  .qa button[data-d="Fri"]:hover{color:var(--on-day);background:var(--fri);border-color:var(--fri);}

  .empty{color:var(--ink-faint); font-size:12px; text-align:center; padding:22px 10px; font-style:italic;}
  .fatal{
    margin:40px auto; max-width:560px; background:var(--panel); border:1px solid var(--wed);
    border-radius:12px; padding:20px 22px; line-height:1.6;
  }
  .fatal h2{font-size:15px; color:var(--wed); margin-bottom:8px;}
  .fatal code{font-family:var(--mono); font-size:12px; color:var(--accent);}

  /* ---- Data panel ---- */
  .modal.wide{max-width:680px;}
  .data-body{overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:20px;}
  .data-body section{border:1px solid var(--line); border-radius:10px; padding:12px 13px; background:var(--panel2);}
  .data-body h3{font-size:12px; text-transform:uppercase; letter-spacing:0.07em; color:var(--accent); margin-bottom:6px;}
  .muted{font-size:11.5px; color:var(--ink-dim); line-height:1.5; margin-bottom:9px;}
  .muted code{font-family:var(--mono); color:var(--ink-faint);}
  .row{display:flex; flex-wrap:wrap; gap:6px; align-items:center;}
  .btn.ok{color:var(--fri); border-color:var(--fri-line);}
  .btn.ok:hover{background:var(--fri); color:var(--on-day); border-color:var(--fri);}
  .file-btn{display:inline-block;}
  .data-body textarea{
    width:100%; margin-top:9px; background:var(--bg); border:1px solid var(--line);
    border-radius:8px; color:var(--ink); font-family:var(--mono); font-size:11.5px;
    line-height:1.5; padding:10px; resize:vertical; min-height:120px;
  }
  .data-body textarea:focus{outline:none; border-color:var(--accent-deep);}
  .preview{
    margin-top:10px; border:1px solid var(--line); border-radius:8px; padding:10px 11px;
    background:var(--bg); font-size:11.5px; line-height:1.6;
  }
  .preview b{font-family:var(--mono);}
  .preview .add{color:var(--fri);}
  .preview .upd{color:var(--accent);}
  .preview .del{color:var(--wed);}
  .preview .danger{color:var(--wed); font-weight:600;}
  .preview ul{margin:5px 0 0 16px;}
  .preview li{color:var(--ink-dim);}
  .msg{font-size:11.5px; margin-top:8px;}
  .msg.err{color:var(--wed);}
  .msg.ok{color:var(--fri);}

  ::-webkit-scrollbar{width:9px; height:9px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:var(--line); border-radius:5px;}
  ::-webkit-scrollbar-thumb:hover{background:var(--ink-faint);}

  .modal-back{
    position:fixed; inset:0; background:var(--scrim); z-index:200;
    display:flex; align-items:center; justify-content:center; padding:20px;
  }
  .modal{
    background:var(--panel); border:1px solid var(--line); border-radius:12px;
    width:100%; max-width:560px; max-height:80vh; display:flex; flex-direction:column;
    box-shadow:var(--shadow-modal);
  }
  .modal-head{
    display:flex; justify-content:space-between; align-items:center; gap:10px;
    padding:12px 14px; border-bottom:1px solid var(--line); font-size:12.5px; color:var(--ink-dim);
  }
  .modal textarea{
    flex:1; margin:12px 14px; background:var(--bg); border:1px solid var(--line); border-radius:8px;
    color:var(--ink); font-family:var(--mono); font-size:12px; line-height:1.6; padding:12px;
    resize:none; min-height:280px; white-space:pre;
  }
  .modal textarea:focus{outline:none; border-color:var(--accent-deep);}
  .modal-foot{
    display:flex; align-items:center; gap:12px; padding:0 14px 14px;
  }

  @container (max-width:820px){
    .board{flex-direction:column;}
    .source{width:100%; max-height:42vh; border-right:none; border-bottom:1px solid var(--line);}
    .days{flex-direction:row;}
    .day{min-width:135px;}
  }`;

const MARKUP = `<div id="app">
  <header>
    <div class="brand">Route Board <span class="wk" id="weekLabel"></span></div>
    <div class="ctrl">
      <label>Primary</label>
      <select id="primarySel"></select>
    </div>
    <div class="ctrl">
      <label>Follow-ups</label>
      <select id="followSel"></select>
    </div>
    <div class="ctrl">
      <label title="Applies to the follow-up territory only; the primary territory always shows every account."><input type="checkbox" id="top25only" checked style="vertical-align:middle;"> Top 25 only (follow-ups)</label>
    </div>
    <div class="spacer"></div>
    <span class="book-pill" id="bookPill"></span>
    <span class="count-pill" id="progress"></span>
    <button class="btn" id="dataBtn" title="Import or export the account book and your Salesforce links">Data</button>
    <button class="btn" id="exportBtn" title="Copies your full plan (days, map links, and any Salesforce links) as text you can paste into Notes to save it">Save plan (copy)</button>
    <button class="btn warn" id="resetBtn">Reset</button>
  </header>

  <div class="board">
    <aside class="source">
      <div class="source-head">
        <div class="source-title"><span>Unassigned</span><b id="srcCount"></b></div>
        <input class="search" id="search" placeholder="Search accounts...">
        <div class="fits-row" id="fitsRow">
          <span class="lbl" title="Show only accounts whose note allows this day, plus everyone with no stated day">Fits</span>
        </div>
        <div class="filters" id="filters"></div>
        <div class="filters" id="skipRow"></div>
      </div>
      <div class="source-list" id="sourceList" data-day="_src"></div>
    </aside>

    <div class="days" id="days"></div>
  </div>
</div>

<div id="planModal" class="modal-back" style="display:none;">
  <div class="modal">
    <div class="modal-head">
      <span>Your plan — select all and copy (⌘/Ctrl-C)</span>
      <button id="planClose" class="btn">Close</button>
    </div>
    <textarea id="planText" readonly></textarea>
    <div class="modal-foot">
      <button id="planCopy" class="btn">Copy to clipboard</button>
      <span id="planCopyMsg" class="count-pill"></span>
    </div>
  </div>
</div>

<div id="dataModal" class="modal-back" style="display:none;">
  <div class="modal wide">
    <div class="modal-head">
      <span>Data — account book &amp; Salesforce links</span>
      <button id="dataClose" class="btn">Close</button>
    </div>
    <div class="data-body">

      <section>
        <h3>Account book</h3>
        <p class="muted" id="bookStatus"></p>
        <p class="muted">
          Accepts either a generated <code>accounts.json</code>, or a raw territory list in the
          <code>{"Territory": [[name, note, mapUrl, [tags]]]}</code> shape straight out of your
          Google Lists export — it is converted here, no script needed. Accounts are matched on
          Google place ID, so day assignments and Salesforce links stay attached through renames
          and reordering.
        </p>
        <div class="row">
          <label class="btn file-btn">Choose file…<input type="file" id="bookFile" accept=".json,.txt,application/json" style="display:none;"></label>
          <button class="btn" id="bookPasteToggle">Paste JSON</button>
          <button class="btn" id="bookCopy">Copy current book</button>
          <button class="btn" id="bookDownload">Download accounts.json</button>
          <button class="btn warn" id="bookRevert">Revert to built-in</button>
        </div>
        <textarea id="bookPaste" style="display:none;" placeholder="Paste accounts.json or a raw territory list here, then press Preview."></textarea>
        <div class="row" id="bookPasteRow" style="display:none; margin-top:8px;">
          <button class="btn" id="bookPreviewBtn">Preview changes</button>
        </div>
        <div id="bookPreview" class="preview" style="display:none;"></div>
        <div class="row" id="bookApplyRow" style="display:none; margin-top:9px;">
          <button class="btn ok" id="bookApply">Apply import</button>
          <button class="btn" id="bookCancel">Cancel</button>
        </div>
        <div class="msg" id="bookMsg"></div>
      </section>

      <section>
        <h3>Visit windows</h3>
        <p class="muted" id="winStatus"></p>
        <p class="muted">
          Read from each account's note. Correct anything wrong here and it sticks — overrides are
          stored with your Salesforce links, so they survive re-importing the book. Rows shaded red
          contain a "not …" and are worth checking first; blue rows you have already edited.
        </p>
        <div class="row">
          <button class="btn" id="winAll">Show all</button>
          <button class="btn" id="winReview">Needs review only</button>
          <button class="btn" id="winEdited">Edited only</button>
        </div>
        <div class="win-list" id="winList"></div>
      </section>

      <section>
        <h3>Salesforce links</h3>
        <p class="muted" id="annStatus"></p>
        <p class="muted">
          Your links, keyed by place ID. Import merges — existing links are kept unless the
          imported file has a different link for the same account.
        </p>
        <div class="row">
          <label class="btn file-btn">Choose file…<input type="file" id="annFile" accept=".json,.txt,application/json" style="display:none;"></label>
          <button class="btn" id="annPasteToggle">Paste JSON</button>
          <button class="btn" id="annCopy">Copy links</button>
          <button class="btn" id="annDownload">Download links</button>
        </div>
        <textarea id="annPaste" style="display:none;" placeholder="Paste a Salesforce links file here, then press Preview."></textarea>
        <div class="row" id="annPasteRow" style="display:none; margin-top:8px;">
          <button class="btn" id="annPreviewBtn">Preview changes</button>
        </div>
        <div id="annPreview" class="preview" style="display:none;"></div>
        <div class="row" id="annApplyRow" style="display:none; margin-top:9px;">
          <button class="btn ok" id="annApply">Apply</button>
          <button class="btn" id="annCancel">Cancel</button>
        </div>
        <div class="msg" id="annMsg"></div>
      </section>

    </div>
  </div>
</div>`;

function mount(host, opts){
  opts = opts || {};
  if(typeof host === 'string') host = document.querySelector(host);
  if(!host) throw new Error('RouteBoard.mount: host element not found');

  // attachShadow throws if called twice, so a re-mount reuses the root.
  const root = host.shadowRoot || host.attachShadow({mode:'open'});
  root.innerHTML = '<style>' + CSS + '</style>' + MARKUP;

  // Applying or reverting an imported book used to call location.reload(),
  // which would blow away the rest of the dashboard. Rebuild just this
  // component instead — all state it needs is already in storage.
  const remount = function(){ return mount(host, opts); };
const DAYS = ['Mon','Tue','Wed','Thu','Fri'];
const DAYFULL = {Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday'};

/* ------------------------------------------------------------------
   THREE STORES, deliberately kept apart:

     book        - the account list. Regenerated from Google Lists, so it is
                   disposable and must never be the only copy of anything.
     annotations - Salesforce links. Yours. Survives Reset and survives a
                   re-import of the book.
     week        - this week's day assignments plus the territory pickers.
                   Reset clears the assignments.

   Everything is keyed on the Google place ID (e.g. "0x865b39...:0xa3a6c1..."),
   which is stable across renames, reordering and re-exports. The previous
   territory+row-index key broke the moment a row moved.
   ------------------------------------------------------------------ */
const NS = opts.storagePrefix || 'routeBoard';
const STORE = {
  book:        NS + '.book.v2',
  annotations: NS + '.annotations.v2',
  week:        NS + '.week.v2',
  legacy:      NS + '.v1'
};

// Every storage access is wrapped: sandboxes and private windows throw on
// localStorage, and there the board degrades to in-memory only.
function lsGet(key){
  try { return localStorage.getItem(key); } catch(e){ return null; }
}
function lsSet(key, val){
  try { localStorage.setItem(key, val); return true; } catch(e){ return false; }
}
function readJSON(key){
  const raw = lsGet(key);
  if(!raw) return null;
  try { const v = JSON.parse(raw); return (v && typeof v === 'object') ? v : null; }
  catch(e){ return null; }
}

// ---- Book ----------------------------------------------------------
// Precedence: a book imported into localStorage wins; otherwise the generated
// data/accounts.js. Nothing writes the imported slot yet — that lands with the
// import/export step — but the lookup order is in place so it can.
function loadBook(){
  const imported = readJSON(STORE.book);
  if(imported && imported.accounts && imported.territoryOrder){
    imported.__source = 'imported';
    return imported;
  }
  const built = opts.book || global.__ROUTE_BOARD_BOOK__;
  if(built && built.accounts && built.territoryOrder){
    built.__source = 'accounts.js';
    return built;
  }
  return null;
}

/* With no book, this used to replace #app's markup with a fatal notice and
   throw. Both halves were a problem: replacing #app destroys the header, and
   the header holds the only control that opens the Data panel — so the paste
   import, the one way to recover on a deployed site with no data/accounts.js,
   became unreachable in exactly the state that needs it. The throw then
   aborted mount() before buildDataPanel() ran, leaving the panel's handlers
   unwired even if you could reach it.

   So: substitute an empty book and carry on. Every render path already
   handles zero accounts (that is the same code that draws "all accounts in
   this territory are placed"), init completes normally, and openDataPanel()
   below puts the import UI on screen ready to paste into. */
const LOADED_BOOK = loadBook();
const HAS_BOOK = !!LOADED_BOOK;
const BOOK = LOADED_BOOK || {accounts:{}, territoryOrder:{}, __source:'none'};

const ACCOUNTS   = BOOK.accounts;
const TERRITORIES = Object.keys(BOOK.territoryOrder);

// ---- Annotations (yours; survive Reset and re-import) ---------------
// Links whose account is not in the CURRENT book are quarantined rather than
// dropped: an import that removes accounts must not silently delete the work
// attached to them, because reverting the import has to bring them back.
let annotations = { sfLinks: {}, orphanSfLinks: {}, labels: {}, orphanLabels: {},
                    skipped: {}, orphanSkipped: {},
                    schedules: {}, orphanSchedules: {} };
(function loadAnnotations(){
  const s = readJSON(STORE.annotations);
  if(!s) return;
  if(s.sfLinks && typeof s.sfLinks === 'object'){
    Object.keys(s.sfLinks).forEach(id=>{
      const v = s.sfLinks[id];
      if(typeof v !== 'string') return;
      if(ACCOUNTS[id]) annotations.sfLinks[id] = v;
      else annotations.orphanSfLinks[id] = v;
    });
  }
  // City / disambiguation labels. The book carries no city, address or
  // coordinates, so this is the only thing separating the seven accounts
  // named Texas State Optical. Same quarantine rule as the links.
  if(s.labels && typeof s.labels === 'object'){
    Object.keys(s.labels).forEach(id=>{
      const v = sanitizeLabel(s.labels[id]);
      if(!v) return;
      if(ACCOUNTS[id]) annotations.labels[id] = v;
      else annotations.orphanLabels[id] = v;
    });
  }
  // Accounts taken out of the pool. Stored as a set of ids that are true;
  // anything false or missing is in play, so an old file with `false` values
  // reads the same as one without them.
  if(s.skipped && typeof s.skipped === 'object'){
    Object.keys(s.skipped).forEach(id=>{
      if(!s.skipped[id]) return;
      if(ACCOUNTS[id]) annotations.skipped[id] = true;
      else annotations.orphanSkipped[id] = true;
    });
  }
  // Corrected visit windows. Same quarantine rule as the links: an account
  // missing from the current book keeps its override rather than losing it.
  if(s.schedules && typeof s.schedules === 'object'){
    Object.keys(s.schedules).forEach(id=>{
      const v = sanitizeSchedule(s.schedules[id]);
      if(!v) return;
      if(ACCOUNTS[id]) annotations.schedules[id] = v;
      else annotations.orphanSchedules[id] = v;
    });
  }
})();
/* A place name, not a paragraph. Trimmed, single-line and capped so a paste
   accident cannot push the card layout around. */
function sanitizeLabel(v){
  if(typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim().slice(0, 40);
  return s || null;
}
function sanitizeSchedule(v){
  if(!v || typeof v !== 'object') return null;
  const days = Array.isArray(v.days) ? DAYS.filter(d=>v.days.indexOf(d) !== -1) : [];
  const times = Array.isArray(v.times)
    ? v.times.filter(t=>typeof t === 'string' && t.length < 12).slice(0,4) : [];
  const period = (v.period === 'morning' || v.period === 'afternoon') ? v.period : null;
  const bound = (typeof v.bound === 'string' && v.bound.length < 24) ? v.bound : null;
  return {days:days, times:times, period:period, bound:bound};
}
function saveAnnotations(){
  lsSet(STORE.annotations, JSON.stringify({
    sfLinks:   Object.assign({}, annotations.orphanSfLinks, annotations.sfLinks),
    labels:    Object.assign({}, annotations.orphanLabels, annotations.labels),
    skipped:   Object.assign({}, annotations.orphanSkipped, annotations.skipped),
    schedules: Object.assign({}, annotations.orphanSchedules, annotations.schedules)
  }));
}

// ---- Week (assignments + pickers) ----------------------------------
let week = {
  primary: TERRITORIES[0],
  follow: '(none)',
  top25only: true,
  assign: {},      // placeId -> 'Mon'|'Tue'|...  (accounts in the current book)
  orphanAssign: {},// same, for accounts the current book does not contain
  order: {}        // 'Mon' -> [placeId, ...]  the drive order within that day
};
(function loadWeek(){
  const s = readJSON(STORE.week);
  if(!s) return;
  if(TERRITORIES.indexOf(s.primary) !== -1) week.primary = s.primary;
  if(s.follow === '(none)' || TERRITORIES.indexOf(s.follow) !== -1) week.follow = s.follow;
  if(typeof s.top25only === 'boolean') week.top25only = s.top25only;
  // Assignments for accounts outside the current book are quarantined, not
  // deleted, so reverting a bad import restores the week intact.
  if(s.assign && typeof s.assign === 'object'){
    Object.keys(s.assign).forEach(id=>{
      const d = s.assign[id];
      if(DAYS.indexOf(d) === -1) return;
      if(ACCOUNTS[id]) week.assign[id] = d; else week.orphanAssign[id] = d;
    });
  }
  // Stored weeks from before ordering existed simply have no "order"; dayAccounts
  // rebuilds it from the assignments on first render.
  if(s.order && typeof s.order === 'object'){
    DAYS.forEach(d=>{
      if(Array.isArray(s.order[d])) week.order[d] = s.order[d].filter(id=>typeof id === 'string');
    });
  }
})();
function saveWeek(){
  lsSet(STORE.week, JSON.stringify({
    primary: week.primary,
    follow: week.follow,
    top25only: week.top25only,
    assign: Object.assign({}, week.orphanAssign, week.assign),
    order: week.order
  }));
}

/* ---- Day sequence ---------------------------------------------------
   week.assign answers "which day", week.order answers "in what order".
   dayAccounts() reconciles the two on every render, so the pair is
   self-healing: ids assigned but missing from the order land at the end,
   and ids in the order that are no longer assigned drop out. */
function dayAccounts(d){
  const pending = {};
  Object.keys(week.assign).forEach(id=>{
    if(week.assign[id] === d && ACCOUNTS[id]) pending[id] = 1;
  });
  const seq = (week.order[d]||[]).filter(id=>{
    if(pending[id]){ delete pending[id]; return true; }
    return false;
  });
  Object.keys(pending).forEach(id=>seq.push(id));
  week.order[d] = seq;
  return seq.map(id=>ACCOUNTS[id]);
}
function removeFromOrder(id, day){
  const arr = week.order[day];
  if(!arr) return;
  const i = arr.indexOf(id);
  if(i !== -1) arr.splice(i, 1);
}
// index === undefined appends; otherwise inserts at that position.
function assignTo(id, day, index){
  // Putting a skipped account on a day is an un-skip: it is plainly back in
  // play, and a dimmed card in a day column with no way to restore it would
  // be a dead end. Reachable by revealing skipped accounts and dragging one.
  if(annotations.skipped[id]){
    delete annotations.skipped[id];
    saveAnnotations();
  }
  const prev = week.assign[id];
  if(prev) removeFromOrder(id, prev);
  week.assign[id] = day;
  const arr = week.order[day] || (week.order[day] = []);
  const at = (typeof index === 'number' && index >= 0 && index <= arr.length) ? index : arr.length;
  arr.splice(at, 0, id);
}
function unassign(id){
  const d = week.assign[id];
  if(d) removeFromOrder(id, d);
  delete week.assign[id];
}
function moveInDay(id, dir){
  const d = week.assign[id];
  if(!d) return;
  const arr = week.order[d] || [];
  const i = arr.indexOf(id);
  const j = i + dir;
  if(i === -1 || j < 0 || j >= arr.length) return;
  arr.splice(j, 0, arr.splice(i, 1)[0]);
  render();
}

// ---- One-time migration off the old territory+index keys ------------
// The v1 key encoded "Territory||rowIndex||Name". territoryOrder still holds the
// original row order, so the index resolves to a place ID exactly once. The old
// blob is renamed rather than deleted, in case this needs a second look.
(function migrateV1(){
  const old = readJSON(STORE.legacy);
  if(!old) return;
  const resolve = key=>{
    const parts = String(key).split('||');
    if(parts.length < 3) return null;
    const order = BOOK.territoryOrder[parts[0]];
    const idx = parseInt(parts[1], 10);
    if(!order || isNaN(idx)) return null;
    return order[idx] || null;
  };
  let moved = 0;
  if(old.assign) Object.keys(old.assign).forEach(k=>{
    const id = resolve(k);
    if(id && ACCOUNTS[id] && DAYS.indexOf(old.assign[k]) !== -1 && !week.assign[id]){
      week.assign[id] = old.assign[k]; moved++;
    }
  });
  if(old.sfLinks) Object.keys(old.sfLinks).forEach(k=>{
    const id = resolve(k);
    if(id && ACCOUNTS[id] && typeof old.sfLinks[k] === 'string' && !annotations.sfLinks[id]){
      annotations.sfLinks[id] = old.sfLinks[k]; moved++;
    }
  });
  if(moved){ saveWeek(); saveAnnotations(); }
  if(lsSet(STORE.legacy + '.migrated', JSON.stringify(old))){
    try { localStorage.removeItem(STORE.legacy); } catch(e){}
  }
  if(moved) console.info('Route Board: migrated ' + moved + ' item(s) from the v1 store.');
})();

// ---- Transient view state (not persisted) ---------------------------
// showSkipped is view state, not stored: a skip is a lasting decision, but
// wanting to look at what you skipped is a moment.
let view = { search: '', activeTags: new Set(), fitsDay: null, showSkipped: false };

// Directions URL from place URL (extract name for one-tap nav)
function dirUrl(a){
  // Use destination by name; place URL already encodes it
  const m = a.url.match(/\/place\/([^\/]+)/);
  const q = m ? m[1] : encodeURIComponent(a.name);
  return 'https://www.google.com/maps/dir/?api=1&destination=' + q;
}

// All tags present, for filter chips
const ALLTAGS = (()=>{
  const c = {};
  Object.keys(ACCOUNTS).forEach(id=>ACCOUNTS[id].tags.forEach(t=>c[t]=(c[t]||0)+1));
  return Object.keys(c).sort((a,b)=>c[b]-c[a]);
})();

// ---- The unassigned POOL: the selected territories, in Google-list order ----
// "Top 25 only" applies to the follow-up territory only; the primary territory
// always shows every account.
function poolAccounts(){
  const list = [];
  const seen = {};
  (BOOK.territoryOrder[week.primary]||[]).forEach(id=>{
    const a = ACCOUNTS[id];
    if(a && !seen[id]){ seen[id] = 1; list.push(a); }
  });
  if(week.follow !== '(none)' && week.follow !== week.primary){
    (BOOK.territoryOrder[week.follow]||[]).forEach(id=>{
      const a = ACCOUNTS[id];
      if(!a || seen[id]) return;             // an office in both territories lists once
      if(week.top25only && a.tags.indexOf('⭐ Top 25') === -1) return;
      seen[id] = 1; list.push(a);
    });
  }
  return list;
}

// ---- Every account currently assigned to a day, from ANY territory ----
// Day columns use this so placed cards never vanish when territories switch.
function assignedAccounts(){
  return Object.keys(week.assign).map(id=>ACCOUNTS[id]).filter(Boolean);
}

function terrShort(terr){
  return terr.replace('Austin','').replace('/',' /').trim()
    .split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase();
}
function terrLabel(a){ return a.territories.map(terrShort).join('/'); }
/* =====================================================================
   VISIT WINDOWS

   Roughly two thirds of the notes encode when an office can actually be
   seen — "Thursday afternoon", "M, W, or F", "11:30a M-Th", "mornings, not
   Monday". Parsed here rather than in build-book.ps1 so it works on any
   book, however it was produced, and so corrections live in the
   annotations store and survive a re-import.

   Deliberately conservative. Getting a day WRONG is worse than not
   extracting it, so single-letter abbreviations are only honoured in
   upper case, and anything with a negation is flagged for review. The
   original note text is always kept and always displayed.
   ===================================================================== */

const DAY_WORD_RE = [
  {d:'Mon', re:/\bmon(?:day)?s?\b/ig},
  {d:'Tue', re:/\btues?(?:day)?s?\b/ig},
  {d:'Wed', re:/\bwed(?:nesday)?s?\b/ig},
  {d:'Thu', re:/\bthur?s?(?:day)?s?\b/ig},
  {d:'Fri', re:/\bfri(?:day)?s?\b/ig}
];
// Upper case only: a lower-case stray "t" or "w" in prose is far too common.
// Th is tested before T so "M & Th" does not read as Tuesday.
const DAY_ABBR_RE = [
  {d:'Thu', re:/\bTh\b/g},
  {d:'Mon', re:/\bM\b/g},
  {d:'Tue', re:/\bT\b/g},
  {d:'Wed', re:/\bW\b/g},
  {d:'Fri', re:/\bF\b/g}
];
const DAY_TOKEN = {m:'Mon',mon:'Mon',monday:'Mon',t:'Tue',tue:'Tue',tues:'Tue',tuesday:'Tue',
                   w:'Wed',wed:'Wed',wednesday:'Wed',th:'Thu',thu:'Thu',thur:'Thu',thurs:'Thu',
                   thursday:'Thu',f:'Fri',fri:'Fri',friday:'Fri'};

function collectDays(text){
  const found = {};
  // Ranges ("M-Th", "Mon-Fri"). Case-insensitive here: a hyphen between two day
  // tokens is unambiguous context.
  String(text).replace(
    /\b(mon|tues?|wed|thur?s?|fri|m|t|w|th|f)\s*(?:-|–|—|to)\s*(mon|tues?|wed|thur?s?|fri|m|t|w|th|f)\b/ig,
    function(m, a, b){
      const i = DAYS.indexOf(DAY_TOKEN[a.toLowerCase()]);
      const j = DAYS.indexOf(DAY_TOKEN[b.toLowerCase()]);
      if(i !== -1 && j !== -1 && i <= j){ for(let k=i;k<=j;k++) found[DAYS[k]] = 1; }
      return m;
    });
  DAY_WORD_RE.forEach(function(x){ if(String(text).match(x.re)) found[x.d] = 1; });
  DAY_ABBR_RE.forEach(function(x){ if(String(text).match(x.re)) found[x.d] = 1; });
  return DAYS.filter(function(d){ return found[d]; });
}

function extractDays(raw){
  let text = ' ' + String(raw||'').replace(/\n/g, ' ') + ' ';
  const excluded = [];
  // Pull negated fragments out first, so "not Monday" cannot also register Monday.
  text = text.replace(/\b(?:not|except|excluding)\s+([A-Za-z][A-Za-z,&\s]{0,24})/ig, function(m, frag){
    collectDays(frag).forEach(function(d){ if(excluded.indexOf(d) === -1) excluded.push(d); });
    return ' ';
  });
  let days = collectDays(text);
  if(/\bany\s+day\b/i.test(raw)) days = DAYS.slice();
  if(excluded.length){
    if(!days.length) days = DAYS.slice();   // "not Monday" alone means the other four
    days = days.filter(function(d){ return excluded.indexOf(d) === -1; });
  }
  return {days: days, excluded: excluded};
}

function extractTimes(raw){
  let text = ' ' + String(raw||'').replace(/\n/g, ' ') + ' ';
  const times = [];
  const add = function(t){ if(t && times.indexOf(t) === -1) times.push(t); };
  // 12:30 / 4:30p / 11:30a  — consumed first so the bare-hour pass cannot re-match
  text = text.replace(/\b(\d{1,2}):(\d{2})\s*([ap])?\.?m?\.?\b/ig, function(m,h,mm,ap){
    add(h + ':' + mm + (ap ? ap.toLowerCase() : '')); return ' ';
  });
  // "T at 1145"
  text = text.replace(/\bat\s+(\d{1,2})(\d{2})\b/ig, function(m,h,mm){ add(h + ':' + mm); return ' '; });
  // "@2p", "3 pm"
  text.replace(/@?\s*\b(\d{1,2})\s*([ap])\.?m?\.?\b/ig, function(m,h,ap){ add(h + ap.toLowerCase()); return ' '; });
  return times;
}

function extractPeriod(raw){
  const t = String(raw||'');
  const am = /\bmornings?\b/i.test(t) || /\bbefore\s+lunch\b/i.test(t);
  const pm = /\bafternoons?\b/i.test(t);
  if(am && pm) return null;         // says both; treat as no period hint
  return am ? 'morning' : (pm ? 'afternoon' : null);
}

function extractBound(raw){
  const m = String(raw||'').match(/\b(before|after)\s+(\d{1,2}(?::\d{2})?\s*[ap]?\.?m?)/i);
  return m ? (m[1].toLowerCase() + ' ' + m[2].trim()) : null;
}

function parseNote(note){
  const d = extractDays(note);
  return {
    days: d.days,
    excluded: d.excluded,
    times: extractTimes(note),
    period: extractPeriod(note),
    bound: extractBound(note),
    needsReview: d.excluded.length > 0,   // negation is the easiest thing to get backwards
    source: 'parsed'
  };
}

// Parsed once per book load; overrides are consulted at read time.
const PARSED = (function(){
  const out = {};
  Object.keys(ACCOUNTS).forEach(function(id){ out[id] = parseNote(ACCOUNTS[id].note); });
  return out;
})();

function schedFor(a){
  const o = annotations.schedules[a.id];
  if(o){
    return {days: o.days||[], excluded: [], times: o.times||[], period: o.period||null,
            bound: o.bound||null, needsReview: false, source: 'you'};
  }
  return PARSED[a.id] || {days:[], excluded:[], times:[], period:null, bound:null,
                          needsReview:false, source:'parsed'};
}
function hasWindow(s){ return !!(s.days.length || s.times.length || s.period || s.bound); }
// Empty days means "no known constraint" and never conflicts.
function fitsDay(s, day){ return !s.days.length || s.days.indexOf(day) !== -1; }
function timeLabel(s){
  const bits = [];
  if(s.period) bits.push(s.period === 'morning' ? 'AM' : 'PM');
  if(s.bound) bits.push(s.bound);
  else if(s.times.length) bits.push(s.times.slice(0,2).join('/'));
  return bits.join(' ');
}

// Territory colours are emitted into an inline `--src-color`, so they used to
// be the one part of the palette a host page could not reach at all. They are
// custom properties now, declared on :host alongside everything else, and this
// only maps a territory to which one to use.
//
// Each is used two ways — a 3px card edge, and the .stopno badge fill with
// --on-day text on it — so all six clear 4.8:1 against white.
function terrColor(terr){
  const map = {
    'Hill Country':'var(--terr-hill)',          'North Central Austin':'var(--terr-nca)',
    'North West Austin':'var(--terr-nwa)',      'South Central Austin':'var(--terr-sca)',
    'South West Austin':'var(--terr-swa)',      'Waco/East Austin':'var(--terr-waco)'
  };
  return map[terr] || 'var(--unassigned)';
}

// ---- Card rendering ----
// stop / total are supplied only for cards sitting in a day column.
function cardHTML(a, stop, total){
  const tagStr = a.tags.map(t=>`<span class="tag">${t.split(' ')[0]}</span>`).join('');
  // Never written into `note` — build-book.ps1 regenerates that field, so
  // anything typed here would be lost on the next book import.
  const city = annotations.labels[a.id];
  const cityHTML = city ? `<div class="card-city">${escapeHtml(city)}</div>` : '';
  const noteHTML = a.note ? `<div class="card-note">${escapeHtml(a.note)}</div>` : '';
  const assigned = week.assign[a.id];
  const id = escapeAttr(a.id);
  // Real buttons, not just drag: HTML5 drag-and-drop does not work on touch, and
  // these are the only keyboard-reachable way to sequence a day.
  const ctl = assigned
    ? `<div class="card-ctl">
         <button data-move="${id}" data-dir="-1" title="Earlier in the day" aria-label="Move earlier"${stop===1?' disabled':''}>&#9650;</button>
         <button data-move="${id}" data-dir="1" title="Later in the day" aria-label="Move later"${stop===total?' disabled':''}>&#9660;</button>
         <button class="rm" data-unassign="${id}" title="Remove from day" aria-label="Remove from day">&times;</button>
       </div>`
    : '';
  // Skip lives only on pool cards: a placed account is already a decision, and
  // its top-right corner belongs to the reorder/unassign controls.
  const skipped = !!annotations.skipped[a.id];
  const skipCtl = assigned ? ''
    : (skipped
        ? `<button class="x unskip" data-unskip="${id}" title="Put back in the pool" aria-label="Put back in the pool">&#8630;</button>`
        : `<button class="x" data-skip="${id}" title="Skip — take out of the pool" aria-label="Skip this account">&times;</button>`);
  const stopBadge = assigned ? `<span class="stopno">${stop}</span>` : '';
  const qaRow = !assigned ? `<div class="qa">${DAYS.map(d=>`<button data-d="${d}" data-assign="${id}">${d}</button>`).join('')}</div>` : '';
  const sf = annotations.sfLinks[a.id];

  // Visit window, and whether the day it is sitting on contradicts it.
  const s = schedFor(a);
  const clash = assigned && !fitsDay(s, assigned);
  let schedHTML = '';
  if(hasWindow(s)){
    const dayTxt = (s.days.length && s.days.length < DAYS.length) ? s.days.join('·') : '';
    const tTxt = timeLabel(s);
    const title = 'Visit window' + (s.source === 'you' ? ' (yours)' : ' (read from the note)')
      + (clash ? ' — this stop is on ' + DAYFULL[assigned] : '');
    schedHTML = `<div class="sched${s.source==='you'?' you':''}" title="${escapeAttr(title)}">`
      + (clash ? '⚠ ' : '')
      + (dayTxt ? escapeHtml(dayTxt) : '')
      + (dayTxt && tTxt ? ' ' : '')
      + (tTxt ? `<span class="t">${escapeHtml(tTxt)}</span>` : '')
      + `</div>`;
  }

  return `<div class="card${assigned?' placed':''}${clash?' conflict':''}${skipped?' skipped':''}" draggable="true" data-id="${id}" style="--src-color:${terrColor(a.territories[0])}">
    ${ctl}${skipCtl}
<div class="card-name" title="${escapeAttr(a.name)}">${stopBadge}${escapeHtml(a.name)}</div>
    ${cityHTML}
    ${noteHTML}
    ${schedHTML}
    <div class="card-tags">${tagStr}<span class="terr-mini" title="${escapeAttr(a.territories.join(', '))}">${terrLabel(a)}</span></div>
    <div class="card-actions">
      <a href="${escapeAttr(a.url)}" target="_blank" rel="noopener">View</a>
      <a class="dir" href="${escapeAttr(dirUrl(a))}" target="_blank" rel="noopener">Directions</a>
      ${sf
        ? `<a class="sf" href="${escapeAttr(sf)}" target="_blank" rel="noopener">SF</a><button class="sf-add" data-sfedit="${escapeAttr(a.id)}" title="Edit link">✎</button>`
        : `<button class="sf-add" data-sfedit="${escapeAttr(a.id)}">＋ SF link</button>`}
      <button class="sf-add" data-labeledit="${escapeAttr(a.id)}"${city ? ' title="Edit city"' : ''}>${city ? '✎ city' : '＋ city'}</button>
    </div>
    <div class="sf-pop" data-sfpop="${escapeAttr(a.id)}" style="display:none;">
      <input type="url" placeholder="Paste Salesforce URL" value="${escapeAttr(sf||'')}" data-sfinput="${escapeAttr(a.id)}">
      <button class="save" data-sfsave="${escapeAttr(a.id)}">Save</button>
    </div>
    <div class="sf-pop" data-labelpop="${escapeAttr(a.id)}" style="display:none;">
      <input type="text" maxlength="40" placeholder="Round Rock" value="${escapeAttr(city||'')}" data-labelinput="${escapeAttr(a.id)}">
      <button class="save" data-labelsave="${escapeAttr(a.id)}">Save</button>
    </div>
    ${qaRow}
  </div>`;
}
function escapeHtml(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function escapeAttr(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// ---- Filtering for source list ----
function matchesFilter(a){
  if(view.search){
    const q = view.search.toLowerCase();
    if(!(a.name.toLowerCase().includes(q) || (a.note||'').toLowerCase().includes(q))) return false;
  }
  if(view.activeTags.size){
    for(const t of view.activeTags){ if(a.tags.indexOf(t) === -1) return false; }
  }
  // Accounts with no stated day fit every day, so they stay in the list.
  if(view.fitsDay && !fitsDay(schedFor(a), view.fitsDay)) return false;
  return true;
}

// ---- Render everything ----
function render(){
  const pool = poolAccounts();
  const placed = assignedAccounts();

  // Source (unassigned): only accounts from selected territories, not yet assigned
  const srcEl = root.getElementById('sourceList');
  const unassigned = pool.filter(a=>!week.assign[a.id] && matchesFilter(a));
  // Skipped accounts leave the pool but are not deleted. When revealed they go
  // last, behind everything still in play.
  const skippedList = unassigned.filter(a=>annotations.skipped[a.id]);
  const inPool = unassigned.filter(a=>!annotations.skipped[a.id]);
  const shown = view.showSkipped ? inPool.concat(skippedList) : inPool;

  srcEl.innerHTML = shown.length ? shown.map(a=>cardHTML(a)).join('')
    : (skippedList.length && !view.showSkipped
        ? '<div class="empty">Everything left here is skipped. Show skipped to see it.</div>'
        : '<div class="empty">All accounts in this territory are placed.</div>');
  root.getElementById('srcCount').textContent = inPool.length + ' left';
  renderSkipToggle(skippedList.length);

  // Days: every assigned account, from ANY territory (never wiped by switching)
  const daysEl = root.getElementById('days');
  daysEl.innerHTML = DAYS.map(d=>{
    const inDay = dayAccounts(d);
    const cards = inDay.length
      ? inDay.map((a,i)=>cardHTML(a, i+1, inDay.length)).join('')
      : '<div class="empty">Drop here</div>';
    return `<div class="day" data-day="${d}">
      <div class="day-head"><span class="day-dot"></span><span class="day-name">${DAYFULL[d]}</span><span class="day-n">${inDay.length}</span></div>
      <div class="day-list" data-day="${d}">${cards}</div>
    </div>`;
  }).join('');

  // Progress: placed count across the whole week, and any day clashes
  const clashes = placed.filter(a=>!fitsDay(schedFor(a), week.assign[a.id])).length;
  root.getElementById('progress').innerHTML =
    placed.length + ' placed · ' + inPool.length + ' in pool'
    + (skippedList.length ? ' · ' + skippedList.length + ' skipped' : '')
    + (clashes ? ' · <span class="conflict-pill">' + clashes + ' off-day</span>' : '');

  bindCards();
  saveWeek();
}

/* The toggle only exists when there is something to reveal, or while it is on
   — a chip that always says "0 skipped" is noise on a narrow column. */
function renderSkipToggle(n){
  const row = root.getElementById('skipRow');
  if(!row) return;
  if(!n && !view.showSkipped){ row.innerHTML = ''; return; }
  row.innerHTML = `<span class="chip${view.showSkipped?' on':''}" id="showSkipped">`
    + `Show skipped${n ? ' (' + n + ')' : ''}</span>`;
  row.querySelector('#showSkipped').onclick = ()=>{
    view.showSkipped = !view.showSkipped;
    render();
  };
}

// ---- Interaction ----
let dragId = null;
function bindCards(){
  root.querySelectorAll('.card').forEach(card=>{
    card.addEventListener('dragstart', e=>{
      dragId = card.dataset.id; card.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
    });
    card.addEventListener('dragend', ()=>{ card.classList.remove('dragging'); dragId=null; });
  });
  root.querySelectorAll('[data-assign]').forEach(b=>{
    b.addEventListener('click', e=>{
      e.stopPropagation();
      assignTo(b.dataset.assign, b.dataset.d);
      render();
    });
  });
  root.querySelectorAll('[data-unassign]').forEach(x=>{
    x.addEventListener('click', e=>{
      e.stopPropagation();
      unassign(x.dataset.unassign);
      render();
    });
  });
  root.querySelectorAll('[data-move]').forEach(b=>{
    b.addEventListener('click', e=>{
      e.stopPropagation();
      moveInDay(b.dataset.move, parseInt(b.dataset.dir, 10));
    });
  });
  // SF link: toggle paste box
  root.querySelectorAll('[data-sfedit]').forEach(b=>{
    b.addEventListener('click', e=>{
      e.stopPropagation();
      const id = b.dataset.sfedit;
      const pop = root.querySelector(`[data-sfpop="${cssEsc(id)}"]`);
      if(!pop) return;
      const showing = pop.style.display !== 'none';
      pop.style.display = showing ? 'none' : 'flex';
      if(!showing){ const inp = pop.querySelector('input'); inp.focus(); inp.select(); }
    });
  });
  // SF link: save
  root.querySelectorAll('[data-sfsave]').forEach(b=>{
    b.addEventListener('click', e=>{
      e.stopPropagation();
      setSfLink(b.dataset.sfsave, root.querySelector(`[data-sfinput="${cssEsc(b.dataset.sfsave)}"]`).value);
    });
  });
  // Skip / un-skip. stopPropagation so the click does not also start a drag.
  root.querySelectorAll('[data-skip]').forEach(b=>{
    b.addEventListener('click', e=>{ e.stopPropagation(); setSkipped(b.dataset.skip, true); });
  });
  root.querySelectorAll('[data-unskip]').forEach(b=>{
    b.addEventListener('click', e=>{ e.stopPropagation(); setSkipped(b.dataset.unskip, false); });
  });
  // City label: same three pieces as the SF link above — toggle, save, Enter.
  root.querySelectorAll('[data-labeledit]').forEach(b=>{
    b.addEventListener('click', e=>{
      e.stopPropagation();
      const pop = root.querySelector(`[data-labelpop="${cssEsc(b.dataset.labeledit)}"]`);
      if(!pop) return;
      const showing = pop.style.display !== 'none';
      pop.style.display = showing ? 'none' : 'flex';
      if(!showing){ const inp = pop.querySelector('input'); inp.focus(); inp.select(); }
    });
  });
  root.querySelectorAll('[data-labelsave]').forEach(b=>{
    b.addEventListener('click', e=>{
      e.stopPropagation();
      setLabel(b.dataset.labelsave, root.querySelector(`[data-labelinput="${cssEsc(b.dataset.labelsave)}"]`).value);
    });
  });
  root.querySelectorAll('[data-labelinput]').forEach(inp=>{
    inp.addEventListener('keydown', e=>{
      if(e.key==='Enter'){ e.preventDefault(); setLabel(inp.dataset.labelinput, inp.value); }
    });
    inp.closest('.card').setAttribute('draggable','true');
    inp.addEventListener('mousedown', e=>e.stopPropagation());
  });
  // Enter to save in the paste box; prevent drag from starting on inputs
  root.querySelectorAll('[data-sfinput]').forEach(inp=>{
    inp.addEventListener('keydown', e=>{
      if(e.key==='Enter'){ e.preventDefault(); setSfLink(inp.dataset.sfinput, inp.value); }
    });
    inp.closest('.card').setAttribute('draggable','true');
    inp.addEventListener('mousedown', e=>e.stopPropagation());
  });
}
function setSfLink(id, rawVal){
  const val = (rawVal||'').trim();
  if(val) annotations.sfLinks[id] = val; else delete annotations.sfLinks[id];
  saveAnnotations();
  render();
}
function setSkipped(id, on){
  if(on) annotations.skipped[id] = true; else delete annotations.skipped[id];
  saveAnnotations();
  render();
}
function setLabel(id, rawVal){
  const val = sanitizeLabel(rawVal);
  if(val) annotations.labels[id] = val; else delete annotations.labels[id];
  saveAnnotations();
  render();
}
function cssEsc(s){ return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/["\\]/g,'\\$&'); }

// Where would a drop at this pointer position land? Counts only the cards that
// stay put, so the dragged card's own slot does not skew the index.
function insertIndexAt(zone, clientY){
  const cards = Array.prototype.slice.call(zone.querySelectorAll('.card:not(.dragging)'));
  for(let i = 0; i < cards.length; i++){
    const r = cards[i].getBoundingClientRect();
    if(clientY < r.top + r.height / 2) return i;
  }
  return cards.length;
}

let dropLine = null;
function showDropLine(zone, index){
  if(!dropLine){
    dropLine = document.createElement('div');
    dropLine.className = 'drop-line';
  }
  const cards = Array.prototype.slice.call(zone.querySelectorAll('.card:not(.dragging)'));
  if(index >= cards.length) zone.appendChild(dropLine);
  else zone.insertBefore(dropLine, cards[index]);
}
function hideDropLine(){
  if(dropLine && dropLine.parentNode) dropLine.parentNode.removeChild(dropLine);
}

function setupDropzones(){
  root.addEventListener('dragover', e=>{
    const zone = e.target.closest('.day-list, #sourceList');
    if(!zone || !dragId) return;
    e.preventDefault();
    // The pool has no meaningful order, so only day columns get an insertion line.
    if(zone.dataset.day !== '_src') showDropLine(zone, insertIndexAt(zone, e.clientY));
  });
  root.addEventListener('dragenter', e=>{
    const zone = e.target.closest('.day-list, #sourceList');
    if(zone) zone.classList.add('dragover');
  });
  root.addEventListener('dragleave', e=>{
    const zone = e.target.closest('.day-list, #sourceList');
    if(zone && !zone.contains(e.relatedTarget)){
      zone.classList.remove('dragover');
      hideDropLine();
    }
  });
  root.addEventListener('drop', e=>{
    const zone = e.target.closest('.day-list, #sourceList');
    if(!zone || !dragId) return;
    e.preventDefault();
    zone.classList.remove('dragover');
    const day = zone.dataset.day;
    const index = (day === '_src') ? null : insertIndexAt(zone, e.clientY);
    hideDropLine();
    if(day === '_src') unassign(dragId);
    else assignTo(dragId, day, index);
    render();
  });
  // A drag abandoned outside any column must not leave the line behind.
  root.addEventListener('dragend', hideDropLine);
}

// ---- Controls ----
function buildControls(){
  const pSel = root.getElementById('primarySel');
  const fSel = root.getElementById('followSel');
  pSel.innerHTML = TERRITORIES.map(t=>`<option ${t===week.primary?'selected':''}>${t}</option>`).join('');
  fSel.innerHTML = '<option>(none)</option>' + TERRITORIES.map(t=>`<option ${t===week.follow?'selected':''}>${t}</option>`).join('');
  pSel.onchange = ()=>{ week.primary=pSel.value; render(); };
  fSel.onchange = ()=>{ week.follow=fSel.value; render(); };
  const t25 = root.getElementById('top25only');
  t25.checked = week.top25only;
  t25.onchange = e=>{ week.top25only=e.target.checked; render(); };

  // Which book is live, and how big it is. A stale imported book would otherwise
  // be invisible once import lands.
  const pill = root.getElementById('bookPill');
  const n = Object.keys(ACCOUNTS).length;
  pill.textContent = n + ' accounts · ' + BOOK.__source;
  pill.title = 'Account book source: ' + BOOK.__source
    + (BOOK.generated ? '\nGenerated: ' + BOOK.generated : '')
    + '\nRegenerate with tools\\build-book.ps1';

  // Filter chips
  const fEl = root.getElementById('filters');
  fEl.innerHTML = ALLTAGS.map(t=>`<span class="chip" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</span>`).join('');
  fEl.querySelectorAll('.chip').forEach(c=>{
    c.onclick = ()=>{
      const t = c.dataset.tag;
      if(view.activeTags.has(t)){ view.activeTags.delete(t); c.classList.remove('on'); }
      else { view.activeTags.add(t); c.classList.add('on'); }
      render();
    };
  });

  root.getElementById('search').oninput = e=>{ view.search=e.target.value; render(); };

  // "Fits" day filter — single select, click again to clear.
  const fitsRow = root.getElementById('fitsRow');
  DAYS.forEach(d=>{
    const b = document.createElement('button');
    b.textContent = d;
    b.onclick = ()=>{
      view.fitsDay = (view.fitsDay === d) ? null : d;
      fitsRow.querySelectorAll('button').forEach(x=>x.classList.toggle('on', x.textContent === view.fitsDay));
      render();
    };
    fitsRow.appendChild(b);
  });

  // Reset: two-step inline confirm (sandbox blocks confirm()).
  // Clears the week only — Salesforce links live in the annotations store and stay.
  let resetArmed = false, resetTimer = null;
  const resetBtn = root.getElementById('resetBtn');
  resetBtn.title = 'Clears this week\u2019s day assignments. Salesforce links are kept.';
  resetBtn.onclick = ()=>{
    if(!resetArmed){
      resetArmed = true;
      resetBtn.textContent = 'Tap again to clear week';
      resetTimer = setTimeout(()=>{ resetArmed=false; resetBtn.textContent='Reset'; }, 3000);
    } else {
      clearTimeout(resetTimer); resetArmed=false; resetBtn.textContent='Reset';
      week.assign = {}; week.orphanAssign = {}; week.order = {}; render();
    }
  };

  root.getElementById('exportBtn').onclick = exportLists;
  root.getElementById('planClose').onclick = ()=>{ root.getElementById('planModal').style.display='none'; };
  root.getElementById('planCopy').onclick = tryCopyPlan;
  root.getElementById('planModal').addEventListener('click', e=>{
    if(e.target.id==='planModal') e.target.style.display='none';
  });
}

function exportLists(){
  let out = [];
  DAYS.forEach(d=>{
    const inDay = dayAccounts(d);   // in drive order, not assignment order
    if(!inDay.length) return;
    out.push(DAYFULL[d].toUpperCase());
    inDay.forEach((a,i)=>{
      let line = '  ' + (i+1) + '. ' + a.name;
      // The label goes on the name line, not into the note: with seven
      // accounts sharing a name the printed plan is unreadable without it.
      if(annotations.labels[a.id]) line += ' — ' + annotations.labels[a.id];
      if(a.note) line += '  ('+a.note.replace(/\n/g,' ')+')';
      out.push(line);
      out.push('    Map: ' + a.url);
      if(annotations.sfLinks[a.id]) out.push('    SF:  ' + annotations.sfLinks[a.id]);
    });
    out.push('');
  });
  // Salesforce links, keyed by place ID so this block can be re-imported exactly
  // even if names change. (The importer itself is the next piece of work.)
  const sfEntries = Object.keys(annotations.sfLinks);
  if(sfEntries.length){
    out.push('--- SALESFORCE LINKS (keep this block to restore) ---');
    sfEntries.forEach(id=>{
      const a = ACCOUNTS[id];
      out.push((a ? a.name : '(unknown)') + ' :: ' + id + ' :: ' + annotations.sfLinks[id]);
    });
  }
  const text = out.join('\n') || 'Nothing assigned yet.';
  const ta = root.getElementById('planText');
  ta.value = text;
  root.getElementById('planModal').style.display = 'flex';
  root.getElementById('planCopyMsg').textContent = '';
  // pre-select for easy manual copy
  ta.focus(); ta.select();
}

function tryCopyPlan(){
  const ta = root.getElementById('planText');
  ta.focus(); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch(e){ ok = false; }
  if(!ok && navigator.clipboard){
    navigator.clipboard.writeText(ta.value).then(
      ()=>{ root.getElementById('planCopyMsg').textContent = 'Copied ✓'; },
      ()=>{ root.getElementById('planCopyMsg').textContent = 'Press ⌘/Ctrl-C to copy'; }
    );
    return;
  }
  root.getElementById('planCopyMsg').textContent = ok ? 'Copied ✓' : 'Press ⌘/Ctrl-C to copy';
}

/* =====================================================================
   IMPORT / EXPORT

   Two accepted shapes:
     1. a generated book  { version, accounts, territoryOrder }
     2. a raw territory list { "Territory": [[name, note, mapUrl, [tags]]] }
        straight out of Google Lists — converted here.

   Shape 2 deliberately mirrors tools/build-book.ps1 so the board is usable
   without running anything. If you change the merge rules, change both.
   ===================================================================== */

const PLACE_ID_RE = /^0x[0-9a-f]+:0x[0-9a-f]+$/i;
function placeIdFromUrl(u){
  const m = String(u||'').match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return m ? m[1] : null;
}
// Imported data is not authored by us: anything that ends up in an href must be
// a real web URL, never javascript: or data:.
function isHttpUrl(u){
  try { const p = new URL(String(u)); return p.protocol === 'http:' || p.protocol === 'https:'; }
  catch(e){ return false; }
}

function normalizeLegacy(obj){
  const problems = [];
  const accounts = {};
  const territoryOrder = {};
  Object.keys(obj).forEach(terr=>{
    const rows = obj[terr];
    if(!Array.isArray(rows)){ problems.push('"'+terr+'" is not a list of rows — skipped.'); return; }
    const ids = [];
    rows.forEach((row,i)=>{
      if(!Array.isArray(row) || row.length < 3){
        problems.push('['+terr+'] row '+i+': not a [name, note, url, tags] array — skipped.');
        return;
      }
      const name = String(row[0]==null?'':row[0]);
      const note = String(row[1]==null?'':row[1]);
      const url  = String(row[2]==null?'':row[2]);
      const tags = Array.isArray(row[3]) ? row[3].map(String) : [];
      if(!isHttpUrl(url)){
        problems.push('['+terr+'] row '+i+' ('+(name||'unnamed')+'): map URL is not http(s) — skipped.');
        return;
      }
      const id = placeIdFromUrl(url);
      if(!id){
        problems.push('['+terr+'] row '+i+' ('+(name||'unnamed')+'): no Google place ID in URL — skipped.');
        return;
      }
      if(accounts[id]){
        const ex = accounts[id];
        if(ex.territories.indexOf(terr) === -1) ex.territories.push(terr);
        if(!ex.note && note) ex.note = note;
        tags.forEach(t=>{ if(ex.tags.indexOf(t) === -1) ex.tags.push(t); });
      } else {
        accounts[id] = {id:id, name:name, url:url, note:note, tags:tags, territories:[terr]};
      }
      ids.push(id);
    });
    territoryOrder[terr] = ids;
  });
  return {
    book: {version:2, generated:new Date().toISOString(), source:'imported territory list',
           accounts:accounts, territoryOrder:territoryOrder},
    problems: problems
  };
}

function validateBook(obj){
  const problems = [];
  if(!obj.accounts || typeof obj.accounts !== 'object') throw new Error('Missing "accounts".');
  if(!obj.territoryOrder || typeof obj.territoryOrder !== 'object') throw new Error('Missing "territoryOrder".');
  const accounts = {};
  Object.keys(obj.accounts).forEach(id=>{
    const a = obj.accounts[id];
    if(!a || typeof a !== 'object'){ problems.push(id+': not an object — skipped.'); return; }
    if(!PLACE_ID_RE.test(id)){ problems.push(id+': not a Google place ID — skipped.'); return; }
    if(!isHttpUrl(a.url)){ problems.push((a.name||id)+': map URL is not http(s) — skipped.'); return; }
    accounts[id] = {
      id: id,
      name: String(a.name==null?'':a.name),
      url: String(a.url),
      note: String(a.note==null?'':a.note),
      tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
      territories: Array.isArray(a.territories) && a.territories.length
        ? a.territories.map(String) : ['(unfiled)']
    };
  });
  const territoryOrder = {};
  Object.keys(obj.territoryOrder).forEach(terr=>{
    const ids = obj.territoryOrder[terr];
    if(!Array.isArray(ids)){ problems.push('territoryOrder["'+terr+'"] is not a list — skipped.'); return; }
    const kept = ids.filter(id=>accounts[id]);
    const lost = ids.length - kept.length;
    if(lost) problems.push('territoryOrder["'+terr+'"]: '+lost+' id(s) have no matching account — dropped.');
    territoryOrder[terr] = kept;
  });
  // An account present but in no territory list would be invisible; file it so it
  // is at least reachable.
  const listed = {};
  Object.keys(territoryOrder).forEach(t=>territoryOrder[t].forEach(id=>listed[id]=1));
  const unlisted = Object.keys(accounts).filter(id=>!listed[id]);
  if(unlisted.length){
    problems.push(unlisted.length+' account(s) were in "accounts" but in no territory list — filed under "(unfiled)".');
    territoryOrder['(unfiled)'] = unlisted;
  }
  if(!Object.keys(accounts).length) throw new Error('No usable accounts found.');
  return {
    book: {version:2, generated: obj.generated || new Date().toISOString(),
           source: obj.source || 'imported', accounts:accounts, territoryOrder:territoryOrder},
    problems: problems
  };
}

function parseBookText(text){
  let obj;
  try { obj = JSON.parse(text); }
  catch(e){ throw new Error('Not valid JSON: ' + e.message); }
  if(!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Expected a JSON object.');
  if(obj.accounts && obj.territoryOrder) return validateBook(obj);
  const looksLegacy = Object.keys(obj).length &&
    Object.keys(obj).every(k=>Array.isArray(obj[k]));
  if(looksLegacy){
    const parsed = normalizeLegacy(obj);
    // Every row rejected: refuse rather than let Apply install an empty book.
    if(!Object.keys(parsed.book.accounts).length){
      throw new Error('No usable accounts found — all ' + parsed.problems.length +
        ' row(s) were rejected. First: ' + (parsed.problems[0] || 'unknown reason'));
    }
    return parsed;
  }
  throw new Error('Unrecognised shape. Expected a generated book (with "accounts" and "territoryOrder") or a territory list of rows.');
}

function diffBook(next){
  const cur = ACCOUNTS;
  const sig = a => JSON.stringify([a.name, a.note, a.url, a.tags.slice().sort(), a.territories.slice().sort()]);
  const added=[], updated=[], removed=[];
  Object.keys(next.accounts).forEach(id=>{
    if(!cur[id]) added.push(next.accounts[id]);
    else if(sig(cur[id]) !== sig(next.accounts[id])) updated.push(next.accounts[id]);
  });
  Object.keys(cur).forEach(id=>{ if(!next.accounts[id]) removed.push(cur[id]); });
  const lostAssign = removed.filter(a=>week.assign[a.id]);
  const lostSf     = removed.filter(a=>annotations.sfLinks[a.id]);
  return {added:added, updated:updated, removed:removed, lostAssign:lostAssign, lostSf:lostSf};
}

function listSample(items, n){
  const names = items.slice(0, n).map(a=>'<li>'+escapeHtml(a.name)+'</li>').join('');
  const more = items.length > n ? '<li>… and '+(items.length-n)+' more</li>' : '';
  return items.length ? '<ul>'+names+more+'</ul>' : '';
}

let pendingBook = null;
function showBookPreview(parsed){
  const d = diffBook(parsed.book);
  pendingBook = parsed.book;
  const total = Object.keys(parsed.book.accounts).length;
  let h = '<div><b>'+total+'</b> accounts in the imported book.</div>'
        + '<div class="add">+ '+d.added.length+' new</div>' + listSample(d.added,5)
        + '<div class="upd">~ '+d.updated.length+' changed</div>' + listSample(d.updated,5)
        + '<div class="del">− '+d.removed.length+' no longer present</div>' + listSample(d.removed,5);
  if(d.lostAssign.length || d.lostSf.length){
    h += '<div class="danger" style="margin-top:8px;">'
      +  d.lostAssign.length+' removed account(s) are on this week’s board and '
      +  d.lostSf.length+' have a Salesforce link.</div>'
      +  '<div style="margin-top:4px;">They will disappear from the board, but their assignments and links are '
      +  'kept in storage — reverting or re-importing brings them back.</div>';
  }
  if(parsed.problems.length){
    h += '<div class="del" style="margin-top:8px;">'+parsed.problems.length+' row(s) were skipped:</div><ul>'
      +  parsed.problems.slice(0,8).map(p=>'<li>'+escapeHtml(p)+'</li>').join('')
      +  (parsed.problems.length>8 ? '<li>… and '+(parsed.problems.length-8)+' more</li>' : '')
      +  '</ul>';
  }
  const el = root.getElementById('bookPreview');
  el.innerHTML = h; el.style.display = 'block';
  root.getElementById('bookApplyRow').style.display = 'flex';
}

function clearBookPreview(){
  pendingBook = null;
  root.getElementById('bookPreview').style.display = 'none';
  root.getElementById('bookApplyRow').style.display = 'none';
}

function tryBookText(text){
  const msg = root.getElementById('bookMsg');
  msg.textContent = ''; msg.className = 'msg';
  try {
    showBookPreview(parseBookText(text));
  } catch(e){
    clearBookPreview();
    msg.textContent = e.message; msg.className = 'msg err';
  }
}

// ---- Annotations import ----
let pendingAnn = null;
function parseAnnText(text){
  let obj;
  try { obj = JSON.parse(text); } catch(e){ throw new Error('Not valid JSON: ' + e.message); }
  if(!obj || typeof obj !== 'object') throw new Error('Expected a JSON object.');
  // A bare {id: url} map is still accepted; the fuller form carries schedules too.
  const src = (obj.sfLinks && typeof obj.sfLinks === 'object') ? obj.sfLinks
            : (obj.schedules ? {} : obj);
  const links = {}; const problems = [];
  Object.keys(src).forEach(id=>{
    const v = src[id];
    if(typeof v !== 'string'){ problems.push(id+': value is not a string — skipped.'); return; }
    if(!PLACE_ID_RE.test(id)){ problems.push(id+': not a Google place ID — skipped.'); return; }
    if(!isHttpUrl(v)){ problems.push(id+': link is not http(s) — skipped.'); return; }
    links[id] = v;
  });
  const schedules = {};
  if(obj.schedules && typeof obj.schedules === 'object'){
    Object.keys(obj.schedules).forEach(id=>{
      if(!PLACE_ID_RE.test(id)){ problems.push(id+': not a Google place ID — skipped.'); return; }
      const s = sanitizeSchedule(obj.schedules[id]);
      if(s) schedules[id] = s; else problems.push(id+': not a usable visit window — skipped.');
    });
  }
  // City labels. Read here because annForExport writes them — exporting a
  // field the importer drops would lose them on the restore it exists for.
  const labels = {};
  if(obj.labels && typeof obj.labels === 'object'){
    Object.keys(obj.labels).forEach(id=>{
      if(!PLACE_ID_RE.test(id)){ problems.push(id+': not a Google place ID — skipped.'); return; }
      const v = sanitizeLabel(obj.labels[id]);
      if(v) labels[id] = v; else problems.push(id+': label is not usable text — skipped.');
    });
  }
  // Skipped set. Same reason as labels: annForExport writes it, so the restore
  // path has to read it back.
  const skipped = {};
  if(obj.skipped && typeof obj.skipped === 'object'){
    Object.keys(obj.skipped).forEach(id=>{
      if(!obj.skipped[id]) return;
      if(!PLACE_ID_RE.test(id)){ problems.push(id+': not a Google place ID — skipped.'); return; }
      skipped[id] = true;
    });
  }
  if(!Object.keys(links).length && !Object.keys(schedules).length
     && !Object.keys(labels).length && !Object.keys(skipped).length){
    throw new Error('No usable Salesforce links, visit windows, city labels or skips found.');
  }
  return {links:links, schedules:schedules, labels:labels, skipped:skipped, problems:problems};
}
function showAnnPreview(parsed){
  pendingAnn = parsed;
  const cur = Object.assign({}, annotations.orphanSfLinks, annotations.sfLinks);
  const added=[], changed=[];
  Object.keys(parsed.links).forEach(id=>{
    if(!cur[id]) added.push(id);
    else if(cur[id] !== parsed.links[id]) changed.push(id);
  });
  const nameOf = id => ACCOUNTS[id] ? ACCOUNTS[id].name : id + ' (not in current book)';
  const schedN = Object.keys(parsed.schedules).length;
  const labelN = Object.keys(parsed.labels || {}).length;
  const skipN  = Object.keys(parsed.skipped || {}).length;
  let h = '<div class="add">+ '+added.length+' new link(s)</div>'
        + listSample(added.map(id=>({name:nameOf(id)})),5)
        + '<div class="upd">~ '+changed.length+' link(s) would be replaced</div>'
        + listSample(changed.map(id=>({name:nameOf(id)})),5)
        + (schedN ? '<div class="upd">~ '+schedN+' visit window override(s)</div>' : '')
        + (labelN ? '<div class="upd">~ '+labelN+' city label(s)</div>' : '')
        + (skipN ? '<div class="upd">~ '+skipN+' skipped account(s)</div>' : '');
  if(parsed.problems.length){
    h += '<div class="del" style="margin-top:8px;">'+parsed.problems.length+' entr(ies) skipped:</div><ul>'
      +  parsed.problems.slice(0,6).map(p=>'<li>'+escapeHtml(p)+'</li>').join('')+'</ul>';
  }
  const el = root.getElementById('annPreview');
  el.innerHTML = h; el.style.display='block';
  root.getElementById('annApplyRow').style.display='flex';
}
function clearAnnPreview(){
  pendingAnn = null;
  root.getElementById('annPreview').style.display='none';
  root.getElementById('annApplyRow').style.display='none';
}
function tryAnnText(text){
  const msg = root.getElementById('annMsg');
  msg.textContent=''; msg.className='msg';
  try { showAnnPreview(parseAnnText(text)); }
  catch(e){ clearAnnPreview(); msg.textContent=e.message; msg.className='msg err'; }
}

// ---- Shared helpers ----
function bookForExport(){
  return JSON.stringify({
    version: 2,
    generated: BOOK.generated || new Date().toISOString(),
    source: BOOK.__source || 'route-board',
    accounts: ACCOUNTS,
    territoryOrder: BOOK.territoryOrder
  }, null, 2);
}
function annForExport(){
  return JSON.stringify({
    sfLinks:   Object.assign({}, annotations.orphanSfLinks, annotations.sfLinks),
    labels:    Object.assign({}, annotations.orphanLabels, annotations.labels),
    skipped:   Object.assign({}, annotations.orphanSkipped, annotations.skipped),
    schedules: Object.assign({}, annotations.orphanSchedules, annotations.schedules)
  }, null, 2);
}
function copyText(text, msgEl){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position='fixed'; ta.style.left='-9999px';
  document.body.appendChild(ta); ta.focus(); ta.select();
  let ok=false;
  try { ok = document.execCommand('copy'); } catch(e){ ok=false; }
  document.body.removeChild(ta);
  if(!ok && navigator.clipboard){
    navigator.clipboard.writeText(text).then(
      ()=>{ msgEl.textContent='Copied ✓'; msgEl.className='msg ok'; },
      ()=>{ msgEl.textContent='Could not copy — use Download instead.'; msgEl.className='msg err'; }
    );
    return;
  }
  msgEl.textContent = ok ? 'Copied ✓' : 'Could not copy — use Download instead.';
  msgEl.className = ok ? 'msg ok' : 'msg err';
}
function downloadText(filename, text, msgEl){
  try {
    const blob = new Blob([text], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    msgEl.textContent = 'Saved ' + filename; msgEl.className = 'msg ok';
  } catch(e){
    msgEl.textContent = 'Download blocked here — use Copy instead.'; msgEl.className = 'msg err';
  }
}
function readFileInto(input, handler, msgEl){
  const f = input.files && input.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = ()=>handler(String(r.result));
  r.onerror = ()=>{ msgEl.textContent='Could not read that file.'; msgEl.className='msg err'; };
  r.readAsText(f);
  input.value = '';   // let the same file be picked again
}

/* ---- Visit-window review list -------------------------------------
   Only accounts that have a note appear: an account with no note has
   nothing to have got wrong. */
let winFilter = 'all';
function windowRows(){
  return Object.keys(ACCOUNTS)
    .filter(id=>ACCOUNTS[id].note)
    .map(id=>({a:ACCOUNTS[id], s:schedFor(ACCOUNTS[id]), parsed:PARSED[id]}))
    .filter(r=>{
      if(winFilter === 'review') return r.parsed.needsReview;
      if(winFilter === 'edited') return r.s.source === 'you';
      return true;
    })
    .sort((x,y)=>x.a.name.localeCompare(y.a.name));
}
function renderWindowList(){
  const rows = windowRows();
  const el = root.getElementById('winList');
  if(!rows.length){ el.innerHTML = '<div class="empty">Nothing here.</div>'; return; }
  el.innerHTML = rows.map(r=>{
    const id = escapeAttr(r.a.id);
    const edited = r.s.source === 'you';
    const dayBtns = DAYS.map(d=>
      `<button class="d${r.s.days.indexOf(d)!==-1?' on':''}" data-wd="${id}" data-d="${d}">${d}</button>`).join('');
    const timeVal = r.s.bound || r.s.times.join(' ') || (r.s.period === 'morning' ? 'AM' : r.s.period === 'afternoon' ? 'PM' : '');
    return `<div class="win-row${edited?' edited':''}${(!edited && r.parsed.needsReview)?' review':''}">
      <div class="win-name">${escapeHtml(r.a.name)}</div>
      <div class="win-note">${escapeHtml(r.a.note)}</div>
      <div class="win-ctl">
        ${dayBtns}
        <input type="text" value="${escapeAttr(timeVal)}" data-wt="${id}" placeholder="time" title="Free text, e.g. 12:30 or AM">
        ${edited ? `<button class="reset" data-wr="${id}" title="Go back to what the note says">Reset</button>` : ''}
        ${(!edited && r.parsed.needsReview) ? '<span class="win-flag">check "not"</span>' : ''}
      </div>
    </div>`;
  }).join('');

  // Editing any control promotes the row to an override, seeded from what is shown.
  const currentOverride = id=>annotations.schedules[id]
    || (function(){ const p = PARSED[id];
         return {days:p.days.slice(), times:p.times.slice(), period:p.period, bound:p.bound}; })();

  el.querySelectorAll('[data-wd]').forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.wd, d = b.dataset.d;
      const o = currentOverride(id);
      const i = o.days.indexOf(d);
      if(i === -1) o.days.push(d); else o.days.splice(i,1);
      o.days = DAYS.filter(x=>o.days.indexOf(x) !== -1);
      annotations.schedules[id] = sanitizeSchedule(o);
      saveAnnotations(); renderWindowList(); refreshWindowStatus(); render();
    };
  });
  el.querySelectorAll('[data-wt]').forEach(inp=>{
    inp.onchange = ()=>{
      const id = inp.dataset.wt;
      const o = currentOverride(id);
      const v = inp.value.trim();
      o.period = /^am$/i.test(v) ? 'morning' : /^pm$/i.test(v) ? 'afternoon' : null;
      o.bound = /^(before|after)\b/i.test(v) ? v : null;
      o.times = (o.period || o.bound || !v) ? [] : v.split(/[\s,\/]+/).filter(Boolean).slice(0,4);
      annotations.schedules[id] = sanitizeSchedule(o);
      saveAnnotations(); refreshWindowStatus(); render();
    };
  });
  el.querySelectorAll('[data-wr]').forEach(b=>{
    b.onclick = ()=>{
      delete annotations.schedules[b.dataset.wr];
      saveAnnotations(); renderWindowList(); refreshWindowStatus(); render();
    };
  });
}
function refreshWindowStatus(){
  const noted = Object.keys(ACCOUNTS).filter(id=>ACCOUNTS[id].note);
  const withDays = noted.filter(id=>schedFor(ACCOUNTS[id]).days.length).length;
  const review = noted.filter(id=>PARSED[id].needsReview && !annotations.schedules[id]).length;
  const edited = Object.keys(annotations.schedules).length;
  root.getElementById('winStatus').innerHTML =
    '<b>' + noted.length + '</b> account(s) have a note; <b>' + withDays + '</b> yielded specific days'
    + (review ? '; <b>' + review + '</b> need a look' : '')
    + (edited ? '; <b>' + edited + '</b> corrected by you' : '') + '.';
}

function buildDataPanel(){
  const modal   = root.getElementById('dataModal');
  const bookMsg = root.getElementById('bookMsg');
  const annMsg  = root.getElementById('annMsg');

  function refreshStatus(){
    if(!HAS_BOOK){
      /* Deliberately does not mention build-book.ps1 as the fix. On a deployed
         site there is no project folder to run it in, and this panel — which
         is open right now — is the actual way through. */
      root.getElementById('bookStatus').innerHTML =
        '<b>No account book loaded.</b> Nothing is lost; the book is disposable and lives '
        + 'only in this browser. Paste one in below to get started — press <b>Paste JSON</b> '
        + 'and give it either a generated <code>accounts.json</code> or a raw Google Lists '
        + 'territory export. To produce one, run <code>tools/build-book.ps1</code> locally and '
        + 'use this panel’s <b>Copy current book</b> button there.';
      return;
    }
    root.getElementById('bookStatus').innerHTML =
      'Live book: <b>' + Object.keys(ACCOUNTS).length + '</b> accounts across <b>'
      + TERRITORIES.length + '</b> territories, loaded from <b>' + escapeHtml(BOOK.__source) + '</b>'
      + (BOOK.generated ? ' (generated ' + escapeHtml(String(BOOK.generated).slice(0,19).replace('T',' ')) + ')' : '') + '.';
    const orphanN = Object.keys(annotations.orphanSfLinks).length;
    root.getElementById('annStatus').innerHTML =
      '<b>' + Object.keys(annotations.sfLinks).length + '</b> link(s) on accounts in the current book'
      + (orphanN ? ', plus <b>' + orphanN + '</b> held for accounts not in it' : '') + '.';
  }

  root.getElementById('dataBtn').onclick = ()=>{
    refreshStatus(); refreshWindowStatus(); renderWindowList();
    bookMsg.textContent=''; annMsg.textContent='';
    clearBookPreview(); clearAnnPreview();
    modal.style.display='flex';
  };
  [['winAll','all'],['winReview','review'],['winEdited','edited']].forEach(pair=>{
    root.getElementById(pair[0]).onclick = ()=>{ winFilter = pair[1]; renderWindowList(); };
  });
  root.getElementById('dataClose').onclick = ()=>{ modal.style.display='none'; };
  modal.addEventListener('click', e=>{ if(e.target.id==='dataModal') modal.style.display='none'; });

  // Book
  root.getElementById('bookFile').onchange = e=>readFileInto(e.target, tryBookText, bookMsg);
  root.getElementById('bookPasteToggle').onclick = ()=>{
    const ta = root.getElementById('bookPaste');
    const on = ta.style.display === 'none';
    ta.style.display = on ? 'block' : 'none';
    root.getElementById('bookPasteRow').style.display = on ? 'flex' : 'none';
    if(on) ta.focus();
  };
  root.getElementById('bookPreviewBtn').onclick = ()=>tryBookText(root.getElementById('bookPaste').value);
  root.getElementById('bookCancel').onclick = ()=>{ clearBookPreview(); bookMsg.textContent=''; };
  root.getElementById('bookCopy').onclick = ()=>copyText(bookForExport(), bookMsg);
  root.getElementById('bookDownload').onclick = ()=>downloadText('accounts.json', bookForExport(), bookMsg);
  root.getElementById('bookApply').onclick = ()=>{
    if(!pendingBook) return;
    if(!lsSet(STORE.book, JSON.stringify(pendingBook))){
      bookMsg.textContent = 'Storage unavailable — import cannot be saved here.';
      bookMsg.className = 'msg err';
      return;
    }
    remount();
  };

  // Reverting is destructive-ish, so make it a two-step like Reset.
  let revertArmed = false, revertTimer = null;
  const revertBtn = root.getElementById('bookRevert');
  revertBtn.onclick = ()=>{
    if(!revertArmed){
      revertArmed = true;
      revertBtn.textContent = 'Tap again to discard imported book';
      revertTimer = setTimeout(()=>{ revertArmed=false; revertBtn.textContent='Revert to built-in'; }, 3000);
      return;
    }
    clearTimeout(revertTimer); revertArmed=false;
    try { localStorage.removeItem(STORE.book); } catch(e){}
    remount();
  };

  // Annotations
  root.getElementById('annFile').onchange = e=>readFileInto(e.target, tryAnnText, annMsg);
  root.getElementById('annPasteToggle').onclick = ()=>{
    const ta = root.getElementById('annPaste');
    const on = ta.style.display === 'none';
    ta.style.display = on ? 'block' : 'none';
    root.getElementById('annPasteRow').style.display = on ? 'flex' : 'none';
    if(on) ta.focus();
  };
  root.getElementById('annPreviewBtn').onclick = ()=>tryAnnText(root.getElementById('annPaste').value);
  root.getElementById('annCancel').onclick = ()=>{ clearAnnPreview(); annMsg.textContent=''; };
  root.getElementById('annCopy').onclick = ()=>copyText(annForExport(), annMsg);
  root.getElementById('annDownload').onclick = ()=>downloadText('salesforce-links.json', annForExport(), annMsg);
  root.getElementById('annApply').onclick = ()=>{
    if(!pendingAnn) return;
    Object.keys(pendingAnn.links).forEach(id=>{
      if(ACCOUNTS[id]) annotations.sfLinks[id] = pendingAnn.links[id];
      else annotations.orphanSfLinks[id] = pendingAnn.links[id];
    });
    Object.keys(pendingAnn.schedules).forEach(id=>{
      if(ACCOUNTS[id]) annotations.schedules[id] = pendingAnn.schedules[id];
      else annotations.orphanSchedules[id] = pendingAnn.schedules[id];
    });
    Object.keys(pendingAnn.labels || {}).forEach(id=>{
      if(ACCOUNTS[id]) annotations.labels[id] = pendingAnn.labels[id];
      else annotations.orphanLabels[id] = pendingAnn.labels[id];
    });
    Object.keys(pendingAnn.skipped || {}).forEach(id=>{
      if(ACCOUNTS[id]) annotations.skipped[id] = true;
      else annotations.orphanSkipped[id] = true;
    });
    saveAnnotations();
    clearAnnPreview();
    annMsg.textContent = 'Applied.'; annMsg.className = 'msg ok';
    refreshStatus(); refreshWindowStatus(); renderWindowList();
    render();
  };
}

// ---- Init ----
buildControls();
buildDataPanel();
setupDropzones();
render();

/* With no book, land straight in the Data panel rather than on an empty board
   with no hint of what to do. Uses the real button so the panel goes through
   exactly the same setup it would on a click. */
if(!HAS_BOOK) root.getElementById('dataBtn').click();

  return {
    root: root,
    remount: remount,
    render: render,
    getWeek: function(){ return JSON.parse(JSON.stringify(week)); }
  };
}

global.RouteBoard = { mount: mount };

})(typeof window !== 'undefined' ? window : this);
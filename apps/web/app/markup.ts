// Ported verbatim from terraplan.html. Behaviour lives in public/terraplan.js.
export const markup = `
<!-- LANDING -->
<div id="land">
<canvas id="land-gl" aria-hidden="true"></canvas>
<div class="land-veil" aria-hidden="true"></div>
<header class="land-nav">
  <div class="land-nav-inner">
    <a class="logo land-mark" href="/"><span class="t">terra</span><span class="p">plan</span></a>
    <div class="land-nav-right auth-btns" id="si1">
      <a class="gbtn land-cta" data-provider="google" href="/api/v1/auth/google"><svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>Sign in with Google</a>
    </div>
  </div>
</header>
<section class="land-stage">
  <div class="land-copy">
    <p class="land-kicker">Review the plan, not the guess.</p>
    <h1 class="land-h">Plan your pull request.<br>Skip the queue.</h1>
    <p class="land-lead">Open a PR and get a plan posted automatically. Apply when ready — with environment locks and approvals built in, no DevOps ticket required.</p>
  </div>
  <div class="land-visual" aria-hidden="true">
    <div class="mac-term">
      <div class="mac-bar">
        <span class="mac-dot r"></span><span class="mac-dot y"></span><span class="mac-dot g"></span>
        <span class="mac-title">zsh — terraform-plan</span>
      </div>
      <pre class="mac-body" id="mac-body"><code id="mac-code"></code></pre>
    </div>
  </div>
</section>
</div>

<!-- Post-login brand intro -->
<div id="brand-splash" class="hide" aria-hidden="true">
  <div class="brand-splash-inner">
    <div class="brand-splash-mark" aria-label="terraplan">
      <span class="t"><i>t</i><i>e</i><i>r</i><i>r</i><i>a</i></span><span class="p"><i>p</i><i>l</i><i>a</i><i>n</i></span>
    </div>
  </div>
</div>

<!-- DASHBOARD -->
<div id="dash" class="hide">
<div class="top"><div class="brand"><div class="logo"><span class="t">terra</span><span class="p">plan</span></div></div><div class="s" role="search"><svg class="icn" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><span>Search</span><kbd>⌥S</kbd></div><div class="sp"></div>
<div class="tb">
<div class="mw"><button class="ib" type="button" aria-label="CloudShell" title="CloudShell"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m7 10 2.5 2L7 14M12 14h5"/></svg></button></div>
<div class="mw"><button class="ib" data-menu="mH" aria-haspopup="true" aria-expanded="false" aria-label="Documentation"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg></button><div class="mn hide" id="mH" role="menu"><div class="mh">Documentation</div><a href="#" role="menuitem">Getting started</a><a href="#" role="menuitem">Run a plan on your branch</a><a href="#" role="menuitem">State locks and the queue</a><a href="#" role="menuitem">Approvals and roles</a><a href="#" role="menuitem">Connect Bitbucket</a></div></div>
<div class="mw"><button class="ib" data-menu="mN" aria-haspopup="true" aria-expanded="false" aria-label="Notifications"><svg viewBox="0 0 24 24"><path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/></svg><i class="nb hide" id="nb">0</i></button><div class="mn hide" id="mN" role="menu"><div class="mh">Notifications<a class="tl" id="mr" href="#">Mark all as read</a></div>
<div id="mN-list"><div class="ni"><div><b>No notifications</b><span>Run events will appear here.</span></div></div></div></div></div>
<div class="mw"><button class="ib" data-menu="mS" aria-haspopup="true" aria-expanded="false" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button><div class="mn hide" id="mS" role="menu"><div class="mh">Settings</div><div class="ms">Theme</div><div class="mi" role="menuitemradio" tabindex="0" data-th="light" aria-checked="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M11.89 4.11l1.06-1.06M3.05 12.95l1.06-1.06"/></svg><span>Light</span><i>✓</i></div><div class="mi" role="menuitemradio" tabindex="0" data-th="dark" aria-checked="false"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z"/></svg><span>Dark</span><i>✓</i></div></div></div>
<div class="mw"><button class="ub" data-menu="mU" aria-haspopup="true" aria-expanded="false"><span style="white-space:nowrap" id="uname">Signed in</span><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button><div class="mn hide" id="mU" role="menu"><div class="mh2"><b id="uname2">Signed in</b><span id="urole">—</span></div><div class="msep"></div><button class="b1 full" id="out">Sign out</button></div></div>
</div></div>
<div class="shell">
<aside class="side" id="side"></aside>
<main class="main">
<div id="v-runs">
<div class="hd"><span class="pi" id="rpi"></span><div class="ht"><h2><span id="rtt">Runs</span> <span id="cnt"></span> <a class="info page-info" href="#" title="Info">Info</a></h2><p class="vdsc" id="rd">Every plan, apply and destroy across all environments.</p></div><div class="act"><small class="lu" id="lu">Last updated<br><span id="lu-ago">just now</span></small><button type="button" class="b2 ico" id="rf" aria-label="Refresh" title="Refresh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg></button><div class="spw dd"><button type="button" class="b2" data-menu="mState" aria-haspopup="true" aria-expanded="false">Run state<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button><div class="mn act hide" id="mState" role="menu"><button type="button" class="ami on" role="menuitem" data-rs="">All states</button><button type="button" class="ami" role="menuitem" data-rs="running">Running</button><button type="button" class="ami" role="menuitem" data-rs="waiting approval">Waiting approval</button><button type="button" class="ami" role="menuitem" data-rs="succeeded">Succeeded</button><button type="button" class="ami" role="menuitem" data-rs="failed">Failed</button><button type="button" class="ami" role="menuitem" data-rs="queued">Queued</button><button type="button" class="ami" role="menuitem" data-rs="cancelled">Cancelled</button></div></div><div class="spw dd"><button type="button" class="b2" data-menu="mActs" aria-haspopup="true" aria-expanded="false">Actions<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button><div class="mn act hide" id="mActs" role="menu"><button type="button" class="ami" role="menuitem" data-hdr-act="export">Export CSV</button><button type="button" class="ami" role="menuitem" data-hdr-act="approve">Approve selected run</button><button type="button" class="ami" role="menuitem" data-hdr-act="cancel">Cancel selected run</button></div></div><div class="spw"><button class="b1" id="nr">Run terraform</button><button class="b1 chv" data-menu="mR" aria-haspopup="true" aria-expanded="false" aria-label="More run options"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button><div class="mn act hide" id="mR" role="menu"><button type="button" class="ami" role="menuitem" data-act="plan">Run plan</button><button type="button" class="ami" role="menuitem" data-act="apply">Run apply (needs approval)</button><button type="button" class="ami" role="menuitem" data-act="destroy">Run destroy (needs approval)</button></div></div></div></div>
<div id="hero"></div>
<div id="rk"></div>
<div class="fl">
<div class="ffs" id="ffs">
<button type="button" class="ffs-trig" id="ffs-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="ffs-menu">
<span class="ffs-label">Saved filter sets</span>
<span class="ffs-val empty" id="ffs-val">Choose filter set</span>
<svg class="ffs-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>
<div class="ffs-menu hide" id="ffs-menu" role="listbox" hidden>
<div class="ffs-sec">Custom filter sets</div>
<button type="button" class="ffs-opt" role="option" data-fs="" data-label="All runs">All runs</button>
<button type="button" class="ffs-opt" role="option" data-fs="env:dev" data-label="Environment: dev">Environment: dev</button>
<button type="button" class="ffs-opt" role="option" data-fs="env:qa" data-label="Environment: qa">Environment: qa</button>
<button type="button" class="ffs-opt" role="option" data-fs="env:uat" data-label="Environment: uat">Environment: uat</button>
<button type="button" class="ffs-opt" role="option" data-fs="env:staging" data-label="Environment: staging">Environment: staging</button>
<button type="button" class="ffs-opt" role="option" data-fs="env:prod" data-label="Environment: prod">Environment: prod</button>
<div class="ffs-sec">Preset filter sets</div>
<button type="button" class="ffs-opt" role="option" data-fs="running" data-label="Running">Running</button>
<button type="button" class="ffs-opt" role="option" data-fs="waiting approval" data-label="Waiting approval">Waiting approval</button>
<button type="button" class="ffs-opt" role="option" data-fs="succeeded" data-label="Succeeded">Succeeded</button>
<button type="button" class="ffs-opt" role="option" data-fs="failed" data-label="Failed">Failed</button>
<button type="button" class="ffs-opt" role="option" data-fs="queued" data-label="Queued">Queued</button>
</div>
</div>
<div class="sf" role="search"><svg class="icn" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="fq" placeholder="Search" aria-label="Search"></div>
</div>
<div class="tw"><table class="tbl"><thead><tr><th>Branch</th><th>Run ID</th><th>Action</th><th>Status</th><th>Environment</th><th>Repository</th><th>Triggered by</th><th>Commit</th><th>Started</th><th>Duration</th></tr></thead><tbody id="tb"></tbody></table></div>
<div id="po" class="plan-out hide"></div>
</div>
<div id="v-gen" class="hide"></div></main>
<aside class="help hide" id="help" hidden aria-label="Info panel">
<div class="help-hd">
<h2 id="help-title">Info</h2>
<button type="button" class="help-close" id="help-close" aria-label="Close info panel" title="Close">
<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>
</div>
<div class="help-bd" id="help-bd"></div>
</aside>
</div>
<footer class="dash-foot" id="dash-foot">
<div class="dash-foot-l">
<button type="button" class="foot-item" id="foot-shell" title="CloudShell">
<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="m4.5 6.5 2 1.5-2 1.5M8.5 9.5h3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span>CloudShell</span>
</button>
<button type="button" class="foot-item" id="foot-toolkit" title="Agent Toolkit">
<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 5.5h10v7.5H3zM5 5.5V4a3 3 0 0 1 6 0v1.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7 8.5h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
<span>Agent Toolkit</span>
</button>
<button type="button" class="foot-item" id="foot-feedback" title="Feedback">Feedback</button>
</div>
<div class="dash-foot-r">
<span class="foot-copy">© 2026, terraplan</span>
<a class="foot-a" href="#" id="foot-privacy">Privacy</a>
<a class="foot-a" href="#" id="foot-terms">Terms</a>
<a class="foot-a" href="#" id="foot-cookies">Cookie preferences</a>
</div>
</footer>
</div>

<div id="mo" class="ov umodal hide"><div class="md card-md cr-modal">
<div class="md-hd"><h3>Run terraform</h3><p class="md-cs">Plan, apply or destroy. Applies and destroys take an exclusive environment lock.</p></div>
<div class="md-bd">
<label>Repository</label>
<div class="rt-dd" data-for="mrp">
<select id="mrp" class="hide" tabindex="-1"><option value="">Loading…</option></select>
<button type="button" class="role-dd-trig" id="mrp-trig" aria-haspopup="listbox" aria-expanded="false"><span class="role-dd-val" id="mrp-val">Loading…</span><svg class="role-dd-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div class="role-dd-mn hide" id="mrp-mn" role="listbox"></div>
</div>
<label>Branch</label>
<div class="rt-dd" data-for="mb">
<select id="mb" class="hide" tabindex="-1"><option value="">Select a repository first</option></select>
<button type="button" class="role-dd-trig" id="mb-trig" aria-haspopup="listbox" aria-expanded="false"><span class="role-dd-val" id="mb-val">Select a repository first</span><svg class="role-dd-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div class="role-dd-mn hide" id="mb-mn" role="listbox"></div>
</div>
<label>Environment</label>
<div class="rt-dd" data-for="me">
<select id="me" class="hide" tabindex="-1"><option value="">Loading…</option></select>
<button type="button" class="role-dd-trig" id="me-trig" aria-haspopup="listbox" aria-expanded="false"><span class="role-dd-val" id="me-val">Loading…</span><svg class="role-dd-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div class="role-dd-mn hide" id="me-mn" role="listbox"></div>
</div>
<label>Action</label>
<div class="rt-dd" data-for="ma">
<select id="ma" class="hide" tabindex="-1"><option value="">Loading…</option></select>
<button type="button" class="role-dd-trig" id="ma-trig" aria-haspopup="listbox" aria-expanded="false"><span class="role-dd-val" id="ma-val">Loading…</span><svg class="role-dd-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div class="role-dd-mn hide" id="ma-mn" role="listbox"></div>
</div>
<div id="m-apply" class="hide"><label>Plan to apply</label>
<div class="rt-dd" data-for="msp">
<select id="msp" class="hide" tabindex="-1"><option value="">Select a succeeded plan…</option></select>
<button type="button" class="role-dd-trig" id="msp-trig" aria-haspopup="listbox" aria-expanded="false"><span class="role-dd-val" id="msp-val">Select a succeeded plan…</span><svg class="role-dd-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div class="role-dd-mn hide" id="msp-mn" role="listbox"></div>
</div>
<p class="sub">Apply uses the exact saved .tfplan from that run — no re-plan.</p></div>
<div id="m-destroy" class="hide"><label>Type <span class="mono" id="mdc-hint">destroy uat</span> to confirm</label><input id="mdc" placeholder="destroy uat" autocomplete="off"><p class="sub">Destroy requires this confirmation and Admin approval per the environment policy.</p></div>
<div id="mw" class="warn hide"></div>
</div>
<div class="md-ft cr-modal-ft"><div style="flex:1"></div><button type="button" class="b2" id="mc">Cancel</button><button type="button" class="b1" id="mg">Start run</button></div>
</div></div>

`;

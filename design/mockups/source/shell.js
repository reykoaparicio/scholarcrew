// Fills in the shared sidebar, top bar, and inline icons for every mockup screen.
(function () {
  const I = {
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
    chat: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-8.5L6 20.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/>',
    award: '<circle cx="12" cy="9" r="5.5"/><path d="M8.8 13.6 7.6 21l4.4-2.5 4.4 2.5-1.2-7.4"/>',
    pen: '<path d="M4 20l1.1-4.6L15.6 4.9a2.1 2.1 0 0 1 3 3L8.1 18.4z"/><path d="M13.6 6.9l3 3"/>',
    columns: '<path d="M3.5 9.5 12 4.5l8.5 5"/><path d="M5.5 10.5v7.5M10 10.5v7.5M14 10.5v7.5M18.5 10.5v7.5M3.5 20h17"/>',
    dollar: '<circle cx="12" cy="12" r="8.5"/><path d="M14.7 9.3c-.5-.9-1.5-1.4-2.7-1.4-1.6 0-2.7.8-2.7 2s1 1.7 2.7 2.1 2.8.9 2.8 2.2-1.2 2.1-2.8 2.1c-1.3 0-2.3-.5-2.9-1.5M12 6.4v1.5M12 16.3v1.4"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.6"/><path d="M15.6 14.4A4.6 4.6 0 0 1 21 18.6"/>',
    bookmark: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    alert: '<path d="M12 4.2 21 19.5H3z"/><path d="M12 10v4.2M12 17.2v.1"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clip: '<path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    doc: '<path d="M7 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 7 20z"/><path d="M14 3.5v5h5"/>',
    spin: '<circle cx="12" cy="12" r="8" stroke-dasharray="36 14"/>',
    ext: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M18 14v5H5V6h5"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    spark: '<path d="M12 3.5 13.9 10l6.6 2-6.6 2L12 20.5 10.1 14l-6.6-2 6.6-2z"/>',
    reuse: '<path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M17.5 3v3.6h-3.6M6.5 21v-3.6h3.6"/>',
    // added for screens 09-19
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
    upload: '<path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 15v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V15"/>',
    download: '<path d="M12 4.5v11M7.5 11 12 15.5 16.5 11"/><path d="M4.5 15v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V15"/>',
    flag: '<path d="M5.5 21V4.5"/><path d="M5.5 5h11l-2 4 2 4h-11"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    trash: '<path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 12.5h9l1-12.5"/>',
    puzzle: '<path d="M5 8h3.2a2 2 0 1 1 3.6 0H15v3.2a2 2 0 1 1 0 3.6V19H5z"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/>',
    x: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
    heart: '<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/>',
    more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
    chevr: '<path d="m9 6 6 6-6 6"/>',
    chevl: '<path d="m15 6-6 6 6 6"/>',
    user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    inbox: '<path d="M4 13.5 6.5 5h11l2.5 8.5V19H4z"/><path d="M4 13.5h4.5l1 2h5l1-2H20"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.1M4.5 12h.1M4.5 17.5h.1"/>',
    book: '<path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h13.5v14H6a1.5 1.5 0 0 0-1.5 1.5z"/><path d="M4.5 19.5A1.5 1.5 0 0 0 6 21h13.5v-3"/>'
  };
  const svg = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ""}</svg>`;

  const NAV = [
    ["week", "This week", "calendar", ""],
    ["crew", "Crew", "chat", ""],
    ["scholarships", "Scholarships", "award", "9"],
    ["essays", "Essays", "pen", "4"],
    ["colleges", "Colleges", "columns", "6"],
    ["money", "Money", "dollar", ""],
    ["family", "Family", "users", ""],
    ["memory", "Memory", "bookmark", ""]
  ];
  // Fixed order = validated categorical order. Prep and Impact start switched off.
  const CREW = [
    ["Compass", "compass", "coordinator", true],
    ["Scout", "scout", "scholarships", true],
    ["Atlas", "atlas", "admissions", true],
    ["Quill", "quill", "essays", true],
    ["Aid", "aid", "financial aid", true],
    ["Ledger", "ledger", "money math", true],
    ["Prep", "prep", "add", false],
    ["Impact", "impact", "add", false]
  ];

  const active = document.body.dataset.active;
  // Opt-in hooks for screens 09-19 (screens 01-08 set none of these):
  //   data-crew-on="prep,impact"  switches those teammates on and adds their pages to the nav
  //   data-shell="setup"          dims the nav during onboarding
  //   a .sidebar or .topbar that already has markup is left alone
  const crewOn = (document.body.dataset.crewOn || "").split(",").filter(Boolean);
  const setup = document.body.dataset.shell === "setup";
  const EXTRA_NAV = { prep: ["prep", "Test prep", "target", ""], impact: ["impact", "Service", "heart", ""] };
  const nav = NAV.slice();
  crewOn.slice().reverse().forEach((k) => { if (EXTRA_NAV[k]) nav.splice(5, 0, EXTRA_NAV[k]); });
  const side = document.querySelector(".sidebar");
  if (side && !side.children.length) {
    side.innerHTML = `
      <div class="brand"><div class="mark"><svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">${I.spark}</svg></div><div class="word">scholarcrew</div></div>
      ${setup ? `<div class="setup-note">${svg("lock")}<span>Opens after setup</span></div>` : ""}
      <nav class="nav${setup ? " dim" : ""}">${nav.map(([key, label, icon, count]) =>
        `<a class="${key === active ? "on" : ""}">${svg(icon)}<span>${label}</span>${count && !setup ? `<span class="count">${count}</span>` : ""}</a>`).join("")}</nav>
      <div class="rail-sec${setup ? " dim" : ""}"><h4>Your crew</h4><ul class="roster">${CREW.map(([name, key, role, on]) => {
        const isOn = on || crewOn.includes(key);
        const r = isOn && !on ? (key === "prep" ? "tests" : "service") : role;
        return `<li class="${isOn ? "" : "off"}"><i class="dot" style="--c:var(--c-${key})"></i>${name}<span class="role">${r}</span></li>`;
      }).join("")}</ul></div>
      <div class="me${active === "settings" ? " on" : ""}"><div class="avatar">J</div><div><div class="n">Jordan R.</div><div class="s">Class of 2027 · Private</div></div></div>`;
  }

  const top = document.querySelector(".topbar");
  if (top && !top.children.length) {
    top.innerHTML = `
      <div class="search">${svg("search")}<span>Search scholarships, schools, essays…</span></div>
      <div class="spacer"></div>
      <span class="concept">Concept · fictional sample data</span>
      <div class="iconbtn">${svg("bell")}<span class="pip"></span></div>
      <a class="btn btn-primary">${svg("chat")}Ask your crew</a>`;
  }

  document.querySelectorAll("i[data-icon]").forEach((el) => {
    el.outerHTML = svg(el.dataset.icon);
  });
})();

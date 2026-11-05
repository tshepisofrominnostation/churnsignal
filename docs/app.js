(function () {
  "use strict";
  var E = window.ChurnEngine, R = null, loadedInbox = false;
  var $ = function (id) { return document.getElementById(id); };
  var pct = function (x, d) { return (100 * x).toFixed(d == null ? 0 : d) + "%"; };
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var CLS = { "RESPOND NOW": "b-now", "TODAY": "b-today", "THIS WEEK": "b-week", "MONITOR": "b-mon" };
  var SAMPLES = [
    "I have been on hold for 90 minutes. This is my last month with you, taking my number to Vodacom.",
    "Great job Telkom, another perfect outage. Really impressive stuff.",
    "my contract ends next month and I am not renewing, you lost me"
  ];

  /* ---------------- tabs ---------------- */
  var TABS = ["console", "inbox", "proof", "method"];
  function showTab(name) {
    if (TABS.indexOf(name) < 0) name = "console";
    TABS.forEach(function (t) {
      var btn = $("tab-" + t), panel = $("p-" + t);
      var on = t === name;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      if (on) { panel.removeAttribute("hidden"); panel.classList.add("fadein"); }
      else { panel.setAttribute("hidden", ""); panel.classList.remove("fadein"); }
    });
    if (history.replaceState) history.replaceState(null, "", "#" + name);
  }
  function initTabs() {
    document.querySelectorAll(".tab").forEach(function (b) {
      b.addEventListener("click", function () { showTab(b.dataset.tab); });
      b.addEventListener("keydown", function (e) {
        var i = TABS.indexOf(b.dataset.tab), n = null;
        if (e.key === "ArrowRight") n = TABS[(i + 1) % TABS.length];
        if (e.key === "ArrowLeft") n = TABS[(i - 1 + TABS.length) % TABS.length];
        if (n) { e.preventDefault(); showTab(n); $("tab-" + n).focus(); }
      });
    });
    var h = (location.hash || "").replace("#", "");
    showTab(TABS.indexOf(h) >= 0 ? h : "console");
  }

  /* ---------------- result card ---------------- */
  function bar(label, v, note, tone) {
    return '<div><div class="leader text-[13px] mb-1.5"><span class="mut">' + label + '</span>' +
      '<span class="num font-bold">' + note + '</span></div>' +
      '<div class="bar ' + (tone || "") + '"><i style="width:' + Math.max(2, v * 100) + '%"></i></div></div>';
  }
  function highlight(text, terms) {
    var out = esc(text);
    terms.forEach(function (t) {
      t.split(" ").forEach(function (w) {
        if (w.length < 3) return;
        out = out.replace(new RegExp("\\b(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")\\b", "ig"), "<mark>$1</mark>");
      });
    });
    return out;
  }
  function renderResult(a) {
    var p = E.priority(a), b = E.band(p);
    var up = a.why.filter(function (w) { return w.weight > 0; }).map(function (w) { return w.term; });
    $("result").innerHTML =
      '<div class="fadein">' +
        '<div class="flex items-center justify-between gap-3 flex-wrap">' +
          '<span class="chip ' + CLS[b] + '">' + b + '</span>' +
          '<span class="text-[12.5px] dim">priority <strong class="num ink">' + p.toFixed(2) + '</strong></span>' +
        '</div>' +
        '<p class="mt-4 text-[15.5px] leading-[1.65]">' + highlight(a.text, up) + '</p>' +
        '<div class="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-5">' +
          bar("Churn intent", a.churn, pct(a.churn)) +
          bar("Urgency", a.urgent, pct(a.urgent)) +
        '</div>' +
        '<div class="flex flex-wrap gap-2 mt-5">' +
          '<span class="chip b-mon">' + esc(a.aspect) + '</span>' +
          '<span class="chip b-mon">' + esc(a.sentiment) + '</span>' +
        '</div>' +
        '<p class="text-[12px] dim mt-4 leading-relaxed">' +
          (up.length
            ? 'Highlighted words pushed the churn score up most: <strong class="ink">' + up.slice(0, 4).map(esc).join(", ") + '</strong>.'
            : 'No words pushed the churn score up. Read as a complaint or a question, not a departure.') +
          (a.known < 3 ? ' <span style="color:var(--gold)">Few recognised words, so treat this score as weak.</span>' : '') +
        '</p>' +
      '</div>';
  }
  function analyseInput() {
    var t = $("msg").value.trim();
    if (!t) return;
    renderResult(E.analyse(t));
  }

  /* ---------------- inbox ---------------- */
  function renderInbox(rows) {
    var scored = rows.map(function (r) {
      var a = E.analyse(r.text); a.p = E.priority(a); return a;
    }).sort(function (x, y) { return y.p - x.p; });
    var counts = { "RESPOND NOW": 0, "TODAY": 0, "THIS WEEK": 0, "MONITOR": 0 };
    scored.forEach(function (a) { counts[E.band(a.p)]++; });

    $("inboxsum").innerHTML =
      '<div class="flex flex-wrap items-center gap-2">' +
        Object.keys(counts).map(function (k) {
          return '<span class="chip ' + CLS[k] + '">' + k + ' · <span class="num">' + counts[k] + '</span></span>';
        }).join("") +
        '<span class="dim text-[12.5px] ml-auto num">' + scored.length + ' messages ranked on your device</span>' +
      '</div>';

    var h = '<div class="overflow-x-auto"><table><thead><tr><th>Band</th><th>Message</th><th>Topic</th><th>Churn</th><th>Urgent</th></tr></thead><tbody>';
    scored.slice(0, 40).forEach(function (a) {
      var b = E.band(a.p);
      h += '<tr><td><span class="chip ' + CLS[b] + '">' + b + '</span></td>' +
        '<td style="max-width:520px">' + esc(a.text) + '</td>' +
        '<td class="mut">' + esc(a.aspect) + '</td>' +
        '<td class="num font-semibold">' + pct(a.churn) + '</td>' +
        '<td class="num font-semibold">' + pct(a.urgent) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    if (scored.length > 40) h += '<p class="text-[12px] dim mt-3">Showing the top 40 of ' + scored.length + '.</p>';
    $("inbox").innerHTML = h;
    loadedInbox = true;
  }

  function parseCSV(txt) {
    var rows = [], row = [], f = "", q = false, i, c;
    for (i = 0; i < txt.length; i++) {
      c = txt[i];
      if (q) {
        if (c === '"' && txt[i + 1] === '"') { f += '"'; i++; }
        else if (c === '"') q = false;
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && txt[i + 1] === "\n") i++;
        row.push(f); f = ""; if (row.length > 1 || row[0]) rows.push(row); row = [];
      } else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function fromCSV(txt) {
    var rows = parseCSV(txt);
    if (rows.length < 2) return [];
    var head = rows[0].map(function (x) { return x.trim().toLowerCase(); }), idx = -1;
    ["text", "message", "review", "comment"].forEach(function (k) {
      if (idx < 0) idx = head.indexOf(k);
    });
    if (idx < 0) {
      $("inboxsum").innerHTML = '<p class="text-[13.5px]" style="color:var(--hot)">No text column found. Add one named text, message, review or comment.</p>';
      return [];
    }
    return rows.slice(1).map(function (r) { return { text: (r[idx] || "").trim() }; })
      .filter(function (r) { return r.text; });
  }

  /* ---------------- results tab ---------------- */
  function renderProof() {
    var m = R.metrics, c = R.capacity, rc = R.random_capacity;
    $("proofmeta").innerHTML = 'Held-out test set of <strong class="ink">' + R.test_n.toLocaleString() +
      '</strong> messages, never seen in training. No message text appears on both sides of the split. Every figure is computed.';

    $("capacity").innerHTML = ["top_10pct", "top_20pct", "top_30pct"].map(function (k) {
      var n = k.replace("top_", "").replace("pct", "");
      return '<div class="mb-5 last:mb-0"><div class="leader text-[13px] mb-1.5">' +
        '<span class="mut">Reply to the top ' + n + '% <span class="dim">(' + c[k].answered + ')</span></span>' +
        '<span class="num font-bold">' + c[k].leavers_reached + ' of ' + c[k].of + '</span></div>' +
        '<div class="bar sig"><i style="width:' + c[k].reach_pct + '%"></i></div>' +
        '<div class="leader text-[11.5px] mt-1.5 dim"><span>Ranked: <strong class="num gold">' + c[k].reach_pct + '%</strong></span>' +
        '<span class="num">top to bottom: ' + rc[k] + '%</span></div></div>';
    }).join("");

    function row(name, o, hot) {
      return '<tr><td>' + name + '</td><td class="num">' + (o.precision * 100).toFixed(1) + '%</td>' +
        '<td class="num">' + (o.recall * 100).toFixed(1) + '%</td>' +
        '<td class="num font-extrabold ' + (hot ? "gold" : "") + '">' + (o.f1 * 100).toFixed(1) + '%</td></tr>';
    }
    $("churncmp").innerHTML = '<div class="overflow-x-auto"><table><thead><tr><th>Method</th><th>P</th><th>R</th><th>F1</th></tr></thead><tbody>' +
      row("Every negative counts as leaving", m.churn_baseline_any_negative) +
      row("Keyword rule (cancel, port, switch)", m.churn_baseline_keywords) +
      row("ChurnSignal", m.churn_model, true) +
      '</tbody></table></div>';

    var s = m.sarcasm_subset;
    $("sarcasm").innerHTML =
      bar("Lexicon tool", s.textblob_correct_pct / 100, s.textblob_correct_pct.toFixed(1) + "%", "mut") +
      '<div class="mt-4">' + bar("ChurnSignal", s.model_correct_pct / 100, s.model_correct_pct.toFixed(1) + "%", "sig") + '</div>' +
      '<p class="text-[12px] dim mt-4">' + s.n + ' sarcastic messages in the held-out set. Word lists read the praise and miss the irony.</p>';

    $("tasks").innerHTML = '<div class="overflow-x-auto"><table><thead><tr><th>Task</th><th>Score</th><th>Baseline</th></tr></thead><tbody>' +
      '<tr><td>Churn intent</td><td class="num font-extrabold gold">' + (m.churn_model.f1 * 100).toFixed(1) + '%</td><td class="mut num">keywords ' + (m.churn_baseline_keywords.f1 * 100).toFixed(1) + '%</td></tr>' +
      '<tr><td>Sentiment</td><td class="num font-extrabold gold">' + (m.sentiment_model.f1 * 100).toFixed(1) + '%</td><td class="mut num">lexicon ' + (m.sentiment_baseline_textblob.f1 * 100).toFixed(1) + '%</td></tr>' +
      '<tr><td>Topic</td><td class="num font-extrabold gold">' + (m.aspect_model.f1 * 100).toFixed(1) + '%</td><td class="mut">—</td></tr>' +
      '<tr><td>Urgency</td><td class="num font-extrabold" style="color:var(--gold)">' + (m.urgency_model.f1 * 100).toFixed(1) + '%</td><td class="mut">weakest task</td></tr>' +
      '</tbody></table></div>';

    $("steps").innerHTML = [
      ["01", "Clean", "Lower-case, strip reference numbers, split into words and pairs of words."],
      ["02", "Weigh", "TF-IDF scores how distinctive each phrase is; common words count for less."],
      ["03", "Classify", "Four logistic-regression heads: churn, urgency, topic, sentiment."],
      ["04", "Rank", "Churn 62% + urgency 28% + negativity 10% becomes a band a human can act on."]
    ].map(function (s) {
      return '<div class="card p-5"><div class="gold text-[11px] font-extrabold tracking-[.09em]">' + s[0] + '</div>' +
        '<div class="font-extrabold mt-1.5">' + s[1] + '</div>' +
        '<p class="mut text-[13px] mt-2 leading-relaxed">' + s[2] + '</p></div>';
    }).join("");
    $("par").textContent = R.parity.overall_pct.toFixed(1) + "%";
  }

  /* ---------------- boot ---------------- */
  function init(model, report) {
    E.load(model); R = report;
    initTabs(); renderProof();

    $("samples").innerHTML = SAMPLES.map(function (t, i) {
      return '<button class="samp" data-i="' + i + '">' +
        esc(t.length > 44 ? t.slice(0, 42) + "…" : t) + '</button>';
    }).join("");
    $("samples").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      $("msg").value = SAMPLES[+b.dataset.i]; analyseInput();
    });
    $("go").addEventListener("click", analyseInput);
    $("msg").addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") analyseInput();
    });
    $("pick").addEventListener("click", function () { $("file").click(); });
    $("file").addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { var r = fromCSV(fr.result); if (r.length) renderInbox(r); };
      fr.readAsText(f);
    });
    $("demo").addEventListener("click", function () {
      if (loadedInbox) { document.getElementById("inbox").scrollIntoView({ block: "nearest" }); return; }
      fetch("demo_inbox.csv").then(function (r) { return r.text(); })
        .then(function (t) { renderInbox(fromCSV(t)); });
    });
    $("msg").value = SAMPLES[0]; analyseInput();
  }

  Promise.all([
    fetch("model.json").then(function (r) { return r.json(); }),
    fetch("report.json").then(function (r) { return r.json(); })
  ]).then(function (a) { init(a[0], a[1]); })
    .catch(function () {
      $("result").innerHTML = '<p style="color:var(--hot)" class="text-sm">Could not load the model. Serve this folder over HTTP rather than opening the file directly.</p>';
    });
})();

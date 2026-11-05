(function () {
  "use strict";
  var E = window.ChurnEngine, R = null, $ = function (id) { return document.getElementById(id); };
  var pct = function (x, d) { return (100 * x).toFixed(d == null ? 0 : d) + "%"; };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var CLS = { "RESPOND NOW": "b-now", "TODAY": "b-today", "THIS WEEK": "b-week", "MONITOR": "b-mon" };
  var SAMPLES = [
    "I have been on hold for 90 minutes. This is my last month with you, taking my number to Vodacom.",
    "Great job Telkom, another perfect outage. Really impressive stuff.",
    "signal drops every evening, so frustrating. Not switching, but I want a refund",
    "my contract ends next month and I am not renewing, you lost me",
    "what are the call centre hours"
  ];

  function bar(label, value, note, hot) {
    return '<div class="mb-4"><div class="flex justify-between text-sm mb-1"><span>' + label + '</span><span class="font-bold">' + note + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.max(1, value * 100) + '%;' + (hot ? "" : "background:#5b6b80") + '"></i></div></div>';
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
    var reasons = a.why.filter(function (w) { return w.weight > 0; }).map(function (w) { return w.term; });
    $("result").innerHTML =
      '<div class="tick"><div class="flex items-center justify-between flex-wrap gap-3"><span class="chip ' + CLS[b] + '">' + b + '</span>' +
      '<span class="text-sm mut">Priority score <strong class="text-white">' + p.toFixed(2) + '</strong></span></div>' +
      '<p class="mt-4 text-[15px] leading-relaxed">' + highlight(a.text, reasons) + '</p>' +
      '<div class="mt-5 grid sm:grid-cols-2 gap-x-6">' +
      bar("Churn intent", a.churn, pct(a.churn), true) + bar("Urgency", a.urgent, pct(a.urgent), true) + '</div>' +
      '<div class="flex flex-wrap gap-2 text-xs"><span class="chip b-mon">TOPIC · ' + esc(a.aspect) + '</span><span class="chip b-mon">SENTIMENT · ' + esc(a.sentiment) + '</span></div>' +
      '<p class="text-xs mut mt-4">' + (reasons.length ? 'Highlighted words pushed the churn score up the most: <strong class="text-white">' + reasons.slice(0, 4).map(esc).join(", ") + '</strong>.' :
        'No words in this message pushed the churn score up. It is read as a complaint or a question, not a departure.') +
      (a.known < 3 ? ' <span style="color:var(--warn)">Few recognised words: treat this score as weak.</span>' : '') + '</p></div>';
  }

  function analyseInput() {
    var t = $("msg").value.trim(); if (!t) return;
    renderResult(E.analyse(t));
  }

  function renderInbox(rows) {
    var scored = rows.map(function (r) {
      var a = E.analyse(r.text); a.p = E.priority(a); a.row = r; return a;
    }).sort(function (x, y) { return y.p - x.p; });
    var counts = { "RESPOND NOW": 0, "TODAY": 0, "THIS WEEK": 0, "MONITOR": 0 };
    scored.forEach(function (a) { counts[E.band(a.p)]++; });
    var h = '<div class="flex flex-wrap gap-2 mb-3 text-sm">' + Object.keys(counts).map(function (k) {
      return '<span class="chip ' + CLS[k] + '">' + k + ' · ' + counts[k] + '</span>'; }).join("") +
      '<span class="mut ml-auto">' + scored.length + ' messages ranked on your device</span></div>' +
      '<table><thead><tr><th>Band</th><th>Message</th><th>Topic</th><th>Churn</th><th>Urgent</th></tr></thead><tbody>';
    scored.slice(0, 40).forEach(function (a) {
      var b = E.band(a.p);
      h += '<tr class="rowhov"><td><span class="chip ' + CLS[b] + '">' + b + '</span></td><td>' + esc(a.text) + '</td><td class="mut">' + esc(a.aspect) +
        '</td><td class="font-bold">' + pct(a.churn) + '</td><td class="font-bold">' + pct(a.urgent) + '</td></tr>';
    });
    $("inbox").innerHTML = h + '</tbody></table>' + (scored.length > 40 ? '<p class="text-xs mut mt-2">Showing the top 40 of ' + scored.length + '.</p>' : "");
  }

  function parseCSV(txt) {
    var rows = [], row = [], f = "", q = false, i, c;
    for (i = 0; i < txt.length; i++) {
      c = txt[i];
      if (q) { if (c === '"' && txt[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && txt[i + 1] === "\n") i++; row.push(f); f = ""; if (row.length > 1 || row[0]) rows.push(row); row = []; }
      else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function fromCSV(txt) {
    var rows = parseCSV(txt); if (rows.length < 2) return [];
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var idx = head.indexOf("text"); if (idx < 0) idx = head.indexOf("message"); if (idx < 0) idx = head.indexOf("review"); if (idx < 0) idx = head.indexOf("comment");
    if (idx < 0) { $("inbox").innerHTML = '<p class="text-sm" style="color:var(--hot)">No <code>text</code> column found. Add a column named text, message, review or comment.</p>'; return []; }
    return rows.slice(1).map(function (r) { return { text: (r[idx] || "").trim() }; }).filter(function (r) { return r.text; });
  }

  function renderProof() {
    var m = R.metrics, c = R.capacity, rc = R.random_capacity;
    $("tn").textContent = R.test_n.toLocaleString();
    $("hero-stats").innerHTML = [
      [pct(m.churn_model.f1 , 0).replace("%", ""), "churn-intent F1", "vs " + (m.churn_baseline_keywords.f1 * 100).toFixed(0) + " for a keyword rule"],
      [c.top_20pct.reach_pct.toFixed(0) + "%", "of leavers reached", "by answering only the top 20%"],
      [m.sarcasm_subset.model_correct_pct.toFixed(0) + "%", "sarcasm read right", "lexicon tools: " + m.sarcasm_subset.textblob_correct_pct.toFixed(0) + "%"],
      [R.parity.overall_pct.toFixed(0) + "%", "browser = Python", "same predictions, measured"]
    ].map(function (s) { return '<div class="panel p-4"><div class="text-3xl font-extrabold sig">' + s[0] + '</div><div class="text-sm font-semibold mt-1">' + s[1] + '</div><div class="text-xs mut mt-1">' + s[2] + '</div></div>'; }).join("");

    $("capacity").innerHTML = ["top_10pct", "top_20pct", "top_30pct"].map(function (k) {
      var n = k.replace("top_", "").replace("pct", "");
      return '<div class="mb-5"><div class="flex justify-between text-sm mb-1"><span>Reply to the top ' + n + '% (' + c[k].answered + ' messages)</span><span class="font-bold">' + c[k].leavers_reached + ' of ' + c[k].of + ' leavers</span></div>' +
        '<div class="bar"><i style="width:' + c[k].reach_pct + '%"></i></div>' +
        '<div class="flex justify-between text-xs mut mt-1"><span>ChurnSignal order: <strong class="text-white">' + c[k].reach_pct + '%</strong></span><span>Arrival order: ' + rc[k] + '%</span></div></div>';
    }).join("");

    function row(name, o, hot) {
      return '<tr><td>' + name + '</td><td>' + (o.precision * 100).toFixed(1) + '%</td><td>' + (o.recall * 100).toFixed(1) + '%</td><td class="font-bold ' + (hot ? "sig" : "") + '">' + (o.f1 * 100).toFixed(1) + '%</td></tr>';
    }
    $("churncmp").innerHTML = '<table><thead><tr><th>Method</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>' +
      row("Treat every negative as leaving", m.churn_baseline_any_negative) + row("Keyword rule (cancel, port, switch)", m.churn_baseline_keywords) +
      row("ChurnSignal model", m.churn_model, true) + '</tbody></table>';

    var s = m.sarcasm_subset;
    $("sarcasm").innerHTML = bar("Lexicon tool (TextBlob)", s.textblob_correct_pct / 100, s.textblob_correct_pct.toFixed(1) + "% correct", false) +
      bar("ChurnSignal model", s.model_correct_pct / 100, s.model_correct_pct.toFixed(1) + "% correct", true) +
      '<p class="text-xs mut">' + s.n + ' sarcastic messages in the held-out set. Word-list tools read praise words and miss the irony.</p>';

    $("tasks").innerHTML = '<table><thead><tr><th>Task</th><th>Score</th><th>Compare</th></tr></thead><tbody>' +
      '<tr><td>Sentiment (3 classes)</td><td class="font-bold sig">' + (m.sentiment_model.f1 * 100).toFixed(1) + '%</td><td class="mut">lexicon: ' + (m.sentiment_baseline_textblob.f1 * 100).toFixed(1) + '%</td></tr>' +
      '<tr><td>Topic (6 aspects)</td><td class="font-bold sig">' + (m.aspect_model.f1 * 100).toFixed(1) + '%</td><td class="mut">-</td></tr>' +
      '<tr><td>Churn intent</td><td class="font-bold sig">' + (m.churn_model.f1 * 100).toFixed(1) + '%</td><td class="mut">keywords: ' + (m.churn_baseline_keywords.f1 * 100).toFixed(1) + '%</td></tr>' +
      '<tr><td>Urgency</td><td class="font-bold" style="color:var(--warn)">' + (m.urgency_model.f1 * 100).toFixed(1) + '%</td><td class="mut">weakest task</td></tr></tbody></table>';

    $("steps").innerHTML = [
      ["1 · Read", "Each message is lower-cased and cleaned, then split into one- and two-word phrases."],
      ["2 · Weigh", "TF-IDF scores how distinctive each phrase is. Common words count for less."],
      ["3 · Classify", "Four logistic-regression heads predict churn intent, urgency, topic and sentiment."],
      ["4 · Rank", "Churn 62% + urgency 28% + negativity 10% becomes a priority band a human can act on."]
    ].map(function (s) { return '<div class="panel p-4"><div class="font-bold sig">' + s[0] + '</div><p class="mut mt-2">' + s[1] + '</p></div>'; }).join("");
    $("par").textContent = R.parity.overall_pct.toFixed(1) + "%";
  }

  function init(model, report) {
    E.load(model); R = report; renderProof();
    $("samples").innerHTML = SAMPLES.map(function (t, i) {
      return '<button class="ghost text-xs text-left" data-i="' + i + '">' + esc(t.length > 46 ? t.slice(0, 44) + "..." : t) + '</button>'; }).join("");
    $("samples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; $("msg").value = SAMPLES[+b.dataset.i]; analyseInput(); });
    $("go").addEventListener("click", analyseInput);
    $("msg").addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") analyseInput(); });
    $("pick").addEventListener("click", function () { $("file").click(); });
    $("file").addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return; var fr = new FileReader();
      fr.onload = function () { var r = fromCSV(fr.result); if (r.length) renderInbox(r); }; fr.readAsText(f);
    });
    $("demo").addEventListener("click", function () {
      fetch("demo_inbox.csv").then(function (r) { return r.text(); }).then(function (t) { renderInbox(fromCSV(t)); });
    });
    $("msg").value = SAMPLES[0]; analyseInput();
  }

  Promise.all([fetch("model.json").then(function (r) { return r.json(); }), fetch("report.json").then(function (r) { return r.json(); })])
    .then(function (a) { init(a[0], a[1]); })
    .catch(function () { $("result").innerHTML = '<p style="color:var(--hot)">Could not load the model. Serve this folder over HTTP (GitHub Pages does) rather than opening the file directly.</p>'; });
})();

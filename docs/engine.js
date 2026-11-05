/* ChurnSignal engine: in-browser TF-IDF + logistic regression inference.
   Mirrors scikit-learn: TfidfVectorizer(ngram_range=(1,2), sublinear_tf=True) then LogisticRegression.
   Nothing leaves the user's device. */
(function (root) {
  "use strict";
  var M = null;

  function norm(t) {
    t = String(t).toLowerCase().replace(/ref:\s*\d+/g, "");
    t = t.replace(/\s+/g, " ");
    return t.replace(/[^\w\s@#']/g, "").trim();
  }
  function tokens(t) { return norm(t).match(/[a-z0-9@#']+/g) || []; }

  // sklearn word-level analyzer: unigrams + bigrams
  function grams(tok) {
    var out = tok.slice(), i;
    for (i = 0; i < tok.length - 1; i++) out.push(tok[i] + " " + tok[i + 1]);
    return out;
  }

  // sparse tf-idf vector, L2-normalised, sublinear tf
  function vectorise(text) {
    var counts = {}, g = grams(tokens(text)), i, k, idx, v = {}, norm2 = 0;
    for (i = 0; i < g.length; i++) {
      if (Object.prototype.hasOwnProperty.call(M.vocab, g[i])) counts[g[i]] = (counts[g[i]] || 0) + 1;
    }
    for (k in counts) {
      idx = M.vocab[k];
      v[idx] = (1 + Math.log(counts[k])) * M.idf[idx];
      norm2 += v[idx] * v[idx];
    }
    norm2 = Math.sqrt(norm2) || 1;
    for (k in v) v[k] = v[k] / norm2;
    return v;
  }

  function dot(w, v) { var s = 0, k; for (k in v) s += w[k] * v[k]; return s; }
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  function softmax(z) {
    var m = Math.max.apply(null, z), e = z.map(function (x) { return Math.exp(x - m); });
    var s = e.reduce(function (a, b) { return a + b; }, 0);
    return e.map(function (x) { return x / s; });
  }

  function head(name, v) {
    var h = M.heads[name], i, z;
    if (h.binary) {
      var p = sigmoid(dot(h.weights[0], v) + h.intercept[0]);
      return { label: p >= 0.5 ? h.classes[1] : h.classes[0], prob: p, probs: [1 - p, p], classes: h.classes };
    }
    z = h.weights.map(function (w, j) { return dot(w, v) + h.intercept[j]; });
    var pr = softmax(z), best = 0;
    for (i = 1; i < pr.length; i++) if (pr[i] > pr[best]) best = i;
    return { label: h.classes[best], prob: pr[best], probs: pr, classes: h.classes };
  }

  // top contributing words for the churn head, for explainability
  function explain(text, name, n) {
    var h = M.heads[name], v = vectorise(text), w = h.weights[0], inv = M._inv, k, out = [];
    if (!inv) { inv = M._inv = {}; for (var t in M.vocab) inv[M.vocab[t]] = t; }
    for (k in v) out.push({ term: inv[k], weight: w[k] * v[k] });
    out.sort(function (a, b) { return Math.abs(b.weight) - Math.abs(a.weight); });
    return out.slice(0, n || 5);
  }

  function analyse(text) {
    var v = vectorise(text);
    var churn = head("churn", v), urg = head("urgent", v), sent = head("sentiment", v), asp = head("aspect", v);
    return {
      text: text,
      churn: churn.prob, urgent: urg.prob,
      sentiment: sent.label, sentimentConf: sent.prob,
      aspect: asp.label, aspectConf: asp.prob,
      why: explain(text, "churn", 4),
      known: Object.keys(v).length
    };
  }

  // Triage score: churn risk dominates, urgency amplifies, high-value signals first
  function priority(a) {
    var s = 0.62 * a.churn + 0.28 * a.urgent + (a.sentiment === "negative" ? 0.10 : 0);
    return Math.min(1, s);
  }
  function band(score) {
    if (score >= 0.62) return "RESPOND NOW";
    if (score >= 0.36) return "TODAY";
    if (score >= 0.18) return "THIS WEEK";
    return "MONITOR";
  }

  var Engine = {
    load: function (model) { M = model; return Engine; },
    ready: function () { return !!M; },
    analyse: analyse, priority: priority, band: band, norm: norm
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  else root.ChurnEngine = Engine;
})(typeof window !== "undefined" ? window : this);

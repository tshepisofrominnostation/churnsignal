"""Compile a single report.json for the UI: held-out metrics, per-provider/aspect findings, demo inbox."""
import json, subprocess
import pandas as pd

m = json.load(open("reports/metrics.json"))
par = json.load(open("reports/parity.json"))
te = pd.read_csv("reports/test_set.csv")

# run the actual browser engine over the held-out set to build the findings
open("/tmp/te2.json", "w").write(json.dumps(te[["text", "provider", "aspect", "channel", "churn_intent"]].to_dict("records")))
out = subprocess.run(["node", "-e", """
const E=require('./docs/engine.js'); E.load(require('./docs/model.json'));
const t=require('/tmp/te2.json');
console.log(JSON.stringify(t.map(r=>{const a=E.analyse(r.text);const p=E.priority(a);
 return {text:r.text,provider:r.provider,channel:r.channel,aspect:a.aspect,truth_aspect:r.aspect,churn:+a.churn.toFixed(3),urgent:+a.urgent.toFixed(3),
 sentiment:a.sentiment,priority:+p.toFixed(3),band:E.band(p),truth_churn:r.churn_intent,why:a.why.map(w=>w.term)}})));"""],
    capture_output=True, text=True)
rows = pd.DataFrame(json.loads(out.stdout))
rows["flag"] = (rows.churn >= 0.5).astype(int)

by_prov = rows.groupby("provider").agg(n=("text", "count"), flagged=("flag", "sum"),
                                       avg_priority=("priority", "mean")).reset_index()
by_prov["flag_pct"] = (100 * by_prov.flagged / by_prov.n).round(1)
by_asp = rows.groupby("aspect").agg(n=("text", "count"), flagged=("flag", "sum")).reset_index()
by_asp["flag_pct"] = (100 * by_asp.flagged / by_asp.n).round(1)
by_chan = rows.groupby("channel").agg(n=("text", "count"), flagged=("flag", "sum")).reset_index()
by_chan["flag_pct"] = (100 * by_chan.flagged / by_chan.n).round(1)
bands = rows.band.value_counts().to_dict()

# THE headline claim, measured: a team that can only answer the top N: how many real leavers do they reach?
rows = rows.sort_values("priority", ascending=False).reset_index(drop=True)
total_leavers = int(rows.truth_churn.sum())
cap = {}
for frac in (0.10, 0.20, 0.30):
    k = int(len(rows) * frac)
    caught = int(rows.head(k).truth_churn.sum())
    cap[f"top_{int(frac*100)}pct"] = {"answered": k, "leavers_reached": caught, "of": total_leavers,
                                       "reach_pct": round(100 * caught / total_leavers, 1)}
rng = rows.sample(frac=1, random_state=1).reset_index(drop=True)
rand = {}
for frac in (0.10, 0.20, 0.30):
    k = int(len(rng) * frac)
    rand[f"top_{int(frac*100)}pct"] = round(100 * int(rng.head(k).truth_churn.sum()) / total_leavers, 1)

demo = rows.head(14)[["text", "provider", "channel", "aspect", "churn", "urgent", "priority", "band", "why"]]
report = {"metrics": m, "parity": par, "providers": by_prov.round(3).to_dict("records"),
          "aspects": by_asp.to_dict("records"), "channels": by_chan.to_dict("records"),
          "bands": bands, "capacity": cap, "random_capacity": rand, "demo": demo.to_dict("records"),
          "test_n": int(len(rows)), "test_leavers": total_leavers}
json.dump(report, open("docs/report.json", "w"))
json.dump(report, open("reports/report.json", "w"), indent=2)
print("test n:", len(rows), "| real leavers:", total_leavers)
print("capacity (triage ranking):", json.dumps(cap))
print("capacity (random order)  :", rand)
print("bands:", bands)
print("by provider:", by_prov[["provider", "n", "flag_pct"]].values.tolist())

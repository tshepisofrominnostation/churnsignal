"""Measure JS-vs-Python agreement on the held-out set. We report the number, we do not assume it."""
import json, subprocess, re
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

df = pd.read_csv("data/messages.csv")
def norm(t):
    t = re.sub(r"ref:\s*\d+", "", t.lower()); t = re.sub(r"\s+", " ", t)
    return re.sub(r"[^\w\s@#']", "", t).strip()
df["key"] = df.text.map(norm)
uniq = df.drop_duplicates("key")
trk, tek = train_test_split(uniq.key, test_size=0.25, random_state=7)
tr, te = df[df.key.isin(set(trk))], df[df.key.isin(set(tek))].reset_index(drop=True)
vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, token_pattern=r"[a-z0-9@#']+")
Xtr = vec.fit_transform(tr.text.map(norm)); Xte = vec.transform(te.text.map(norm))
py = {}
for name, tgt in [("churn", "churn_intent"), ("urgent", "urgent"), ("sentiment", "sentiment"), ("aspect", "aspect")]:
    clf = LogisticRegression(max_iter=3000, class_weight="balanced", C=3.0).fit(Xtr, tr[tgt])
    py[name] = [str(x) for x in clf.predict(Xte)]
open("/tmp/te.json", "w").write(json.dumps(list(te.text)))
js = subprocess.run(["node", "-e", """
const E=require('./docs/engine.js'); E.load(require('./docs/model.json'));
const t=require('/tmp/te.json'); const o=t.map(x=>{const a=E.analyse(x);
 return {churn:a.churn>=0.5?'1':'0',urgent:a.urgent>=0.5?'1':'0',sentiment:a.sentiment,aspect:a.aspect}});
console.log(JSON.stringify(o));"""], capture_output=True, text=True)
js = json.loads(js.stdout)
res = {}
for name in py:
    agree = sum(1 for i, p in enumerate(py[name]) if p == js[i][name])
    res[name] = {"agree": agree, "n": len(py[name]), "pct": round(100 * agree / len(py[name]), 2)}
tot_a = sum(r["agree"] for r in res.values()); tot_n = sum(r["n"] for r in res.values())
res["overall_pct"] = round(100 * tot_a / tot_n, 2)
json.dump(res, open("reports/parity.json", "w"), indent=2); json.dump(res, open("docs/parity.json", "w"))
print(json.dumps(res, indent=2))

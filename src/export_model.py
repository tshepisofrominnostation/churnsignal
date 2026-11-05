"""Export the trained churn / sentiment / aspect / urgency models to JSON for in-browser inference.

Only the word-level TF-IDF half of each pipeline is exported (char n-grams are dropped to keep
the payload small), so the browser uses a *retrained* word-level model. We then MEASURE the
Python-vs-browser parity on the held-out set rather than assuming it.
"""
import json
import re
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

SEED = 7
df = pd.read_csv("data/messages.csv")


def norm(t):
    t = re.sub(r"ref:\s*\d+", "", t.lower())
    t = re.sub(r"\s+", " ", t)
    return re.sub(r"[^\w\s@#']", "", t).strip()


df["key"] = df.text.map(norm)
uniq = df.drop_duplicates("key").reset_index(drop=True)
tr_keys, te_keys = train_test_split(uniq.key, test_size=0.25, random_state=SEED)
tr, te = df[df.key.isin(set(tr_keys))], df[df.key.isin(set(te_keys))]

vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, token_pattern=r"[a-z0-9@#']+")
Xtr = vec.fit_transform(tr.text.map(norm))
vocab = vec.vocabulary_
idf = vec.idf_
out = {"vocab": {k: int(v) for k, v in vocab.items()}, "idf": [round(float(x), 5) for x in idf], "heads": {}}

summary = {}
for name, target in [("churn", "churn_intent"), ("urgent", "urgent"), ("sentiment", "sentiment"), ("aspect", "aspect")]:
    clf = LogisticRegression(max_iter=3000, class_weight="balanced", C=3.0).fit(Xtr, tr[target])
    classes = [str(c) for c in clf.classes_]
    coef = clf.coef_
    inter = clf.intercept_
    if len(classes) == 2:  # binary: one weight vector for the positive class
        W = [coef[0]]
        classes_out = [classes[0], classes[1]]
        binary = True
    else:
        W = list(coef)
        classes_out = classes
        binary = False
    out["heads"][name] = {
        "classes": classes_out, "binary": binary,
        "intercept": [round(float(x), 5) for x in inter],
        "weights": [[round(float(x), 4) for x in w] for w in W],
    }
    Xte = vec.transform(te.text.map(norm))
    py_pred = clf.predict(Xte)
    summary[name] = {"py_acc": round(float((py_pred == te[target]).mean()), 3)}

json.dump(out, open("docs/model.json", "w"), separators=(",", ":"))
te[["text", "sentiment", "aspect", "churn_intent", "urgent"]].head(0)
te.to_csv("reports/test_set.csv", index=False)
import os
print("model.json KB:", round(os.path.getsize("docs/model.json") / 1024, 1), "| vocab:", len(vocab))
print("word-level py accuracy on held-out:", summary)

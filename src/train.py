"""ChurnSignal training + honest evaluation.

Leakage control: the split is done on UNIQUE normalised text, so no message string appears in
both train and test. Every number reported comes from the held-out set.
"""
import json
import re
import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, f1_score, precision_recall_fscore_support, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline, make_union
from textblob import TextBlob

SEED = 7
df = pd.read_csv("data/messages.csv")


def norm(t):
    t = re.sub(r"ref:\s*\d+", "", t.lower())
    t = re.sub(r"\s+", " ", t)
    return re.sub(r"[^\w\s@#']", "", t).strip()


df["key"] = df.text.map(norm)
uniq = df.drop_duplicates("key").reset_index(drop=True)
train_keys, test_keys = train_test_split(uniq.key, test_size=0.25, random_state=SEED)
tr = df[df.key.isin(set(train_keys))].copy()
te = df[df.key.isin(set(test_keys))].copy()
assert not (set(tr.key) & set(te.key)), "LEAKAGE: shared messages across split"
print(f"unique messages: {len(uniq)} | train rows {len(tr)} | test rows {len(te)} | overlap: 0")


def vec():
    return make_union(
        TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True),
        TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=3, sublinear_tf=True),
    )


def fit_eval(target, label_names=None):
    X_tr, X_te = tr.text.map(norm), te.text.map(norm)
    y_tr, y_te = tr[target], te[target]
    model = make_pipeline(vec(), LogisticRegression(max_iter=2000, class_weight="balanced", C=3.0))
    model.fit(X_tr, y_tr)
    pred = model.predict(X_te)
    p, r, f, _ = precision_recall_fscore_support(y_te, pred, average="macro", zero_division=0)
    return model, y_te, pred, dict(precision=round(p, 3), recall=round(r, 3), f1=round(f, 3),
                                    accuracy=round(float((pred == y_te).mean()), 3))


report = {"split": {"unique_messages": int(len(uniq)), "train_rows": int(len(tr)),
                    "test_rows": int(len(te)), "text_overlap": 0}}

# ---- 1. Sentiment: TextBlob lexicon baseline vs trained model
def tb_label(t):
    p = TextBlob(t).sentiment.polarity
    return "positive" if p > 0.1 else ("negative" if p < -0.1 else "neutral")


tb_pred = te.text.map(tb_label)
tb_p, tb_r, tb_f, _ = precision_recall_fscore_support(te.sentiment, tb_pred, average="macro", zero_division=0)
report["sentiment_baseline_textblob"] = dict(precision=round(tb_p, 3), recall=round(tb_r, 3),
                                             f1=round(tb_f, 3), accuracy=round(float((tb_pred == te.sentiment).mean()), 3))
m_sent, y, p, rep = fit_eval("sentiment")
report["sentiment_model"] = rep
report["sentiment_confusion"] = {"labels": ["negative", "neutral", "positive"],
                                 "matrix": confusion_matrix(y, p, labels=["negative", "neutral", "positive"]).tolist()}

# the sarcasm test: where the lexicon baseline is supposed to fail
sar = te[te.sarcastic == 1]
report["sarcasm_subset"] = {
    "n": int(len(sar)),
    "textblob_correct_pct": round(100 * float((sar.text.map(tb_label) == sar.sentiment).mean()), 1),
    "model_correct_pct": round(100 * float((m_sent.predict(sar.text.map(norm)) == sar.sentiment).mean()), 1),
}

# ---- 2. Aspect
m_asp, y, p, rep = fit_eval("aspect")
report["aspect_model"] = rep

# ---- 3. Churn intent (the headline task) : report positive-class precision/recall
neg_only_tr = tr
m_churn, y, p, _ = fit_eval("churn_intent")
pr, rc, f1, _ = precision_recall_fscore_support(y, p, average="binary", zero_division=0)
report["churn_model"] = dict(precision=round(pr, 3), recall=round(rc, 3), f1=round(f1, 3),
                             accuracy=round(float((p == y).mean()), 3),
                             support_positive=int(y.sum()), support_total=int(len(y)))
# baseline: "any negative sentiment = will churn"
naive = (te.sentiment == "negative").astype(int)
npr, nrc, nf1, _ = precision_recall_fscore_support(te.churn_intent, naive, average="binary", zero_division=0)
report["churn_baseline_any_negative"] = dict(precision=round(npr, 3), recall=round(nrc, 3), f1=round(nf1, 3))
# baseline 2: keyword rule
KW = re.compile(r"\b(switch|cancel|port(ing)?|leave|closing my account|moving to|last month|here i come)\b")
kw = te.text.str.lower().map(lambda t: int(bool(KW.search(t))))
kpr, krc, kf1, _ = precision_recall_fscore_support(te.churn_intent, kw, average="binary", zero_division=0)
report["churn_baseline_keywords"] = dict(precision=round(kpr, 3), recall=round(krc, 3), f1=round(kf1, 3))

# ---- 4. Urgency
m_urg, y, p, _ = fit_eval("urgent")
pr, rc, f1, _ = precision_recall_fscore_support(y, p, average="binary", zero_division=0)
report["urgency_model"] = dict(precision=round(pr, 3), recall=round(rc, 3), f1=round(f1, 3))

# ---- 5. Top drivers (explainability): words that push toward churn
vecs = m_churn.steps[0][1].transformer_list[0][1]
coef = m_churn.steps[1][1].coef_[0][: len(vecs.get_feature_names_out())]
names = vecs.get_feature_names_out()
top = np.argsort(coef)[::-1][:12]
report["churn_top_drivers"] = [[str(names[i]), round(float(coef[i]), 2)] for i in top]

json.dump(report, open("reports/metrics.json", "w"), indent=2)
joblib.dump({"sentiment": m_sent, "aspect": m_asp, "churn": m_churn, "urgent": m_urg}, "reports/models.joblib")

for k, v in report.items():
    if k not in ("sentiment_confusion", "churn_top_drivers"):
        print(f"{k}: {v}")
print("top churn drivers:", [d[0] for d in report["churn_top_drivers"]])

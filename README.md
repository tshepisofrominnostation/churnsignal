# ChurnSignal

**Most angry customers stay. ChurnSignal finds the ones who won't.**

A churn-intent triage console for South African telecom customer messages (WhatsApp, X, Hellopeter-style text).
Sentiment alone says someone is unhappy. ChurnSignal predicts who is *leaving*, how urgent it is, and what it is about,
so a small care team replies to the right messages first.

**Live demo:** https://tshepisofrominnostation.github.io/churnsignal/
**Built for:** CAPACITI x Clickatell 1-Month AI Bootcamp, Week 3 (Sentiment Analysis and Data Insights)

## Why this problem

Telcos watch social media for two signals: customers wanting to **cancel** and customers wanting to **buy**. DataEQ's SA Telecoms
Index found cancellation risk (3.0%) outweighed purchase interest (2.0%) across the five operators it analysed, and that **two thirds
of purchase-intent mentions went unanswered**. Hellopeter, which receives about half its reviews over WhatsApp, relaunched in
September 2026 with AI scoring of reviews by service theme. The volume is too large to read by hand, and a flat positive/negative
label does not tell a care team who to reply to first.

## What it does

| Output | Meaning |
|---|---|
| Churn intent | Is this customer signalling they will leave? |
| Urgency | Does the message demand a fast reply? |
| Topic | Network, billing, customer service, fibre install, data and pricing, contract and porting |
| Sentiment | Positive, neutral, negative (sarcasm-aware) |
| Priority band | RESPOND NOW / TODAY / THIS WEEK / MONITOR |
| Explanation | The exact words that pushed the churn score up |

## Results (held-out test set, 819 messages never seen in training)

| Task | ChurnSignal | Baseline |
|---|---|---|
| Churn intent F1 | **90.0%** (P 93.8%, R 86.5%) | keyword rule 49.9%; "every negative = leaving" 49.8% |
| Sentiment macro F1 | **96.0%** | TextBlob lexicon 31.1% |
| Sarcasm read correctly | **95.5%** (110 messages) | TextBlob 5.5% |
| Topic macro F1 | **96.5%** | n/a |
| Urgency F1 | **77.5%** (weakest task) | n/a |

**The business number:** if a team can only answer the top 20% of messages, ranking by ChurnSignal reaches
**74.5% of the customers who were actually leaving**, against 18.3% when replying in arrival order.

**Browser = Python:** the in-browser engine reproduces the Python model's predictions on 100.0% of the held-out set
(all four tasks, 3,276 predictions compared).

## Honest limitations (please read)

1. **The data is synthetic.** 3,600 messages generated from templates modelled on public themes in South African telecom complaints.
   It is not scraped from Hellopeter, X or any person. Real-world accuracy will be lower. This is the single biggest caveat.
2. **Labels are generated, not human-annotated.** That is what makes precision and recall reportable, and why a pilot on real,
   human-labelled messages is the first next step.
3. **A first run scored 1.000 on everything.** That was a warning, not a result: the templates were too easy. The generator was
   hardened with paraphrase, implicit churn, look-alike non-churn ("I would never cancel"), code-switching and 5-6% label noise
   before the figures above were produced.
4. **Leakage control.** The train/test split is made on *unique normalised text* (1,909 unique messages from 3,600 rows), so no
   message string appears on both sides.
5. **Provider comparisons are not findings.** Provider was assigned at random, so differences between operators are noise.
6. **English-dominant.** A handful of code-switched examples only; isiZulu, isiXhosa and Afrikaans coverage is minimal.
7. **Urgency is weak** (77.5% F1) and should not drive decisions on its own.

## Technical explanation

- **Features:** TF-IDF over word 1-2 grams (sublinear tf). The Python research model also adds character 3-5 grams.
- **Models:** four logistic-regression heads (balanced class weights) for churn, urgency, sentiment, topic.
- **Evaluation:** macro precision, recall and F1 on the held-out set; churn and urgency also report the positive class.
- **Explainability:** each message shows the terms with the largest positive contribution to the churn score.
- **Deployment:** the word-level model is exported to `docs/model.json` (about 167 KB) and scored in the browser by `docs/engine.js`.
  No server, no uploads, no monthly cost.

## Run it

```bash
pip install scikit-learn pandas numpy textblob joblib
python src/make_data.py      # generate data/messages.csv
python src/train.py          # leakage-safe split, train, evaluate -> reports/metrics.json
python src/export_model.py   # export docs/model.json
python src/parity.py         # measure browser-vs-Python agreement
python src/build_report.py   # compile docs/report.json
cd docs && python -m http.server   # open http://localhost:8000
```

## Repository layout

```
src/        data generator, training, export, parity test, report builder
data/       synthetic messages.csv
reports/    metrics.json, parity.json, report.json, test_set.csv
docs/       the deployed site (index.html, app.js, engine.js, model.json)
```

## Next steps

Pilot on 500-1,000 real, human-labelled messages (with consent and POPIA-compliant handling); add isiZulu/isiXhosa/Afrikaans
coverage; calibrate probabilities; measure how triage changes real reply times.

Author: Tshepiso Freddy Thosago

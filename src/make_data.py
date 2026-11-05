"""ChurnSignal - synthetic South African telecom customer-message generator.

HONESTY NOTE: this is SYNTHETIC data, written from templates modelled on the themes seen in
public SA telecom complaint discussion (network quality, billing, customer service, fibre
installs, data depletion, contract exit/porting). It is NOT scraped from Hellopeter or any
person. Every row carries a ground-truth label assigned at generation time, which is the only
reason we can honestly report precision/recall/F1. Real-data validation is the stated next step.
"""
import csv
import os
import random
from collections import Counter

random.seed(2026)

PROVIDERS = ["Vodacom", "MTN", "Telkom", "Cell C", "Rain", "Afrihost Fibre", "Vumatel Fibre"]
CHANNELS = ["WhatsApp", "X/Twitter", "Hellopeter", "Facebook", "Call-centre note"]

ASPECTS = {
    "Network quality": (
        ["signal drops every evening", "no coverage at my house since load shedding started",
         "data speeds are unusable", "calls keep cutting out", "the tower near us has been down for days",
         "LTE shows full bars but nothing loads"],
        ["coverage in my area has been solid", "speeds are great, streaming works fine",
         "calls are crystal clear now"],
        ["is the network down in Soweto?", "can someone confirm the outage status"]),
    "Billing": (
        ["I was charged twice this month", "my bill jumped by R400 with no explanation",
         "out of bundle charges I never agreed to", "debit order went off for a cancelled line",
         "airtime was deducted for a service I never used"],
        ["the billing breakdown is clear and accurate", "refund for the double charge arrived quickly"],
        ["where do I download my invoice?", "what date does my debit order run"]),
    "Customer service": (
        ["I have been on hold for 90 minutes", "nobody replies to my queries",
         "the agent hung up on me", "sent to three different departments and nobody owns this",
         "ticket closed with no resolution", "no response from support in two weeks"],
        ["the agent was patient and fixed it first time", "support on WhatsApp was quick and helpful"],
        ["what are the call centre hours", "how do I log a query"]),
    "Fibre installation": (
        ["the technician never arrived for the third time", "installation promised in 5 days, now week five",
         "fibre line still not live after paying the setup fee", "router delivered but no connection"],
        ["install was done in two days, very professional", "the technician explained everything"],
        ["is fibre available in my street", "what is the install lead time in Centurion"]),
    "Data & pricing": (
        ["my data depleted in a day for no reason", "expensive compared to the competition",
         "prepaid data expires too quickly", "price hike with no notice"],
        ["the new bundle is great value", "cheaper than my previous provider"],
        ["what bundles are available", "how do I check my balance"]),
    "Contract & porting": (
        ["they refuse to cancel my contract", "porting out is being blocked",
         "stuck in a contract I was misled into", "cancellation fee is not what the salesperson said"],
        ["cancellation was painless", "porting took ten minutes"],
        ["how do I port my number", "what is the cancellation notice period"]),
}

CHURN_CUES = [
    "I am switching to {rival} this week", "cancelling my contract after this",
    "taking my number to {rival}", "this is my last month with you",
    "I will be porting out as soon as I can", "done with {prov}, moving to {rival}",
    "ready to leave {prov} for good", "closing my account today", "{rival} here I come",
]
ANGRY_NO_CHURN = ["absolutely disgusting", "this is unacceptable", "I am furious", "so frustrating",
                  "terrible, just terrible", "completely fed up", "ridiculous"]
# sarcasm: (template, aspect) so the aspect label is always correct
SARCASM = [
    ("Great job {prov}, another perfect outage. Really impressive stuff.", "Network quality"),
    ("Oh wonderful, billed twice again. Thanks so much {prov}.", "Billing"),
    ("Love waiting 90 minutes on hold. Best service ever {prov}.", "Customer service"),
    ("Brilliant, the technician no-showed. Again. Fantastic.", "Fibre installation"),
]
URGENT_CUES = ["urgent", "please respond", "need this fixed today", "escalating this",
               "@{prov} please help", "my business is losing money",
               "I work from home and this is critical"]
# Hard cases the keyword baselines get wrong
NOT_CHURN_BUT_LOOKS_LIKE = [
    "I would never cancel, I just want this fixed", "not switching, but I want a refund",
    "my friend ported to {rival} and loves it, I am staying put", "they asked if I want to cancel the old line, I said no",
    "how do I cancel the add-on service only", "do not cancel my contract by mistake like last time",
    "someone told me to port out. I refuse, fix this instead",
]
IMPLICIT_CHURN = [
    "{rival} has a better deal and honestly I am tempted. one more strike and I am gone",
    "I have already requested my PAC, so you have until Friday",
    "my contract ends next month and I am not renewing", "I will not be renewing, you lost me",
    "taking my business elsewhere", "that was the last straw", "don't expect to see me after this month",
    "my whole family is moving across, {rival} gave us a quote",
]
# Code-switching typical of SA social media
SA_SLANG = [
    ("ayikho i-network nakanjani, nginenkinga enkulu", "Network quality", 1),
    ("my data is finished again, ke tšhaba", "Data & pricing", 1),
    ("sies, the signal here is useless", "Network quality", 1),
    ("eish, billed again for nothing", "Billing", 1),
    ("shame, the agent tried but could not help", "Customer service", 1),
    ("lekker, the new bundle is sharp", "Data & pricing", 0),
    ("ag man, still waiting for the technician", "Fibre installation", 1),
    ("howzit, is the network down in Mamelodi?", "Network quality", 0),
]
FILLER = ["", "", "", " #{prov}", " Please fix.", " Ref: {ref}", " (2nd time asking)"]


def build(n=3600):
    rows = []
    for i in range(n):
        prov = random.choice(PROVIDERS)
        rival = random.choice([p for p in PROVIDERS if p != prov])
        aspect = random.choice(list(ASPECTS))
        neg, pos, neu = ASPECTS[aspect]
        r = random.random()
        churn = urgent = 0
        sarcastic = 0
        if r < 0.48:
            sentiment = "negative"
            text = random.choice(neg)
            if random.random() < 0.55:
                text += ", " + random.choice(ANGRY_NO_CHURN)
            if random.random() < 0.34:
                churn = 1
                text += ". " + random.choice(CHURN_CUES).format(rival=rival, prov=prov)
            if random.random() < 0.30:
                urgent = 1
                text += ". " + random.choice(URGENT_CUES).format(prov=prov)
        elif r < 0.65:
            sentiment = "positive"
            text = random.choice(pos)
        elif r < 0.78:
            sentiment = "negative"
            sarcastic = 1
            tpl, aspect = random.choice(SARCASM)
            text = tpl.format(prov=prov)
            if random.random() < 0.28:
                churn = 1
                text += " " + random.choice(CHURN_CUES).format(rival=rival, prov=prov) + "."
        else:
            sentiment = "neutral"
            text = random.choice(neu)

        # --- harder cases (override ~35% of rows) ---
        h = random.random()
        if h < 0.10:                                   # looks like churn, is not
            sentiment = "negative"; churn = 0
            text = random.choice(neg) + ". " + random.choice(NOT_CHURN_BUT_LOOKS_LIKE).format(rival=rival)
        elif h < 0.20 and sentiment == "negative":      # churn with NO obvious keyword
            churn = 1
            text = random.choice(neg) + ". " + random.choice(IMPLICIT_CHURN).format(rival=rival)
        elif h < 0.27:                                  # code-switching
            t, a, neg_flag = random.choice(SA_SLANG)
            text, aspect = t, a
            sentiment = "negative" if neg_flag else "positive" if "lekker" in t else "neutral"
            churn = 0

        text += random.choice(FILLER).format(prov=prov, ref=random.randint(10000, 99999))
        text = text.strip()
        if random.random() < 0.25:
            text = text.lower()
        if random.random() < 0.12:
            text = text.replace(",", "").replace(".", "")
        if random.random() < 0.06:          # annotator disagreement
            churn = 1 - churn if sentiment == "negative" else churn
        if random.random() < 0.05:
            sentiment = random.choice(["negative", "neutral", "positive"])
        rows.append({"id": i + 1, "provider": prov, "channel": random.choice(CHANNELS),
                     "aspect": aspect, "text": text, "sentiment": sentiment,
                     "churn_intent": churn, "urgent": urgent, "sarcastic": sarcastic})
    return rows


if __name__ == "__main__":
    rows = build()
    os.makedirs("data", exist_ok=True)
    with open("data/messages.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print("rows:", len(rows))
    print("sentiment:", dict(Counter(r["sentiment"] for r in rows)))
    print("churn_intent:", dict(Counter(r["churn_intent"] for r in rows)))
    print("urgent:", dict(Counter(r["urgent"] for r in rows)))
    print("sarcastic:", dict(Counter(r["sarcastic"] for r in rows)))

#!/usr/bin/env python3
"""
Builds TapTalk's AAC vocabulary.

  * single source of truth for words, categories and conversation topics
  * downloads each word's ARASAAC pictogram into public/symbols/
  * generates src/kid/vocabulary.ts (UI) and convex/vocabulary.ts (backend)

Pictograms: ARASAAC (https://arasaac.org), author Sergio Palao, property of the
Gobierno de Aragon, licensed CC BY-NC-SA 4.0. Non-commercial use only; keep the credit.

Usage:  python3 scripts/build-vocabulary.py [--force] [--review]
  --force   re-download images that already exist
  --review  also write public/_review.html (a contact sheet to eyeball the matches)

scripts/symbol-overrides.json maps a word id to a specific ARASAAC pictogram id when
the automatic best match is wrong.
"""
import concurrent.futures as cf
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "symbols"
SEARCH = "https://api.arasaac.org/v1/pictograms/en/bestsearch/"
IMAGE = "https://static.arasaac.org/pictograms/{id}/{id}_300.png"
OVERRIDES_FILE = ROOT / "scripts" / "symbol-overrides.json"
MAP_FILE = ROOT / "scripts" / "symbol-map.json"


def slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


# (label, optional ARASAAC search query when the label itself searches badly)
W = lambda label, query=None: (label, query)

# The permanent core bar: always on screen, always in this order.
CORE_BAR = [W("I", "I"), W("want"), W("more"), W("yes"), W("no"), W("help"), W("stop"), W("you"), W("like")]

CATEGORIES = [
    dict(id="core", short="Core", name="Core Words", color="#f5c542", icon="star", words=[
        W("we"), W("it"), W("need"), W("go"), W("come"), W("again"), W("all done", "finish"), W("not", "negative"),
        W("my turn", "turn"), W("look"), W("give"), W("make"), W("this"), W("that"), W("can"), W("do"),
        W("feel"), W("here"), W("there"), W("up"), W("down", "descend"), W("in"), W("on"), W("is", "be"), W("are", "be"),
    ]),
    dict(id="social", short="Social", name="Social", color="#f472b6", icon="hello", words=[
        W("hi", "hello"), W("bye", "goodbye"), W("thank you"), W("please"), W("friend"), W("sorry"),
        W("good morning"), W("good night"), W("excuse me", "attention"), W("share"), W("nice"), W("love"), W("hug"),
        W("wait"), W("welcome"),
    ]),
    dict(id="feelings", short="Feelings", name="Feelings", color="#facc15", icon="happy", words=[
        W("happy"), W("sad"), W("angry"), W("scared"), W("excited"), W("tired"), W("frustrated", "furious"),
        W("sick"), W("bored"), W("proud"), W("silly", "clown"), W("worried"), W("calm"), W("surprised"),
        W("lonely"), W("shy"),
    ]),
    dict(id="food", short="Food", name="Food & Drinks", color="#fb923c", icon="apple", words=[
        W("apple"), W("banana"), W("pizza"), W("sandwich"), W("cookie"), W("cracker"), W("cheese"),
        W("bread"), W("cereal"), W("pasta"), W("chicken"), W("french fries"), W("ice cream"), W("cake"),
        W("carrot"), W("grapes"), W("water"), W("juice"), W("milk"), W("snack"), W("hungry"),
        W("thirsty"), W("yummy", "delicious"), W("yucky", "disgusting"),
    ]),
    dict(id="toys", short="Toys", name="Toys & Play", color="#22c55e", icon="teddy bear", words=[
        W("train"), W("ball"), W("blocks", "blocks"), W("car"), W("doll"), W("teddy bear"),
        W("puzzle"), W("bubbles"), W("swing"), W("slide"), W("playground"), W("game"), W("bicycle"),
        W("music"), W("dance"), W("sing"), W("tablet"), W("tv", "television"), W("tracks", "railway"),
        W("play"),
    ]),
    dict(id="home", short="Home", name="Home & Family", color="#a78bfa", icon="house", words=[
        W("mom", "mother"), W("dad", "father"), W("brother"), W("sister"), W("baby"), W("grandma", "grandmother"),
        W("grandpa", "grandfather"), W("family"), W("home", "house"), W("bedroom"), W("bathroom"),
        W("kitchen"), W("bed"), W("sleep"), W("couch", "sofa"), W("door"), W("bath"), W("shower"),
        W("pajamas", "pyjamas"), W("shoes"), W("jacket"), W("window"),
    ]),
    dict(id="school", short="School", name="School", color="#38bdf8", icon="school", words=[
        W("teacher"), W("class", "classroom"), W("school"), W("book"), W("pencil"), W("paper"),
        W("scissors"), W("backpack"), W("read"), W("write"), W("draw"), W("recess", "playground"),
        W("lunch"), W("desk", "school table"), W("computer"), W("count"), W("learn"), W("bus", "school bus"),
        W("homework"), W("art", "painting"),
    ]),
    dict(id="animals", short="Animals", name="Animals", color="#84cc16", icon="dog", words=[
        W("dog"), W("cat"), W("bird"), W("fish"), W("horse"), W("cow"), W("pig"), W("duck"), W("rabbit"),
        W("elephant"), W("lion"), W("monkey"), W("bear"), W("frog"), W("zoo"), W("butterfly"),
        W("turtle"), W("sheep"),
    ]),
    dict(id="colors", short="Colors", name="Colors & Shapes", color="#2dd4bf", icon="rainbow", words=[
        W("red"), W("blue"), W("green"), W("yellow"), W("orange", "orange"), W("purple"), W("pink"),
        W("black"), W("white"), W("brown"), W("circle"), W("square"), W("triangle"), W("star"),
        W("heart"), W("big"), W("small"), W("long"), W("short"), W("hot"), W("cold"), W("fast"),
        W("slow"), W("loud", "shout"), W("quiet"),
    ]),
    dict(id="actions", short="Actions", name="Actions", color="#4ade80", icon="run", words=[
        W("eat"), W("drink"), W("run"), W("walk"), W("sit"), W("stand"), W("open"), W("close"),
        W("jump"), W("throw"), W("catch"), W("push"), W("pull", "tug"), W("climb"), W("wash"),
        W("brush teeth", "brush teeth"), W("show"), W("find"), W("take"), W("clap"), W("kick"),
        W("cook"), W("ride"), W("hold"),
    ]),
    dict(id="questions", short="Questions", name="Questions", color="#60a5fa", icon="question", words=[
        W("what"), W("where"), W("who"), W("why"), W("when"), W("how"), W("which", "choose"), W("how many"),
        W("can I", "request permission"), W("can we", "permission"), W("do you", "question"), W("is it", "be"),
        W("are you okay", "ok"), W("your name", "name"),
    ]),
    dict(id="needs", short="Needs", name="Needs & Comfort", color="#f87171", icon="bandage", words=[
        W("hurt"), W("toilet"), W("break", "rest"), W("too loud", "noisy"), W("uncomfortable"),
        W("doctor"), W("medicine"), W("band-aid", "bandage"), W("too bright", "sunglasses"),
        W("headphones"), W("blanket"), W("tissue"), W("wash hands", "soap"), W("quiet space", "silence"),
        W("not now", "later"), W("don't know", "I don't know"), W("tummy ache", "stomach ache"), W("headache"),
    ]),
]

# Deterministic conversation topics. `words` are tagged with the topic; `extra` are extra
# trigger words; `suggest` is the shortcut row (order matters, max 5).
TOPICS = [
    dict(id="trains", label="trains", suggest=["train", "tracks", "fast", "more", "play"],
         words=["train", "tracks", "fast", "slow", "ride"],
         extra=["choo", "railway", "locomotive", "engine", "trains"]),
    dict(id="food", label="food", suggest=["eat", "hungry", "apple", "water", "yummy"],
         words=["eat", "drink", "hungry", "thirsty", "yummy", "yucky", "apple", "banana", "pizza", "sandwich",
                "cookie", "cracker", "cheese", "bread", "cereal", "pasta", "chicken", "french-fries", "ice-cream",
                "cake", "carrot", "grapes", "water", "juice", "milk", "snack", "lunch", "cook"],
         extra=["food", "dinner", "breakfast", "meal", "fries", "hungry"]),
    dict(id="feelings", label="feelings", suggest=["happy", "sad", "excited", "scared", "angry"],
         words=["happy", "sad", "angry", "scared", "excited", "tired", "frustrated", "bored", "proud", "silly",
                "worried", "calm", "surprised", "lonely", "shy", "feel"],
         extra=["feelings", "upset", "mad", "emotion", "emotions", "feeling"]),
    dict(id="animals", label="animals", suggest=["dog", "cat", "bird", "fish", "zoo"],
         words=["dog", "cat", "bird", "fish", "horse", "cow", "pig", "duck", "rabbit", "elephant", "lion",
                "monkey", "bear", "frog", "zoo", "butterfly", "turtle", "sheep"],
         extra=["animal", "animals", "pet", "puppy", "kitty"]),
    dict(id="play", label="play", suggest=["play", "ball", "blocks", "again", "my-turn"],
         words=["ball", "blocks", "car", "doll", "teddy-bear", "puzzle", "bubbles", "swing", "slide",
                "playground", "game", "bicycle", "play", "dance", "sing", "music", "tablet", "tv"],
         extra=["toy", "toys", "fun", "games"]),
    dict(id="school", label="school", suggest=["teacher", "book", "read", "pencil", "recess"],
         words=["teacher", "class", "school", "book", "pencil", "paper", "scissors", "backpack", "read", "write",
                "draw", "recess", "desk", "computer", "count", "learn", "bus", "homework", "art"],
         extra=["classroom", "reading", "writing"]),
    dict(id="family", label="family", suggest=["mom", "dad", "home", "sister", "brother"],
         words=["mom", "dad", "brother", "sister", "baby", "grandma", "grandpa", "family", "home", "bedroom",
                "bathroom", "kitchen", "bed", "sleep"],
         extra=["mother", "father", "mommy", "daddy", "house", "grandmother", "grandfather"]),
    dict(id="needs", label="how you feel", suggest=["help", "hurt", "break", "doctor", "medicine"],
         words=["hurt", "doctor", "medicine", "band-aid", "headache", "tummy-ache", "toilet", "break",
                "too-loud", "uncomfortable", "sick", "help"],
         extra=["pain", "ouch", "owie", "ache"]),
    dict(id="colors", label="colors", suggest=["red", "blue", "green", "yellow", "big"],
         words=["red", "blue", "green", "yellow", "orange", "purple", "pink", "black", "white", "brown", "circle",
                "square", "triangle", "star", "heart", "big", "small"],
         extra=["color", "colour", "colors", "colours", "shape", "shapes"]),
]

HEADERS = {"User-Agent": "TapTalk-hackathon-build/1.0 (AAC demo; non-commercial)"}


def http(url, binary=False, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            return data if binary else json.loads(data)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.6 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def resolve(item):
    """-> (word id, arasaac pictogram id, matched keyword)"""
    label, query = item
    wid = slug(label)
    overrides = json.loads(OVERRIDES_FILE.read_text()) if OVERRIDES_FILE.exists() else {}
    if wid in overrides:
        return wid, overrides[wid], "(override)"
    q = query or label
    try:
        results = http(SEARCH + urllib.parse.quote(q))
    except RuntimeError:
        return wid, None, "(search failed)"
    for r in results or []:
        # Skip anything flagged for sexual or violent content: this is a children's app.
        if r.get("sex") or r.get("violence"):
            continue
        kw = (r.get("keywords") or [{}])[0].get("keyword", "")
        return wid, r["_id"], kw
    return wid, None, "(no result)"


def fetch_image(dest_name, pid, force):
    dest = OUT / f"{dest_name}.png"
    if dest.exists() and not force:
        return True
    try:
        dest.write_bytes(http(IMAGE.format(id=pid), binary=True))
        return True
    except RuntimeError as e:
        print("  download failed:", e)
        return False


def main():
    force = "--force" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)

    items = [(w, "bar", None) for w in CORE_BAR]
    for c in CATEGORIES:
        items += [(w, c["id"], None) for w in c["words"]]
    ids = [slug(w[0]) for w, _, _ in items]
    dupes = {i for i in ids if ids.count(i) > 1}
    assert not dupes, f"duplicate word ids: {dupes}"

    with cf.ThreadPoolExecutor(8) as ex:
        resolved = list(ex.map(lambda t: resolve(t[0]), items))
        cat_icons = list(ex.map(lambda c: resolve((c["icon"], None)), CATEGORIES))

    mapping, failed = {}, []
    with cf.ThreadPoolExecutor(8) as ex:
        jobs = []
        for (item, _, _), (wid, pid, kw) in zip(items, resolved):
            if pid is None:
                failed.append(wid)
                continue
            mapping[wid] = dict(arasaac=pid, query=item[1] or item[0], matched=kw)
            jobs.append((wid, ex.submit(fetch_image, wid, pid, force)))
        for c, (wid, pid, kw) in zip(CATEGORIES, cat_icons):
            if pid is None:
                failed.append("cat-" + c["id"])
                continue
            mapping["cat-" + c["id"]] = dict(arasaac=pid, query=c["icon"], matched=kw)
            jobs.append(("cat-" + c["id"], ex.submit(fetch_image, "cat-" + c["id"], pid, force)))
        for wid, f in jobs:
            if not f.result():
                failed.append(wid)

    MAP_FILE.write_text(json.dumps(mapping, indent=1, sort_keys=True))
    if failed:
        print("MISSING pictograms for:", failed)

    # ---- generate src/vocabulary.ts --------------------------------------------------
    cat_of = {slug(w[0]): "bar" for w in CORE_BAR}
    for c in CATEGORIES:
        for w in c["words"]:
            cat_of[slug(w[0])] = c["id"]
    tags = {}
    for t in TOPICS:
        for wid in t["words"]:
            assert wid in cat_of, f"topic {t['id']} references unknown word {wid}"
            tags.setdefault(wid, []).append(t["id"])
        for wid in t["suggest"]:
            assert wid in cat_of, f"topic {t['id']} suggests unknown word {wid}"

    def word_ts(label, wid):
        parts = [f"id: {json.dumps(wid)}", f"label: {json.dumps(label)}", f"category: {json.dumps(cat_of[wid])}",
                 f"image: {json.dumps('/symbols/' + wid + '.png')}"]
        if wid in tags:
            parts.append(f"tags: {json.dumps(tags[wid])}")
        return "  { " + ", ".join(parts) + " },"

    lines = [
        "// GENERATED by scripts/build-vocabulary.py. Edit the script, not this file.",
        "// Pictograms: ARASAAC (https://arasaac.org), Sergio Palao, Gobierno de Aragon. CC BY-NC-SA 4.0.",
        "",
        "export type Word = { id: string; label: string; category: string; image: string; tags?: string[] };",
        "export type Category = { id: string; name: string; short: string; color: string; icon: string };",
        "export type Topic = { id: string; label: string; keywords: string[]; suggest: string[] };",
        "",
        "export const WORDS: Word[] = [",
    ]
    for label, _ in CORE_BAR:
        lines.append(word_ts(label, slug(label)))
    for c in CATEGORIES:
        for label, _ in c["words"]:
            lines.append(word_ts(label, slug(label)))
    lines += ["];", "", "/** Permanent core bar. Fixed order so button locations never move. */",
              "export const CORE_BAR: string[] = " + json.dumps([slug(w[0]) for w in CORE_BAR]) + ";", "",
              "export const CATEGORIES: Category[] = ["]
    for c in CATEGORIES:
        lines.append("  " + json.dumps(dict(id=c["id"], name=c["name"], short=c["short"], color=c["color"], icon="/symbols/cat-" + c["id"] + ".png")) + ",")
    lines += ["];", "", "export const TOPICS: Topic[] = ["]
    label_of = {slug(l): l for l, _ in CORE_BAR}
    for c in CATEGORIES:
        label_of.update({slug(l): l for l, _ in c["words"]})
    for t in TOPICS:
        kws = set(t["extra"])
        for wid in t["words"]:
            kws.update(re.split(r"[^a-z]+", label_of[wid].lower()))
        kws -= {"", "too", "and", "the", "you", "can", "how", "for", "are", "not"}
        kws = {k for k in kws if len(k) >= 3}
        lines.append("  " + json.dumps(dict(id=t["id"], label=t["label"], keywords=sorted(kws), suggest=t["suggest"])) + ",")
    lines += ["];", ""]
    (ROOT / "src" / "kid" / "vocabulary.ts").write_text("\n".join(lines))

    # Backend copy: ids and labels only, inside convex/ so deploys never import from src/.
    backend = [
        "// GENERATED by scripts/build-vocabulary.py. Edit the script, not this file.",
        "// Same words, ids and order as src/kid/vocabulary.ts. A symbol is stored and sent as its `label`;",
        "// the id is the same label slugified (see convex/symbols.ts).",
        "",
        "export const VOCABULARY: ReadonlyArray<{ id: string; label: string }> = [",
    ]
    for label, _ in CORE_BAR:
        backend.append(f"  {{ id: {json.dumps(slug(label))}, label: {json.dumps(label)} }},")
    for c in CATEGORIES:
        for label, _ in c["words"]:
            backend.append(f"  {{ id: {json.dumps(slug(label))}, label: {json.dumps(label)} }},")
    backend += ["];", ""]
    (ROOT / "convex" / "vocabulary.ts").write_text("\n".join(backend))
    print(f"{len(ids)} words, {len(CATEGORIES)} categories, {len(TOPICS)} topics -> src/kid/vocabulary.ts")

    if "--review" in sys.argv:
        cells = []
        for (label, _), _c, _ in items:
            wid = slug(label)
            m = mapping.get(wid, {})
            cells.append(f"<figure><img src='/symbols/{wid}.png'><figcaption><b>{label}</b><br>{m.get('matched', '?')}</figcaption></figure>")
        (ROOT / "public" / "_review.html").write_text(
            "<style>body{background:#fff;font:11px sans-serif;display:flex;flex-wrap:wrap;gap:6px}"
            "figure{margin:0;width:88px;text-align:center}img{width:72px;height:72px}</style>" + "".join(cells))


if __name__ == "__main__":
    main()

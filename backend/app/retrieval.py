"""BM25 retrieval over reference records. Gemma only ever sees what this returns."""

import re

from rank_bm25 import BM25Okapi

_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = {
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "is", "are", "be", "by", "my", "our", "we", "i",
    "what", "which", "who", "when", "where", "how", "should", "check", "before", "after", "do", "does", "need", "can",
    "about", "it", "this", "that", "if", "any", "there", "me", "you", "your", "will", "would", "might", "may", "into",
}


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP]


def _doc_text(item: dict) -> str:
    parts = [
        item.get("title") or item.get("name", ""),
        item.get("summary", ""),
        " ".join(item.get("keywords", [])),
        " ".join(item.get("industries", [])),
        " ".join(item.get("capabilities", [])),
        item.get("category", ""),
        item.get("authority", ""),
    ]
    return " ".join(p for p in parts if p)


def rank(query: str, items: list[dict], k: int | None = None) -> list[tuple[dict, float]]:
    if not items:
        return []
    corpus = [tokenize(_doc_text(i)) or ["_"] for i in items]
    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(tokenize(query) or ["_"])
    ranked = sorted(zip(items, scores), key=lambda p: p[1], reverse=True)
    return ranked[:k] if k else ranked


def matched_terms(query: str, item: dict, limit: int = 4) -> list[str]:
    q = set(tokenize(query))
    seen = []
    for t in tokenize(_doc_text(item)):
        if t in q and t not in seen:
            seen.append(t)
    return seen[:limit]

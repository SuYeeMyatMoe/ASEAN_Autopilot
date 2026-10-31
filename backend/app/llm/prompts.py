"""Prompt templates. Every regulatory prompt is closed-book over retrieved records."""

import json

GUARDRAIL = (
    "You are the reasoning engine of ASEAN Mission Control, a market-entry guidance tool for ASEAN startups. "
    "You give guidance, never legal, tax or immigration advice. "
    "Use ONLY the source records provided. Do not add requirements, thresholds, dates or figures from your own knowledge. "
    "If the records do not answer something, say it needs verification. "
    "Missing documents or unanswered questions are gaps to investigate, never non-compliance."
)


def _records_block(records: list[dict]) -> str:
    slim = [
        {k: r.get(k) for k in ("id", "country", "area", "category", "sector", "title", "summary", "authority", "instrument", "foreign_ownership_notes")}
        for r in records
    ]
    return json.dumps(slim, ensure_ascii=False)


def founder_dna(text: str, n_images: int, scanned: bool = False) -> str:
    source = (
        "The document text below was transcribed from the founder's uploaded files (including slide images, "
        "screenshots and scanned pages) by a document scanner.\n"
        if scanned
        else f"You have {n_images} image(s) (pitch slides, product screenshots or posters) plus extracted document text below.\n"
    )
    return (
        "Analyse this startup's materials and build a Founder DNA profile.\n"
        f"{source}"
        "Only state what the materials support. Leave fields empty rather than guessing. "
        "origin_country and target_countries are ISO alpha-2 codes. "
        "sector must be one of: healthcare, fintech, education, logistics, agritech, commerce, all. "
        "Put up to 5 questions in follow_up_questions for information a market-entry adviser would need but is missing "
        "(for example ownership, intended local structure, regulatory classification, data flows).\n\n"
        f"DOCUMENT TEXT:\n{text or '(none)'}"
    )


def _materials(materials: str) -> str:
    return f"\n\nFROM THE FOUNDER'S UPLOADED FILES:\n{materials}" if materials else ""


def passport(dna: dict, objective: str, target: str, records: list[dict], materials: str = "") -> str:
    return (
        f"{GUARDRAIL}\n\n"
        f"Build a personalised Country Launch Passport for entering {target}.\n"
        "For EVERY source record below, return one item with record_id set to that record's id. "
        "Explain in one or two sentences why it applies to THIS startup (use its activities, data handling and objective). "
        "Set applies=false only if it clearly does not apply. Pick a status:\n"
        "- information_available: the founder's material already evidences this\n"
        "- action_required: a known task or document is needed\n"
        "- professional_review_required: applicability depends on legal/regulatory judgement\n"
        "- information_missing: the founder must supply details first\n"
        "- source_verification_pending: the record is too general to rely on for this case\n"
        "List evidence_available (facts from the profile) and missing (what is not yet known). "
        "next_action is one concrete step starting with a verb.\n\n"
        f"FOUNDER DNA:\n{json.dumps(dna, ensure_ascii=False)}{_materials(materials)}\n\nOBJECTIVE:\n{objective}\n\n"
        f"SOURCE RECORDS:\n{_records_block(records)}"
    )


def discover(dna: dict, objective: str, candidates: list[dict], materials: str = "") -> str:
    slim = [{k: c.get(k) for k in ("id", "kind", "name", "country", "summary", "industries", "capabilities", "stage")} for c in candidates]
    return (
        "Rank these ecosystem resources (programmes, funding, partners, talent) for the startup's mission. "
        "Return the most useful ones only (max 8), each with fit and a one-sentence reason that names a concrete link "
        "between the resource and the startup. Use only the ids given.\n\n"
        f"FOUNDER DNA:\n{json.dumps(dna, ensure_ascii=False)}{_materials(materials)}\n\nMISSION:\n{objective}\n\nCANDIDATES:\n{json.dumps(slim, ensure_ascii=False)}"
    )


def compare(dna: dict, countries: list[str], areas: dict, records: list[dict]) -> str:
    return (
        f"{GUARDRAIL}\n\n"
        f"Compare market entry into {', '.join(countries)} for this startup across these areas: {json.dumps(areas)}.\n"
        "Return one cell per (country, area). highlight is one sentence on what matters for this startup there, "
        "based only on the records; record_ids lists the records used. If no record covers a cell, highlight must say "
        "'Not yet sourced' and unknowns must say what to verify. Do NOT rank countries. "
        "trade_offs: 3 to 5 neutral sentences contrasting the markets. open_questions: what the founder must find out.\n\n"
        f"FOUNDER DNA:\n{json.dumps(dna, ensure_ascii=False)}\n\nSOURCE RECORDS:\n{_records_block(records)}"
    )


def consult_pack(dna: dict, objective: str, question: str, records: list[dict], referrals: list[dict], materials: str = "") -> str:
    return (
        f"{GUARDRAIL}\n\n"
        "Prepare a consultation preparation package the founder will review before sending to an authority or adviser. "
        "Write in a neutral, factual tone. questions_to_ask: 4 to 7 specific questions. "
        "relevant_record_ids and suggested_referral_ids must come from the lists given.\n\n"
        f"FOUNDER QUESTION:\n{question}\n\nFOUNDER DNA:\n{json.dumps(dna, ensure_ascii=False)}{_materials(materials)}\n\nMISSION:\n{objective}\n\n"
        f"SOURCE RECORDS:\n{_records_block(records)}\n\nREFERRAL CHANNELS:\n{json.dumps(referrals, ensure_ascii=False)}"
    )


def radar_diff(record: dict, old: dict, new: dict) -> str:
    return (
        f"{GUARDRAIL}\n\n"
        "Compare two versions of a monitored regulatory source. Summarise what changed, state the stage change "
        "(announced, enacted, effective), and list review_tasks a startup with an existing market-entry checklist should do.\n\n"
        f"RECORD:\n{json.dumps({'id': record['id'], 'title': record['title'], 'country': record['country']})}\n\n"
        f"OLD VERSION ({old['stage']}, {old['date']}):\n{old['text']}\n\nNEW VERSION ({new['stage']}, {new['date']}):\n{new['text']}"
    )

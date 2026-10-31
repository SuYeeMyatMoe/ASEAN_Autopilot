"""Read-only reference data: regulatory records, agencies, ecosystem entries."""

import json
from functools import lru_cache
from pathlib import Path

SEED_DIR = Path(__file__).resolve().parent / "seed"

COUNTRIES = {
    "ID": {"name": "Indonesia", "lat": -6.2, "lon": 106.8, "covered": True},
    "MY": {"name": "Malaysia", "lat": 3.14, "lon": 101.69, "covered": True},
    "SG": {"name": "Singapore", "lat": 1.35, "lon": 103.82, "covered": True},
    "TH": {"name": "Thailand", "lat": 13.75, "lon": 100.5, "covered": False},
    "VN": {"name": "Vietnam", "lat": 21.03, "lon": 105.85, "covered": False},
    "PH": {"name": "Philippines", "lat": 14.6, "lon": 120.98, "covered": False},
    "KH": {"name": "Cambodia", "lat": 11.56, "lon": 104.92, "covered": False},
    "LA": {"name": "Lao PDR", "lat": 17.97, "lon": 102.6, "covered": False},
    "MM": {"name": "Myanmar", "lat": 19.76, "lon": 96.08, "covered": False},
    "BN": {"name": "Brunei Darussalam", "lat": 4.94, "lon": 114.95, "covered": False},
    "TL": {"name": "Timor-Leste", "lat": -8.56, "lon": 125.56, "covered": False},
}

AREAS = {
    "A": "Company registration and establishment",
    "B": "Foreign investment and ownership",
    "C": "Licences and sector regulation",
    "D": "Taxation and commercial",
    "E": "Subsidies and incentives",
    "F": "Visa, immigration and talent",
    "G": "Intellectual property",
    "H": "Data protection and privacy",
    "I": "Operational compliance",
}


@lru_cache
def regulatory() -> list[dict]:
    return json.loads((SEED_DIR / "regulatory.json").read_text(encoding="utf-8"))


@lru_cache
def ecosystem() -> dict:
    return json.loads((SEED_DIR / "ecosystem.json").read_text(encoding="utf-8"))


def records_by_id() -> dict[str, dict]:
    return {r["id"]: r for r in regulatory()}


def records_for(country: str, sector: str | None = None) -> list[dict]:
    out = []
    for r in regulatory():
        if r["country"] not in (country, "ASEAN"):
            continue
        if r["sector"] != "all" and sector and r["sector"] != sector:
            continue
        out.append(r)
    return out

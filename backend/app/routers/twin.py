from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import catalog
from app.db import get_session
from app.services import get_mission, latest_passport

router = APIRouter(tags=["twin"])


@router.get("/twin/graph")
def twin_graph(mission_id: str | None = None, session: Session = Depends(get_session)):
    eco = catalog.ecosystem()
    nodes = [
        {"id": code, "kind": "country", "label": c["name"], "lat": c["lat"], "lon": c["lon"], "covered": c["covered"]}
        for code, c in catalog.COUNTRIES.items()
    ]
    counts: dict[str, dict[str, int]] = {code: {"records": 0, "agencies": 0, "opportunities": 0} for code in catalog.COUNTRIES}
    for r in catalog.regulatory():
        if r["country"] in counts:
            counts[r["country"]]["records"] += 1
    for r in eco["referrals"]:
        counts[r["country"]]["agencies"] += 1
    for o in eco["opportunities"] + eco["partners"] + eco["talent"]:
        if o["country"] in counts:
            counts[o["country"]]["opportunities"] += 1
    for n in nodes:
        n["counts"] = counts[n["id"]]

    # Located ecosystem entries, drawn as pins on the globe and map.
    located = [(o, o["kind"]) for o in eco["opportunities"] + eco["partners"] + eco["talent"]]
    located += [(r, "agency") for r in eco["referrals"] if r["type"] == "government"]
    pins = [
        {
            "id": o["id"],
            "label": o["name"],
            "kind": kind,
            "country": o["country"] if o["country"] != "ASEAN" else "ID",
            "city": o["city"],
            "lat": o["lat"],
            "lon": o["lon"],
            "sample": o.get("sample", False),
            "url": o.get("url"),
        }
        for o, kind in located
        if "lat" in o
    ]

    mission_path = None
    if mission_id:
        m = get_mission(session, mission_id)
        p = latest_passport(session, mission_id)
        by_id = catalog.records_by_id()
        reqs = []
        if p:
            reqs = [
                {"id": i["record_id"], "label": by_id[i["record_id"]]["title"], "area": by_id[i["record_id"]]["area"], "status": i["status"]}
                for i in p.payload["items"]
                if i.get("applies", True) and i["record_id"] in by_id and by_id[i["record_id"]]["country"] == m.target
            ]
        agencies = [{"id": r["id"], "label": r["name"], "areas": r["areas"]} for r in eco["referrals"] if r["country"] == m.target and r["type"] == "government"]
        local = [
            {"id": o["id"], "label": o["name"], "kind": o["kind"], "sample": o.get("sample", False)}
            for o in eco["opportunities"] + eco["partners"] + eco["talent"]
            if o["country"] == m.target or m.target in o.get("target_countries", [])
        ]
        mission_path = {
            "origin": m.origin,
            "target": m.target,
            "objective": m.objective,
            "legs": [
                {"stage": "Establish", "items": [r for r in reqs if r["area"] in ("A", "B")]},
                {"stage": "Approvals", "items": [r for r in reqs if r["area"] in ("C", "H")]},
                {"stage": "Operate", "items": [r for r in reqs if r["area"] in ("D", "F", "G", "I")]},
                {"stage": "Authorities", "items": agencies},
                {"stage": "Partners and funding", "items": local},
            ],
        }
    return {"nodes": nodes, "pins": pins, "mission": mission_path}

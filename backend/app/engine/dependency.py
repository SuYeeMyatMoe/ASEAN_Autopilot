"""Dependency-aware roadmap from the `depends_on` edges in regulatory records.

Records are grouped into layers (Kahn's algorithm): everything in a layer can
run in parallel once the previous layers are done. Edges to records outside the
passport are ignored, so the order always comes from the founder's own set.
"""

from collections import defaultdict

STRUCTURE_ROOTS = {"company_registration"}


class CycleError(ValueError):
    pass


def layers(records: list[dict]) -> list[list[dict]]:
    by_id = {r["id"]: r for r in records}
    indeg = {rid: 0 for rid in by_id}
    children: dict[str, list[str]] = defaultdict(list)
    for r in records:
        for dep in r.get("depends_on", []):
            if dep in by_id and dep != r["id"]:
                indeg[r["id"]] += 1
                children[dep].append(r["id"])

    out: list[list[dict]] = []
    frontier = sorted(rid for rid, d in indeg.items() if d == 0)
    placed = 0
    while frontier:
        out.append([by_id[rid] for rid in frontier])
        placed += len(frontier)
        nxt = []
        for rid in frontier:
            for child in children[rid]:
                indeg[child] -= 1
                if indeg[child] == 0:
                    nxt.append(child)
        frontier = sorted(nxt)
    if placed != len(by_id):
        raise CycleError("dependency cycle in regulatory records")
    return out


def depends_on_structure(record: dict, records: list[dict]) -> bool:
    """True if the step (transitively) waits on choosing the operating structure."""
    by_id = {r["id"]: r for r in records}
    stack, seen = list(record.get("depends_on", [])), set()
    while stack:
        rid = stack.pop()
        if rid in seen or rid not in by_id:
            continue
        seen.add(rid)
        if by_id[rid]["category"] in STRUCTURE_ROOTS:
            return True
        stack.extend(by_id[rid].get("depends_on", []))
    return False


def roadmap(records: list[dict]) -> list[dict]:
    stages = []
    for i, layer in enumerate(layers(records)):
        stages.append(
            {
                "index": i,
                "label": "Start here" if i == 0 else ("Then, in parallel" if len(layer) > 1 else "Then"),
                "parallel": len(layer) > 1,
                "steps": [
                    {
                        "record_id": r["id"],
                        "title": r["title"],
                        "area": r["area"],
                        "authority": r["authority"],
                        "waits_for": [d for d in r.get("depends_on", []) if d in {x["id"] for x in records}],
                        "depends_on_structure": depends_on_structure(r, records),
                    }
                    for r in layer
                ],
            }
        )
    return stages

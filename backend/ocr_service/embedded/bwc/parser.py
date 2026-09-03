import re


NUMERIC_PATTERN = re.compile(r"[-+]?\d+(?:\.\d+)?")


def _to_float(text):
    token = (text or "").replace(",", "").strip()
    match = NUMERIC_PATTERN.search(token)
    if not match:
        return None
    try:
        return float(match.group(0))
    except Exception:
        return None


def reconstruct_table(results):
    items = list(results or [])
    table_start = 0
    for index, item in enumerate(items):
        text = str(getattr(item, "text", "") or "").strip().lower()
        if "sample no" in text or "sample weight" in text:
            table_start = index + 1
            break

    values = []
    for item in items[table_start:]:
        value = _to_float(getattr(item, "text", ""))
        if value is not None:
            values.append(value)

    rows = []
    i = 0
    while i + 2 < len(values):
        sample_no = values[i]
        if sample_no.is_integer() and 1 <= sample_no <= 100:
            rows.append((values[i + 1], values[i + 2]))
            i += 3
            continue
        i += 1

    if rows:
        sample_weights = [row[0] for row in rows[:100]]
        hanks = [row[1] for row in rows[:100]]
        return sample_weights + hanks

    return values

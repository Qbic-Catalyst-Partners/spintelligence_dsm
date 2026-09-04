MAX_BWC_ENTRIES = 100


def get_ui_field_names():
    return (
        [f"Sample Weight {i}" for i in range(1, MAX_BWC_ENTRIES + 1)] +
        [f"Hank {i}" for i in range(1, MAX_BWC_ENTRIES + 1)]
    )


def apply_mapping(extracted_values):
    values = list(extracted_values or [])
    row = {}

    for i in range(MAX_BWC_ENTRIES):
        row[f"Sample Weight {i + 1}"] = values[i] if i < len(values) else ""

    for i in range(MAX_BWC_ENTRIES):
        j = i + MAX_BWC_ENTRIES
        row[f"Hank {i + 1}"] = values[j] if j < len(values) else ""

    return [row]

export const buildEntryIdScope = (department = "", typeName = "") =>
  [department, typeName]
    .map((part) =>
      String(part || "default")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .filter(Boolean)
    .join(":");

export const formatEntryId = ({ prefix, sequence, width = 3, leadingHash = false }) => {
  const safePrefix = String(prefix || "ENT").trim() || "ENT";
  const safeSequence = Math.max(1, Number(sequence) || 1);
  const id = `${safePrefix}-${String(safeSequence).padStart(width, "0")}`;
  return leadingHash ? `#${id}` : id;
};

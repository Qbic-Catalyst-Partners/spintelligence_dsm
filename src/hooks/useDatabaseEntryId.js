import { useCallback, useEffect, useState } from "react";
import { resolvedBaseUrl } from "@/apis/apiConfig";
import { formatEntryId } from "@/utils/entryIds";

export default function useDatabaseEntryId({
  department,
  typeName,
  config,
  fallbackPrefix = "ENT",
  fallbackWidth = 3,
  leadingHash = false,
}) {
  const resolvedPrefix = config?.prefix || fallbackPrefix;
  const resolvedWidth = config?.width || fallbackWidth;
  const routePath = String(config?.routePath || "").trim();
  const initialEntryId = routePath
    ? `${resolvedPrefix}-${String(1).padStart(resolvedWidth, "0")}`
    : formatEntryId({
        prefix: resolvedPrefix,
        sequence: 1,
        width: resolvedWidth,
        leadingHash,
      });
  const [entryId, setEntryId] = useState(() =>
    initialEntryId
  );
  const [loading, setLoading] = useState(false);

  const reserveEntryId = useCallback(async () => {
    if (!department || !typeName || !resolvedPrefix) return null;

    setLoading(true);
    try {
      if (routePath) {
        const url = new URL("/entry-id/next", resolvedBaseUrl);
        url.searchParams.set("route_path", routePath);
        const response = await fetch(url.toString());
        if (!response.ok) return null;
        const data = await response.json();
        const nextSequence = data?.entry_id || data?.value;
        const nextEntryId = nextSequence
          ? `${resolvedPrefix}-${String(nextSequence).replace(/^\D+/, "").padStart(resolvedWidth, "0")}`
          : "";
        if (nextEntryId) {
          setEntryId(nextEntryId);
        }
        return nextEntryId || null;
      }

      const url = new URL("/entry-ids/next", resolvedBaseUrl);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department,
          typeName,
          prefix: resolvedPrefix,
          width: resolvedWidth,
          leadingHash,
        }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      const nextEntryId = data?.entryId || data?.entry_id || data?.value;
      if (nextEntryId) {
        setEntryId(nextEntryId);
      }
      return nextEntryId || null;
    } catch (error) {
      return null;
    } finally {
      setLoading(false);
    }
  }, [department, leadingHash, resolvedPrefix, resolvedWidth, routePath, typeName]);

  useEffect(() => {
    setEntryId(initialEntryId);
    reserveEntryId();
  }, [initialEntryId, reserveEntryId]);

  return { entryId, loading, reserveEntryId };
}

import { useCallback, useEffect, useState } from "react";
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
  const [entryId, setEntryId] = useState(() =>
    formatEntryId({
      prefix: resolvedPrefix,
      sequence: 1,
      width: resolvedWidth,
      leadingHash,
    })
  );
  const [loading, setLoading] = useState(false);

  const reserveEntryId = useCallback(async () => {
    if (!department || !typeName || !resolvedPrefix) return null;

    setLoading(true);
    try {
      const response = await fetch("/api/entry-ids/next", {
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
      const nextEntryId = data?.entryId;
      if (nextEntryId) {
        setEntryId(nextEntryId);
      }
      return nextEntryId || null;
    } catch (error) {
      return null;
    } finally {
      setLoading(false);
    }
  }, [department, leadingHash, resolvedPrefix, resolvedWidth, typeName]);

  useEffect(() => {
    setEntryId(
      formatEntryId({
        prefix: resolvedPrefix,
        sequence: 1,
        width: resolvedWidth,
        leadingHash,
      })
    );
    reserveEntryId();
  }, [leadingHash, reserveEntryId, resolvedPrefix, resolvedWidth]);

  return { entryId, loading, reserveEntryId };
}

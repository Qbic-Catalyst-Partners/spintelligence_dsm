import { useCallback, useEffect, useState } from "react";
import apiConfig, { resolvedBaseUrl } from "@/apis/apiConfig";
import { formatEntryId } from "@/utils/entryIds";

const extractRows = (response) =>
  Array.isArray(response)
    ? response
    : Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response?.rows)
        ? response.rows
        : Array.isArray(response?.entries)
          ? response.entries
          : Array.isArray(response?.records)
            ? response.records
            : Array.isArray(response?.result)
              ? response.result
              : Array.isArray(response?.data?.rows)
                ? response.data.rows
                : Array.isArray(response?.data?.entries)
                  ? response.data.entries
                  : Array.isArray(response?.data?.records)
                    ? response.data.records
                    : [];

const extractSequence = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return 0;
  const match = normalized.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) || 0 : 0;
};

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
  const normalizeReservedEntryId = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (raw.includes("-")) return raw;
    const sequence = String(raw).replace(/^\D+/, "");
    if (!sequence) return "";
    return `${resolvedPrefix}-${sequence.padStart(resolvedWidth, "0")}`;
  };
  const fetchNextFromExistingEntries = useCallback(async () => {
    if (!routePath) return null;

    try {
      const response = await apiConfig.get(
        routePath,
        { page: 1, limit: 200 },
        { skipGlobalErrorModal: true }
      );
      const rows = extractRows(response?.data || response);
      if (!rows.length) return null;

      const highestSequence = rows.reduce((max, row) => {
        const candidate = extractSequence(
          row?.entry_id ||
            row?.entryId ||
            row?.value ||
            row?.id ||
            row?.ticket_id ||
            row?.ticketId
        );
        return candidate > max ? candidate : max;
      }, 0);

      if (!highestSequence) return null;
      return formatEntryId({
        prefix: resolvedPrefix,
        sequence: highestSequence + 1,
        width: resolvedWidth,
        leadingHash,
      });
    } catch (_error) {
      return null;
    }
  }, [leadingHash, resolvedPrefix, resolvedWidth, routePath]);
  const initialEntryId = routePath
    ? `${resolvedPrefix}-${String(1).padStart(resolvedWidth, "0")}`
    : formatEntryId({
        prefix: resolvedPrefix,
        sequence: 1,
        width: resolvedWidth,
        leadingHash,
      });
  const [entryId, setEntryId] = useState(() => initialEntryId);
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
        let nextEntryId = normalizeReservedEntryId(
          data?.entryId || data?.entry_id || data?.value || data?.sequence
        );
        if (!nextEntryId || nextEntryId === initialEntryId) {
          nextEntryId = (await fetchNextFromExistingEntries()) || nextEntryId;
        }
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
  }, [department, fetchNextFromExistingEntries, initialEntryId, leadingHash, resolvedPrefix, resolvedWidth, routePath, typeName]);

  useEffect(() => {
    setEntryId(initialEntryId);
    reserveEntryId();
  }, [initialEntryId, reserveEntryId]);

  return { entryId, loading, reserveEntryId };
}

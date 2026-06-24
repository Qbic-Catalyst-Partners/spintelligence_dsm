import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  FiBell,
  FiBookOpen,
  FiClock,
  FiEdit2,
  FiHelpCircle,
  FiList,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";

import {
  deleteFaqEntryApi,
  deleteGlossaryEntryApi,
  deleteUserGuideEntryApi,
  fetchActivityLogEntriesApi,
  fetchFaqEntriesApi,
  fetchGlossaryEntriesApi,
  fetchUserGuideEntriesApi,
  createFaqEntryApi,
  createGlossaryEntryApi,
  createUserGuideEntryApi,
  updateFaqEntryApi,
  updateGlossaryEntryApi,
  updateUserGuideEntryApi,
} from "@/apis/helpContentApi";
import {
  fetchAnalysisNotificationsApi,
  fetchAnalysisSubscriptionsApi,
  markAnalysisNotificationReadApi,
  saveAnalysisSubscriptionApi,
} from "@/apis/analysisApi";
import { isFullAccessUser } from "@/utils/accessControl";
import styles from "@/styles/helpCenter.module.css";

const tabs = [
  { key: "glossary", label: "Glossary", icon: FiBookOpen },
  { key: "faqs", label: "FAQs", icon: FiHelpCircle },
  { key: "guide", label: "User Guide", icon: FiList },
  { key: "activity", label: "Activity Log", icon: FiClock },
  { key: "notifications", label: "Notifications", icon: FiBell },
];

const emptyForms = {
  glossary: { term: "", definition: "", category: "" },
  faqs: { question: "", answer: "", category: "" },
  guide: { title: "", slug: "", content: "", section: "" },
};

const normalizers = {
  glossary: (item) => ({
    ...item,
    term: item?.term || item?.title || "",
    definition: item?.definition || item?.description || item?.body || "",
    category: item?.category || item?.section || "",
  }),
  faqs: (item) => ({
    ...item,
    question: item?.question || item?.title || "",
    answer: item?.answer || item?.body || item?.content || "",
    category: item?.category || item?.section || "",
  }),
  guide: (item) => ({
    ...item,
    title: item?.title || item?.name || "",
    slug: item?.slug || "",
    content: item?.content || item?.body || "",
    section: item?.section || item?.category || "",
  }),
};

const getId = (item) => item?.id || item?._id || item?.uuid;
const getTime = (item) => item?.created_at || item?.updated_at || item?.timestamp || item?.createdAt;

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function InlineForm({ activeTab, form, setForm, editingId, onSubmit, onCancel }) {
  if (!["glossary", "faqs", "guide"].includes(activeTab)) return null;

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(activeTab === "guide" && field === "title" && !editingId
        ? { slug: buildSlug(value) }
        : {}),
    }));
  };

  return (
    <form className={styles.editor} onSubmit={onSubmit}>
      {activeTab === "glossary" && (
        <>
          <input value={form.term} onChange={updateField("term")} placeholder="Term" required />
          <input value={form.category} onChange={updateField("category")} placeholder="Category" />
          <textarea value={form.definition} onChange={updateField("definition")} placeholder="Definition" required />
        </>
      )}

      {activeTab === "faqs" && (
        <>
          <input value={form.question} onChange={updateField("question")} placeholder="Question" required />
          <input value={form.category} onChange={updateField("category")} placeholder="Category" />
          <textarea value={form.answer} onChange={updateField("answer")} placeholder="Answer" required />
        </>
      )}

      {activeTab === "guide" && (
        <>
          <input value={form.title} onChange={updateField("title")} placeholder="Title" required />
          <div className={styles.editorRow}>
            <input value={form.slug} onChange={updateField("slug")} placeholder="Slug" required />
            <input value={form.section} onChange={updateField("section")} placeholder="Section" />
          </div>
          <textarea value={form.content} onChange={updateField("content")} placeholder="Guide content" required />
        </>
      )}

      <div className={styles.editorActions}>
        <button type="submit">
          <FiSave />
          <span>{editingId ? "Update" : "Create"}</span>
        </button>
        {editingId ? (
          <button type="button" onClick={onCancel} className={styles.secondaryButton}>
            <FiX />
            <span>Cancel</span>
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default function HelpCenter() {
  const user = useSelector((state) => state.auth?.user);
  const isAdmin = isFullAccessUser(user);
  const [activeTab, setActiveTab] = useState("glossary");
  const [rows, setRows] = useState({
    glossary: [],
    faqs: [],
    guide: [],
    activity: [],
    notifications: [],
  });
  const [subscriptions, setSubscriptions] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForms.glossary);

  const analysisSubscribed = subscriptions.some(
    (item) => String(item?.channel || "").toLowerCase() === "app_push" && item?.is_active !== false
  );

  const resetEditor = useCallback((tab = activeTab) => {
    setEditingId(null);
    setForm(emptyForms[tab] || {});
  }, [activeTab]);

  const loadTab = useCallback(async (tab = activeTab) => {
    setLoading(true);
    setError("");
    try {
      if (tab === "glossary") {
        const data = await fetchGlossaryEntriesApi();
        setRows((current) => ({ ...current, glossary: data.map(normalizers.glossary) }));
      } else if (tab === "faqs") {
        const data = await fetchFaqEntriesApi();
        setRows((current) => ({ ...current, faqs: data.map(normalizers.faqs) }));
      } else if (tab === "guide") {
        const data = await fetchUserGuideEntriesApi();
        setRows((current) => ({ ...current, guide: data.map(normalizers.guide) }));
      } else if (tab === "activity") {
        const data = await fetchActivityLogEntriesApi({ page: 1, limit: 100 });
        setRows((current) => ({ ...current, activity: data }));
      } else if (tab === "notifications") {
        const [notificationsRes, subscriptionsRes] = await Promise.all([
          fetchAnalysisNotificationsApi(),
          fetchAnalysisSubscriptionsApi(),
        ]);
        setRows((current) => ({
          ...current,
          notifications: Array.isArray(notificationsRes?.notifications) ? notificationsRes.notifications : [],
        }));
        setSubscriptions(Array.isArray(subscriptionsRes?.subscriptions) ? subscriptionsRes.subscriptions : []);
      }
    } catch (loadError) {
      setError(loadError?.response?.data?.message || loadError.message || "Unable to load help content.");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    resetEditor(activeTab);
    loadTab(activeTab);
  }, [activeTab, loadTab, resetEditor]);

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const activeRows = rows[activeTab] || [];
    if (!search) return activeRows;
    return activeRows.filter((item) => JSON.stringify(item).toLowerCase().includes(search));
  }, [activeTab, query, rows]);

  const handleEdit = (item) => {
    const normalized = normalizers[activeTab]?.(item) || item;
    setEditingId(getId(item));
    setForm({ ...emptyForms[activeTab], ...normalized });
  };

  const handleDelete = async (item) => {
    const id = getId(item);
    if (!id) return;
    if (!window.confirm("Delete this item?")) return;

    if (activeTab === "glossary") await deleteGlossaryEntryApi(id);
    if (activeTab === "faqs") await deleteFaqEntryApi(id);
    if (activeTab === "guide") await deleteUserGuideEntryApi(id);
    resetEditor();
    loadTab();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (activeTab === "glossary") {
      const payload = { term: form.term, definition: form.definition, category: form.category };
      editingId ? await updateGlossaryEntryApi(editingId, payload) : await createGlossaryEntryApi(payload);
    }
    if (activeTab === "faqs") {
      const payload = { question: form.question, answer: form.answer, category: form.category };
      editingId ? await updateFaqEntryApi(editingId, payload) : await createFaqEntryApi(payload);
    }
    if (activeTab === "guide") {
      const payload = { title: form.title, slug: form.slug, content: form.content, section: form.section };
      editingId ? await updateUserGuideEntryApi(editingId, payload) : await createUserGuideEntryApi(payload);
    }
    resetEditor();
    loadTab();
  };

  const handleMarkRead = async (item) => {
    const id = getId(item);
    if (!id) return;
    await markAnalysisNotificationReadApi(id);
    setRows((current) => ({
      ...current,
      notifications: current.notifications.map((row) => (getId(row) === id ? { ...row, is_read: true } : row)),
    }));
  };

  const handleToggleSubscription = async () => {
    await saveAnalysisSubscriptionApi({
      channel: "app_push",
      target_level: "ALL",
      is_active: !analysisSubscribed,
    });
    loadTab("notifications");
  };

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Help Center</h1>
          <p>Reference content, activity history, and analysis notifications.</p>
        </div>
        <button type="button" onClick={() => loadTab()} className={styles.refreshButton}>
          <FiRefreshCw />
          <span>Refresh</span>
        </button>
      </div>

      <div className={styles.tabs}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            type="button"
            key={key}
            className={activeTab === key ? styles.activeTab : ""}
            onClick={() => setActiveTab(key)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <FiSearch />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
        </label>
        {isAdmin && ["glossary", "faqs", "guide"].includes(activeTab) ? (
          <button type="button" onClick={() => resetEditor()} className={styles.addButton}>
            <FiPlus />
            <span>New</span>
          </button>
        ) : null}
        {activeTab === "notifications" ? (
          null
        ) : null}
      </div>

      {isAdmin ? (
        <InlineForm
          activeTab={activeTab}
          form={form}
          setForm={setForm}
          editingId={editingId}
          onSubmit={handleSubmit}
          onCancel={() => resetEditor()}
        />
      ) : null}

      {loading ? <p className={styles.status}>Loading...</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.contentList}>
        {!loading && !filteredRows.length ? <p className={styles.empty}>No records found.</p> : null}

        {activeTab === "glossary" &&
          filteredRows.map((item) => (
            <article className={styles.item} key={getId(item) || item.term}>
              <div>
                <span className={styles.kicker}>{item.category || "General"}</span>
                <h2>{item.term || "-"}</h2>
                <p>{item.definition || "-"}</p>
              </div>
              {isAdmin ? <RowActions item={item} onEdit={handleEdit} onDelete={handleDelete} /> : null}
            </article>
          ))}

        {activeTab === "faqs" &&
          filteredRows.map((item) => (
            <article className={styles.item} key={getId(item) || item.question}>
              <div>
                <span className={styles.kicker}>{item.category || "FAQ"}</span>
                <h2>{item.question || "-"}</h2>
                <p>{item.answer || "-"}</p>
              </div>
              {isAdmin ? <RowActions item={item} onEdit={handleEdit} onDelete={handleDelete} /> : null}
            </article>
          ))}

        {activeTab === "guide" &&
          filteredRows.map((item) => (
            <article className={styles.item} key={getId(item) || item.slug || item.title}>
              <div>
                <span className={styles.kicker}>{item.section || item.slug || "Guide"}</span>
                <h2>{item.title || "-"}</h2>
                <p>{item.content || "-"}</p>
              </div>
              {isAdmin ? <RowActions item={item} onEdit={handleEdit} onDelete={handleDelete} /> : null}
            </article>
          ))}

        {activeTab === "activity" &&
          filteredRows.map((item, index) => (
            <article className={styles.item} key={getId(item) || index}>
              <div>
                <span className={styles.kicker}>{formatDateTime(getTime(item))}</span>
                <h2>{item.action || item.event || item.activity || "Activity"}</h2>
                <p>{item.description || item.details || item.message || item.user_name || "-"}</p>
              </div>
            </article>
          ))}

        {activeTab === "notifications" &&
          filteredRows.map((item) => (
            <article className={`${styles.item} ${item?.is_read ? styles.readItem : ""}`} key={getId(item)}>
              <div>
                <span className={styles.kicker}>{formatDateTime(getTime(item))}</span>
                <h2>{item.title || "Notification"}</h2>
                <p>{item.body || "-"}</p>
              </div>
              {!item?.is_read ? (
                <button type="button" onClick={() => handleMarkRead(item)} className={styles.secondaryButton}>
                  Mark read
                </button>
              ) : null}
            </article>
          ))}
      </div>
    </section>
  );
}

function RowActions({ item, onEdit, onDelete }) {
  return (
    <div className={styles.rowActions}>
      <button type="button" onClick={() => onEdit(item)} title="Edit">
        <FiEdit2 />
      </button>
      <button type="button" onClick={() => onDelete(item)} title="Delete">
        <FiTrash2 />
      </button>
    </div>
  );
}

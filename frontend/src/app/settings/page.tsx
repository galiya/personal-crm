"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Mail, MessageCircle, Twitter, RefreshCw, Check, AlertCircle,
  CheckCircle2, X, Calendar, Save, Upload, Plug, FileDown, Clock,
  Tag, User, MoreVertical, Link2, Settings, Key, History, Unplug,
  RotateCcw, Download, Trash2, AlertTriangle, Camera, Sparkles,
} from "lucide-react";
import { client } from "@/lib/api-client";
import { CsvImport } from "@/components/csv-import";
import { TagTaxonomyPanel } from "@/components/tag-taxonomy-panel";
import { cn } from "@/lib/utils";
import { useTelegramSyncProgress } from "@/hooks/use-telegram-sync";

/* ═══════════════════════════════════════════════════════════ */
/*  Types                                                       */
/* ═══════════════════════════════════════════════════════════ */

type SyncStatus = "idle" | "loading" | "success" | "error";

interface SyncState {
  status: SyncStatus;
  message: string;
  details?: SyncDetails;
}

interface SyncDetails {
  created?: number;
  updated?: number;
  new_interactions?: number;
  errors?: string[];
  elapsed?: number;
  message?: string;
}

interface GoogleAccountInfo {
  id: string;
  email: string;
}

interface ConnectedAccounts {
  google: boolean;
  google_email?: string | null;
  google_accounts: GoogleAccountInfo[];
  telegram: boolean;
  telegram_username?: string | null;
  twitter: boolean;
  twitter_username?: string | null;
}

interface PrioritySettings {
  high: number;
  medium: number;
  low: number;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Small reusable components                                   */
/* ═══════════════════════════════════════════════════════════ */

function ConnectionBadge({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-500 border border-stone-200">
      Not connected
    </span>
  );
}

function SuccessModal({ platform, onClose }: { platform: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-stone-900 mb-1">{platform} Connected</h3>
        <p className="text-sm text-stone-500 mb-5">
          Your {platform} account has been successfully linked. You can now sync your data.
        </p>
        <button
          onClick={onClose}
          className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

type SyncPhase = "idle" | "loading" | "success" | "error";

function SyncButtonWrapper({ phase, children }: { phase: SyncPhase; children: ReactNode }) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const prevPhase = useRef<SyncPhase>("idle");

  useEffect(() => {
    if (prevPhase.current === "loading" && phase === "success") {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 2000);
      return () => clearTimeout(t);
    }
    if (prevPhase.current === "loading" && phase === "error") {
      setShowError(true);
      const t = setTimeout(() => setShowError(false), 1500);
      return () => clearTimeout(t);
    }
    prevPhase.current = phase;
  }, [phase]);

  return (
    <div className="relative">
      {children}
      {phase === "loading" && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-lg overflow-hidden">
          <div
            className="h-full bg-white/60 rounded-full"
            style={{ animation: "shimmer 1.5s ease-in-out infinite", width: "40%" }}
          />
        </div>
      )}
      {showSuccess && (
        <div className="absolute inset-0 rounded-lg bg-emerald-500/20 pointer-events-none animate-[fadeOut_1.5s_ease-out_forwards]" />
      )}
      {showError && (
        <div className="absolute inset-0 rounded-lg bg-red-500/15 pointer-events-none animate-[fadeOut_1s_ease-out_forwards]" />
      )}
      <style>{`
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
        @keyframes fadeOut { 0% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}

function SyncResultPanel({ details, status }: { details: SyncDetails; status: SyncStatus }) {
  if (status === "idle" || status === "loading") return null;

  const hasStats = details.created !== undefined || details.updated !== undefined || details.new_interactions !== undefined;
  const hasErrors = details.errors && details.errors.length > 0;

  return (
    <div className={`mt-3 rounded-lg p-3 text-xs ${status === "error" ? "bg-red-50 border border-red-100" : "bg-emerald-50 border border-emerald-100"}`}>
      {hasStats && (
        <div className="flex items-center gap-3 mb-1">
          {details.new_interactions !== undefined && (
            <span className="text-emerald-700">{details.new_interactions} new interaction{details.new_interactions !== 1 ? "s" : ""}</span>
          )}
          {details.created !== undefined && details.created > 0 && (
            <span className="text-teal-700">+{details.created} new contact{details.created !== 1 ? "s" : ""}</span>
          )}
          {details.updated !== undefined && details.updated > 0 && (
            <span className="text-teal-700">{details.updated} updated</span>
          )}
          {details.elapsed !== undefined && (
            <span className="text-stone-500 ml-auto">{details.elapsed}s</span>
          )}
        </div>
      )}
      {hasErrors && (
        <div className="mt-2 space-y-1">
          <p className="font-medium text-red-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {details.errors!.length} error{details.errors!.length > 1 ? "s" : ""}
          </p>
          <ul className="text-red-500 space-y-0.5 max-h-20 overflow-y-auto">
            {details.errors!.map((err, i) => (
              <li key={i} className="truncate">{err}</li>
            ))}
          </ul>
        </div>
      )}
      {!hasStats && !hasErrors && status === "error" && (
        <p className="text-red-600">{details.message || "Sync failed"}</p>
      )}
    </div>
  );
}

/* ── Telegram Sync Progress Card ── */
const PHASE_LABELS: Record<string, string> = {
  chats: "Collecting dialogs...",
  messages: "Syncing messages...",
  groups: "Scanning groups...",
  bios: "Checking bios...",
  done: "Done!",
};

function TelegramSyncProgressCard({ progress }: { progress: { active: boolean; phase?: string; total_dialogs?: number; dialogs_processed?: number; contacts_found?: number; messages_synced?: number; started_at?: string } }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!progress.started_at) return;
    const start = new Date(progress.started_at).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [progress.started_at]);

  const phase = progress.phase ?? "";
  const phaseLabel = PHASE_LABELS[phase] ?? phase;
  const total = progress.total_dialogs ?? 0;
  const processed = progress.dialogs_processed ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const isDone = phase === "done";

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const elapsedStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <div className={cn(
      "mt-3 rounded-lg border p-3 text-xs transition-all",
      isDone ? "bg-emerald-50 border-emerald-100" : "bg-sky-50 border-sky-100"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn("font-medium flex items-center gap-1.5", isDone ? "text-emerald-700" : "text-sky-700")}>
          {isDone ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          )}
          {phaseLabel}
        </span>
        {progress.started_at && (
          <span className="text-stone-400">{elapsedStr}</span>
        )}
      </div>
      {total > 0 && (
        <div className="mb-2">
          <div className="flex justify-between text-stone-500 mb-1">
            <span>{processed} / {total} dialogs</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isDone ? "bg-emerald-500" : "bg-sky-400 animate-pulse"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 text-stone-500">
        <span>{progress.contacts_found ?? 0} contacts</span>
        <span className="text-stone-300">·</span>
        <span>{progress.messages_synced ?? 0} messages</span>
      </div>
    </div>
  );
}

/* ── Toggle switch ── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
        checked ? "bg-teal-600" : "bg-stone-300"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[20px]" : "translate-x-[2px]",
          "mt-[2px]"
        )}
      />
    </button>
  );
}

/* ── Kebab menu ── */
function KebabMenu({ items }: { items: { icon: typeof Settings; label: string; danger?: boolean; onClick?: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md text-stone-400 hover:bg-stone-100 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg border border-stone-200 shadow-lg py-1 z-50">
          {items.map((item, i) =>
            item.label === "---" ? (
              <div key={i} className="my-1 h-px bg-stone-100" />
            ) : (
              <button
                key={i}
                onClick={() => { setOpen(false); item.onClick?.(); }}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-sm w-full text-left",
                  item.danger ? "text-red-600 hover:bg-red-50" : "text-stone-700 hover:bg-stone-50"
                )}
              >
                <item.icon className={cn("w-4 h-4", item.danger ? "" : "text-stone-400")} />
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  LinkedIn Imports                                            */
/* ═══════════════════════════════════════════════════════════ */

function LinkedInImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setStatus("loading");
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data, error } = await client.POST("/api/v1/contacts/import/linkedin", {
        body: formData as unknown as { file: string },
        bodySerializer: () => formData,
      });
      if (error) {
        setError((error as { detail?: string })?.detail ?? "Import failed");
        setStatus("error");
      } else {
        setResult(data?.data as { created: number; skipped: number; errors: string[] });
        setStatus("success");
      }
    } catch {
      setError("Import failed");
      setStatus("error");
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex items-start gap-4">
      <div className="w-11 h-11 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="#2563eb" strokeWidth="2" />
          <path d="M8 11v5M8 8v.01M12 16v-5c0-1 1-2 2-2s2 1 2 2v5" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-stone-900">LinkedIn Export</h3>
        <p className="text-xs text-stone-500 mt-0.5 mb-4">Import your LinkedIn connections and messages.</p>

        <div className="bg-stone-50 rounded-lg p-4 mb-4">
          <h4 className="text-xs font-semibold text-stone-700 mb-2">How to export from LinkedIn:</h4>
          <ol className="text-xs text-stone-500 space-y-1.5 list-decimal ml-4">
            <li>Go to <span className="font-medium text-stone-600">Settings &rarr; Data Privacy &rarr; Get a copy of your data</span></li>
            <li>Select <span className="font-medium text-stone-600">&quot;Connections&quot;</span> and request the archive</li>
            <li>Download the CSV when ready and upload it here</li>
          </ol>
        </div>

        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={status === "loading"}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {status === "loading" ? "Importing..." : "Upload Connections.csv"}
        </button>
        {result && (
          <p className="text-xs mt-2 text-emerald-600">
            Imported {result.created} contacts{result.skipped > 0 ? `, ${result.skipped} duplicates skipped` : ""}
            {result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}
          </p>
        )}
        {error && <p className="text-xs mt-2 text-red-500">{error}</p>}
      </div>
    </div>
  );
}

function LinkedInMessagesImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ new_interactions: number; skipped: number; unmatched: number; unmatched_names: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setStatus("loading");
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data, error } = await client.POST("/api/v1/contacts/import/linkedin-messages", {
        body: formData as unknown as { file: string },
        bodySerializer: () => formData,
      });
      if (error) {
        setError((error as { detail?: string })?.detail ?? "Import failed");
        setStatus("error");
      } else {
        setResult(data?.data as { new_interactions: number; skipped: number; unmatched: number; unmatched_names: string[] });
        setStatus("success");
      }
    } catch {
      setError("Import failed");
      setStatus("error");
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="mt-4">
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={status === "loading"}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50"
      >
        <Upload className="w-3.5 h-3.5" />
        {status === "loading" ? "Importing..." : "Upload messages.csv"}
      </button>
      {result && (
        <div className="text-xs mt-2">
          <p className="text-emerald-600">
            Imported {result.new_interactions} messages{result.skipped > 0 ? `, ${result.skipped} duplicates skipped` : ""}
          </p>
          {result.unmatched > 0 && (
            <p className="text-amber-600 mt-1">
              {result.unmatched} contacts not found: {result.unmatched_names.join(", ")}
              {result.unmatched > result.unmatched_names.length ? "..." : ""}
            </p>
          )}
        </div>
      )}
      {error && <p className="text-xs mt-2 text-red-500">{error}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Tab definitions                                             */
/* ═══════════════════════════════════════════════════════════ */

const TABS = [
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "import", label: "Import", icon: FileDown },
  { id: "followup", label: "Follow-up Rules", icon: Clock },
  { id: "tags", label: "Tags", icon: Tag },
  { id: "account", label: "Account", icon: User },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ═══════════════════════════════════════════════════════════ */
/*  Tab Bar with animated indicator                             */
/* ═══════════════════════════════════════════════════════════ */

function TabBar({ activeTab, onChange }: { activeTab: TabId; onChange: (tab: TabId) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    if (!barRef.current) return;
    const activeBtn = barRef.current.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement | null;
    if (!activeBtn) return;
    const barRect = barRef.current.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setIndicatorStyle({ left: btnRect.left - barRect.left, width: btnRect.width });
  }, [activeTab]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  return (
    <div ref={barRef} className="relative border-b border-stone-200 mb-8">
      <div className="flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            data-tab={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative px-4 py-3 text-sm font-medium transition-colors",
              activeTab === tab.id ? "text-teal-700" : "text-stone-500 hover:text-stone-700"
            )}
          >
            <span className="flex items-center gap-2">
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      <div
        className="absolute bottom-[-1px] h-[2px] bg-teal-600 rounded-sm transition-all duration-300"
        style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Platform SVG icons                                          */
/* ═══════════════════════════════════════════════════════════ */

function GmailIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M2 6l10 7 10-7" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="#dc2626" strokeWidth="2" fill="none" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M21 3L9.5 13.5M21 3l-7 18-3.5-7.5L3 10l18-7z" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 4l11.7 16h4.3L8.3 4H4zm1.7 0L20 20M20 4l-7.3 8" stroke="#78716c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Follow-up Rules Tab                                         */
/* ═══════════════════════════════════════════════════════════ */

function FollowUpRulesTab() {
  const [settings, setSettings] = useState<PrioritySettings>({ high: 7, medium: 30, low: 90 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Suggestion preferences (UI-only for now)
  const [maxBatch, setMaxBatch] = useState("10");
  const [dormantRevival, setDormantRevival] = useState(true);
  const [birthdayReminders, setBirthdayReminders] = useState(true);
  const [preferredChannel, setPreferredChannel] = useState("auto");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.GET("/api/v1/settings/priority" as any, {});
        const ps = (data as any)?.data;
        if (ps) setSettings({ high: ps.high, medium: ps.medium, low: ps.low });
      } catch {
        // use defaults
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const { data, error } = await client.PUT("/api/v1/settings/priority" as any, { body: settings });
      if (error) {
        setFeedback({ type: "error", message: (error as any)?.detail ?? "Failed to save" });
      } else {
        const ps = (data as any)?.data;
        if (ps) setSettings({ high: ps.high, medium: ps.medium, low: ps.low });
        setFeedback({ type: "success", message: "Priority settings saved" });
      }
    } catch {
      setFeedback({ type: "error", message: "Failed to save" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-stone-400 mt-8 justify-center">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading settings...
      </div>
    );
  }

  const levels: { key: keyof PrioritySettings; label: string; color: string; min: number; max: number }[] = [
    { key: "high", label: "High priority", color: "bg-red-500", min: 1, max: 30 },
    { key: "medium", label: "Medium priority", color: "bg-amber-500", min: 7, max: 90 },
    { key: "low", label: "Low priority", color: "bg-blue-500", min: 14, max: 365 },
  ];

  return (
    <div className="space-y-6">
      {/* Priority thresholds */}
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h3 className="text-sm font-semibold text-stone-900 mb-1">Priority Thresholds</h3>
        <p className="text-xs text-stone-500 mb-5">How many days of silence before a follow-up is suggested, based on priority level.</p>

        <div className="space-y-6">
          {levels.map(({ key, label, color, min, max }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2.5 h-2.5 rounded-full", color)} />
                  <span className="text-sm font-medium text-stone-700">{label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm font-medium text-stone-900 bg-stone-100 px-2 py-0.5 rounded">
                    {settings[key]}
                  </span>
                  <span className="text-xs text-stone-400">days</span>
                </div>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                value={settings[key]}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
                className="w-full accent-teal-600"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-stone-300">{min} day{min > 1 ? "s" : ""}</span>
                <span className="text-[10px] text-stone-300">{max} days</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-stone-100 flex items-center justify-end gap-3">
          {feedback && (
            <p className={cn("text-xs flex items-center gap-1", feedback.type === "error" ? "text-red-500" : "text-emerald-600")}>
              {feedback.type === "error" ? <AlertCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
              {feedback.message}
            </p>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save thresholds
          </button>
        </div>
      </div>

      {/* Suggestion preferences */}
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h3 className="text-sm font-semibold text-stone-900 mb-1">Suggestion Preferences</h3>
        <p className="text-xs text-stone-500 mb-5">Control how and when follow-up suggestions are generated.</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-700">Max suggestions per batch</p>
              <p className="text-xs text-stone-400">How many suggestions to generate at once</p>
            </div>
            <select
              value={maxBatch}
              onChange={(e) => setMaxBatch(e.target.value)}
              className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="15">15</option>
              <option value="20">20</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-700">Include dormant revival (Pool B)</p>
              <p className="text-xs text-stone-400">Suggest re-engaging contacts you haven&apos;t spoken to in a while</p>
            </div>
            <Toggle checked={dormantRevival} onChange={setDormantRevival} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-700">Birthday reminders</p>
              <p className="text-xs text-stone-400">Generate suggestions for upcoming birthdays</p>
            </div>
            <Toggle checked={birthdayReminders} onChange={setBirthdayReminders} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-700">Preferred channel</p>
              <p className="text-xs text-stone-400">Default channel for new suggestions</p>
            </div>
            <select
              value={preferredChannel}
              onChange={(e) => setPreferredChannel(e.target.value)}
              className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value="auto">Auto-detect</option>
              <option value="email">Email</option>
              <option value="telegram">Telegram</option>
              <option value="twitter">Twitter</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Account Tab                                                 */
/* ═══════════════════════════════════════════════════════════ */

function AccountTab() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  // Load profile
  useEffect(() => {
    (async () => {
      try {
        const result = await client.GET("/api/v1/auth/me", {});
        const user = (result.data as any)?.data;
        if (user) {
          setDisplayName(user.display_name || user.email || "");
          setEmail(user.email || "");
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const initials = displayName
    ? displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <div className="space-y-6">
      {/* Profile */}
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h3 className="text-sm font-semibold text-stone-900 mb-1">Profile</h3>
        <p className="text-xs text-stone-500 mb-5">Your personal information and preferences.</p>

        <div className="flex items-start gap-5 mb-6">
          <div className="relative group/avatar shrink-0">
            <div className="w-16 h-16 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xl font-bold">
              {initials}
            </div>
            <div className="absolute inset-0 w-16 h-16 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer">
              <Camera className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-stone-100">
          <button className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm">
            Save profile
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h3 className="text-sm font-semibold text-stone-900 mb-1">Change Password</h3>
        <p className="text-xs text-stone-500 mb-5">Update your account password.</p>

        <div className="space-y-3 max-w-sm">
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">Current password</label>
            <input type="password" placeholder="Enter current password" className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder:text-stone-300" />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">New password</label>
            <input type="password" placeholder="Enter new password" className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder:text-stone-300" />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">Confirm new password</label>
            <input type="password" placeholder="Confirm new password" className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder:text-stone-300" />
          </div>
        </div>

        <div className="flex justify-end pt-4 mt-4 border-t border-stone-100">
          <button className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm">
            Update password
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl border border-red-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-semibold text-red-700">Danger Zone</h3>
        </div>
        <p className="text-xs text-stone-500 mb-5">Irreversible actions. Proceed with caution.</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-stone-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-stone-700">Export all data</p>
              <p className="text-xs text-stone-400">Download all your contacts, interactions, and notes as a ZIP archive</p>
            </div>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
          <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50/50">
            <div>
              <p className="text-sm font-medium text-red-700">Delete account</p>
              <p className="text-xs text-red-500/80">Permanently delete your account and all data. This cannot be undone.</p>
            </div>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Main Settings page                                          */
/* ═══════════════════════════════════════════════════════════ */

const defaultState: SyncState = { status: "idle", message: "" };

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = (searchParams.get("tab") || "integrations") as TabId;
  const activeTab = TABS.some((t) => t.id === tabParam) ? tabParam : "integrations";

  const setTab = (tab: TabId) => {
    router.replace(`/settings?tab=${tab}`, { scroll: false });
  };

  // Connection state
  const [isLoading, setIsLoading] = useState(true);
  const [connected, setConnected] = useState<ConnectedAccounts>({
    google: false, telegram: false, twitter: false,
    google_email: null, google_accounts: [], telegram_username: null, twitter_username: null,
  });

  // Sync states
  const [googleConnect, setGoogleConnect] = useState<SyncState>(defaultState);
  const [googleSync, setGoogleSync] = useState<SyncState>(defaultState);
  const [telegramConnect, setTelegramConnect] = useState<SyncState>(defaultState);
  const [telegramSync, setTelegramSync] = useState<SyncState>(defaultState);
  const { data: telegramSyncProgress } = useTelegramSyncProgress();
  const [twitterConnect, setTwitterConnect] = useState<SyncState>(defaultState);
  const [twitterSync, setTwitterSync] = useState<SyncState>(defaultState);

  // Success modal
  const [successPlatform, setSuccessPlatform] = useState<string | null>(null);

  // Telegram multi-step
  const [telegramPhone, setTelegramPhone] = useState("");
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramPhoneCodeHash, setTelegramPhoneCodeHash] = useState("");
  const [telegramPassword, setTelegramPassword] = useState("");
  const [telegramStep, setTelegramStep] = useState<"phone" | "code" | "password" | "done">("phone");
  const [showTelegramModal, setShowTelegramModal] = useState(false);

  // Sync schedule (UI-only)
  const [bgSync, setBgSync] = useState(true);
  const [syncFreq, setSyncFreq] = useState("6h");

  // Detect OAuth redirect
  useEffect(() => {
    const platform = searchParams.get("connected");
    if (platform) {
      const label = platform.charAt(0).toUpperCase() + platform.slice(1);
      setSuccessPlatform(label);
      window.history.replaceState({}, "", "/settings?tab=integrations");
    }
  }, [searchParams]);

  const fetchConnectionStatus = useCallback(async () => {
    try {
      const result = await client.GET("/api/v1/auth/me", {});
      if (result.error) {
        const status = (result as { response?: { status?: number } }).response?.status;
        if (status === 401) window.location.href = "/auth/login";
        return;
      }
      const { data } = result;
      const user = data?.data as Record<string, unknown> | undefined;
      if (user) {
        const accounts: GoogleAccountInfo[] = (user.google_accounts as GoogleAccountInfo[]) || [];
        setConnected({
          google: !!user.google_connected || accounts.length > 0,
          google_email: (user.google_email as string) || null,
          google_accounts: accounts,
          telegram: !!user.telegram_connected,
          telegram_username: (user.telegram_username as string) || null,
          twitter: !!user.twitter_connected,
          twitter_username: (user.twitter_username as string) || null,
        });
      }
    } catch {
      // network error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnectionStatus();
  }, [fetchConnectionStatus]);

  const showSuccessModal = async (platform: string, username?: string | null) => {
    setSuccessPlatform(platform);
    const key = platform.toLowerCase();
    setConnected((prev) => ({
      ...prev,
      [key]: true,
      ...(username ? { [`${key}_username`]: username } : {}),
    }));
    await fetchConnectionStatus();
  };

  // Polling
  const pollForNotification = useCallback((platform: string, setter: (s: SyncState) => void) => {
    let attempts = 0;
    const maxAttempts = 60;
    let baselineCount: number | null = null;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const { data } = await client.GET("/api/v1/notifications/unread-count", {});
        const count = (data as { data?: { count?: number } })?.data?.count ?? 0;
        if (baselineCount === null) {
          baselineCount = count;
        } else if (count > baselineCount) {
          clearInterval(interval);
          setter({ status: "success", message: `${platform} sync completed! Check notifications for details.` });
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          setter({ status: "error", message: `${platform} sync is taking too long. The background worker may not be running.` });
        }
      } catch { /* ignore */ }
    }, 2000);
  }, []);

  /* ── Google handlers ── */
  const handleGoogleConnect = async () => {
    setGoogleConnect({ status: "loading", message: "" });
    try {
      const { data, error } = await client.GET("/api/v1/auth/google/url", {});
      if (error || !data?.data) {
        setGoogleConnect({ status: "error", message: "Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env" });
        return;
      }
      const url = (data.data as { url?: string })?.url;
      if (url) window.location.href = url;
      else setGoogleConnect({ status: "error", message: "Google OAuth not configured" });
    } catch {
      setGoogleConnect({ status: "error", message: "Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env" });
    }
  };

  // Consolidated "Sync now" for Google — triggers contacts, gmail, calendar in parallel
  const handleGoogleSyncAll = async () => {
    setGoogleSync({ status: "loading", message: "" });
    try {
      const results = await Promise.allSettled([
        client.POST("/api/v1/contacts/sync/google"),
        client.POST("/api/v1/contacts/sync/gmail" as any, {}),
        client.POST("/api/v1/contacts/sync/google-calendar"),
      ]);
      const anyError = results.some((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error));
      if (anyError) {
        setGoogleSync({ status: "error", message: "Some sync operations failed. Check your Google connection." });
      } else {
        setGoogleSync({ status: "loading", message: "Sync dispatched. Waiting for background worker..." });
        pollForNotification("Google", setGoogleSync);
      }
    } catch {
      setGoogleSync({ status: "error", message: "Google sync failed. Please try again." });
    }
  };

  /* ── Telegram handlers ── */
  const closeTelegramModal = () => {
    setShowTelegramModal(false);
    setTelegramStep("phone");
    setTelegramPhone("");
    setTelegramCode("");
    setTelegramPassword("");
    setTelegramPhoneCodeHash("");
    setTelegramConnect({ status: "idle", message: "" });
  };

  const handleTelegramConnect = () => {
    setShowTelegramModal(true);
    setTelegramStep("phone");
    setTelegramConnect({ status: "idle", message: "" });
  };

  const handleTelegramSendCode = async () => {
    setTelegramConnect({ status: "loading", message: "" });
    const { data, error } = await client.POST("/api/v1/auth/telegram/connect", { body: { phone: telegramPhone } });
    if (error) {
      setTelegramConnect({ status: "error", message: (error as { detail?: string })?.detail ?? "Failed to send code." });
    } else {
      setTelegramPhoneCodeHash((data?.data as { phone_code_hash?: string })?.phone_code_hash ?? "");
      setTelegramStep("code");
      setTelegramConnect({ status: "idle", message: "Code sent to your Telegram app" });
    }
  };

  const handleTelegramVerify = async () => {
    setTelegramConnect({ status: "loading", message: "" });
    const { data, error } = await client.POST("/api/v1/auth/telegram/verify", {
      body: { phone: telegramPhone, code: telegramCode, phone_code_hash: telegramPhoneCodeHash },
    });
    if (error) {
      setTelegramConnect({ status: "error", message: (error as { detail?: string })?.detail ?? "Invalid code." });
      return;
    }
    const respData = data?.data as { requires_2fa?: boolean; username?: string } | undefined;
    if (respData?.requires_2fa) {
      setTelegramStep("password");
      setTelegramConnect({ status: "idle", message: "Two-step verification is enabled. Enter your Telegram password." });
      return;
    }
    setTelegramStep("done");
    setTelegramCode("");
    closeTelegramModal();
    setTelegramConnect({ status: "success", message: "" });
    await showSuccessModal("Telegram", respData?.username);
  };

  const handleTelegram2FA = async () => {
    setTelegramConnect({ status: "loading", message: "" });
    const { data, error } = await client.POST("/api/v1/auth/telegram/verify-2fa", { body: { password: telegramPassword } });
    if (error) {
      setTelegramPassword("");
      setTelegramConnect({ status: "error", message: (error as { detail?: string })?.detail ?? "Incorrect password." });
      return;
    }
    setTelegramStep("done");
    setTelegramPassword("");
    closeTelegramModal();
    setTelegramConnect({ status: "success", message: "" });
    await showSuccessModal("Telegram", (data?.data as { username?: string })?.username);
  };

  const handleTelegramSync = async () => {
    setTelegramSync({ status: "loading", message: "" });
    const { error } = await client.POST("/api/v1/contacts/sync/telegram", {});
    if (error) {
      setTelegramSync({ status: "error", message: (error as { detail?: string })?.detail ?? "Telegram sync failed." });
    } else {
      setTelegramSync({ status: "loading", message: "Sync dispatched. Waiting for background worker..." });
      pollForNotification("Telegram", setTelegramSync);
    }
  };

  /* ── Twitter handlers ── */
  const handleTwitterConnect = async () => {
    setTwitterConnect({ status: "loading", message: "" });
    const { data, error } = await client.GET("/api/v1/auth/twitter/url", {});
    if (error || !data?.data) {
      setTwitterConnect({ status: "error", message: "Twitter OAuth not configured. Set TWITTER_CLIENT_ID in .env" });
      return;
    }
    const url = (data.data as { url?: string })?.url;
    if (url) window.location.href = url;
    else setTwitterConnect({ status: "error", message: "Twitter OAuth not configured" });
  };

  const handleTwitterSync = async () => {
    setTwitterSync({ status: "loading", message: "" });
    const { error } = await client.POST("/api/v1/contacts/sync/twitter", {});
    if (error) {
      setTwitterSync({ status: "error", message: (error as { detail?: string })?.detail ?? "Sync failed." });
    } else {
      setTwitterSync({ status: "loading", message: "Sync dispatched. Waiting for background worker..." });
      pollForNotification("Twitter", setTwitterSync);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-stone-900 mb-1">Settings</h1>
          <p className="text-sm text-stone-500 mb-8">Manage integrations, imports, follow-up rules, tags, and your account.</p>
          <div className="flex items-center gap-2 text-sm text-stone-400 mt-12 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading accounts...
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════ */
  /*  Render                                                     */
  /* ═══════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-900">Settings</h1>
          <p className="text-sm text-stone-500 mt-1">Manage integrations, imports, follow-up rules, tags, and your account.</p>
        </div>

        {/* Tab bar */}
        <TabBar activeTab={activeTab} onChange={setTab} />

        {/* ── Tab panels ── */}

        {/* Integrations */}
        {activeTab === "integrations" && (
          <div className="space-y-4">
            {/* Gmail Card */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={cn("w-11 h-11 rounded-lg flex items-center justify-center shrink-0", connected.google ? "bg-red-50" : "bg-stone-100")}>
                    <GmailIcon />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-sm font-semibold text-stone-900">Gmail</h3>
                      <ConnectionBadge connected={connected.google} />
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">Sync email threads, contacts, and calendar from Google.</p>
                    {connected.google && (
                      <>
                        {connected.google_accounts.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {connected.google_accounts.map((ga) => (
                              <div key={ga.id} className="flex items-center gap-2 text-xs">
                                <span className="text-teal-600 font-medium flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  {ga.email}
                                </span>
                                <button
                                  onClick={async () => {
                                    await client.DELETE("/api/v1/auth/google/accounts/{account_id}", { params: { path: { account_id: ga.id } } });
                                    await fetchConnectionStatus();
                                  }}
                                  className="text-stone-400 hover:text-red-500 transition-colors"
                                  title="Remove account"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : connected.google_email ? (
                          <p className="text-xs text-teal-600 mt-1">Connected as <strong>{connected.google_email}</strong></p>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {connected.google ? (
                    <>
                      <SyncButtonWrapper phase={googleSync.status as SyncPhase}>
                        <button
                          onClick={() => void handleGoogleSyncAll()}
                          disabled={googleSync.status === "loading"}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50"
                        >
                          {googleSync.status === "loading" ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : googleSync.status === "success" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          {googleSync.status === "loading" ? "Syncing..." : googleSync.status === "success" ? "Done" : "Sync now"}
                        </button>
                      </SyncButtonWrapper>
                      <KebabMenu items={[
                        { icon: Settings, label: "Sync settings" },
                        { icon: Key, label: "Re-authorize", onClick: () => void handleGoogleConnect() },
                        { icon: History, label: "Sync history" },
                        { icon: Unplug, label: "---" },
                        { icon: Unplug, label: "Disconnect Gmail", danger: true },
                      ]} />
                    </>
                  ) : (
                    <button
                      onClick={() => void handleGoogleConnect()}
                      disabled={googleConnect.status === "loading"}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {googleConnect.status === "loading" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Connect
                    </button>
                  )}
                </div>
              </div>
              {googleConnect.message && (
                <p className={cn("text-xs mt-3 flex items-center gap-1", googleConnect.status === "error" ? "text-red-500" : "text-emerald-600")}>
                  {googleConnect.status === "error" ? <AlertCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                  {googleConnect.message}
                </p>
              )}
              {googleSync.message && !googleSync.details && (
                <p className={cn("text-xs mt-3 flex items-center gap-1", googleSync.status === "error" ? "text-red-500" : "text-emerald-600")}>
                  {googleSync.status === "error" ? <AlertCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                  {googleSync.message}
                </p>
              )}
              {googleSync.details && <SyncResultPanel details={googleSync.details} status={googleSync.status} />}
            </div>

            {/* Telegram Card */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={cn("w-11 h-11 rounded-lg flex items-center justify-center shrink-0", connected.telegram ? "bg-sky-50" : "bg-stone-100")}>
                    <TelegramIcon />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-sm font-semibold text-stone-900">Telegram</h3>
                      <ConnectionBadge connected={connected.telegram} />
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">Chat history and contact sync via MTProto session.</p>
                    {connected.telegram && connected.telegram_username && (
                      <p className="text-xs text-teal-600 mt-1">Connected as <strong>@{connected.telegram_username}</strong></p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {connected.telegram ? (
                    <>
                      <SyncButtonWrapper phase={telegramSync.status as SyncPhase}>
                        <button
                          onClick={() => void handleTelegramSync()}
                          disabled={telegramSync.status === "loading"}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50"
                        >
                          {telegramSync.status === "loading" ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : telegramSync.status === "success" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          {telegramSync.status === "loading" ? "Syncing..." : telegramSync.status === "success" ? "Done" : "Sync now"}
                        </button>
                      </SyncButtonWrapper>
                      <KebabMenu items={[
                        { icon: Settings, label: "Sync settings" },
                        { icon: RotateCcw, label: "Reset session" },
                        { icon: History, label: "Sync history" },
                        { icon: Unplug, label: "---" },
                        { icon: Unplug, label: "Disconnect Telegram", danger: true },
                      ]} />
                    </>
                  ) : (
                    <button
                      onClick={handleTelegramConnect}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Connect
                    </button>
                  )}
                </div>
              </div>
              {telegramConnect.message && !showTelegramModal && (
                <p className={cn("text-xs mt-3 flex items-center gap-1", telegramConnect.status === "error" ? "text-red-500" : "text-emerald-600")}>
                  {telegramConnect.status === "error" ? <AlertCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                  {telegramConnect.message}
                </p>
              )}
              {telegramSync.message && (
                <p className={cn("text-xs mt-3 flex items-center gap-1", telegramSync.status === "error" ? "text-red-500" : "text-emerald-600")}>
                  {telegramSync.status === "error" ? <AlertCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                  {telegramSync.message}
                </p>
              )}
              {telegramSync.details && <SyncResultPanel details={telegramSync.details} status={telegramSync.status} />}
              {telegramSyncProgress?.active && (
                <TelegramSyncProgressCard progress={telegramSyncProgress} />
              )}
            </div>

            {/* Twitter Card */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                    <TwitterIcon />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-sm font-semibold text-stone-900">Twitter / X</h3>
                      <ConnectionBadge connected={connected.twitter} />
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">Sync DMs, mentions, and bio changes from X.</p>
                    {connected.twitter && connected.twitter_username && (
                      <p className="text-xs text-teal-600 mt-1">Connected as <strong>@{connected.twitter_username}</strong></p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {connected.twitter ? (
                    <>
                      <SyncButtonWrapper phase={twitterSync.status as SyncPhase}>
                        <button
                          onClick={() => void handleTwitterSync()}
                          disabled={twitterSync.status === "loading"}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50"
                        >
                          {twitterSync.status === "loading" ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : twitterSync.status === "success" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          {twitterSync.status === "loading" ? "Syncing..." : twitterSync.status === "success" ? "Done" : "Sync now"}
                        </button>
                      </SyncButtonWrapper>
                      <KebabMenu items={[
                        { icon: Settings, label: "Sync settings" },
                        { icon: Key, label: "Re-authorize", onClick: () => void handleTwitterConnect() },
                        { icon: History, label: "Sync history" },
                        { icon: Unplug, label: "---" },
                        { icon: Unplug, label: "Disconnect Twitter", danger: true },
                      ]} />
                    </>
                  ) : (
                    <button
                      onClick={() => void handleTwitterConnect()}
                      disabled={twitterConnect.status === "loading"}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {twitterConnect.status === "loading" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Connect
                    </button>
                  )}
                </div>
              </div>
              {twitterConnect.message && (
                <p className={cn("text-xs mt-3 flex items-center gap-1", twitterConnect.status === "error" ? "text-red-500" : "text-emerald-600")}>
                  {twitterConnect.status === "error" ? <AlertCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                  {twitterConnect.message}
                </p>
              )}
              {twitterSync.message && (
                <p className={cn("text-xs mt-3 flex items-center gap-1", twitterSync.status === "error" ? "text-red-500" : "text-emerald-600")}>
                  {twitterSync.status === "error" ? <AlertCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                  {twitterSync.message}
                </p>
              )}
              {twitterSync.details && <SyncResultPanel details={twitterSync.details} status={twitterSync.status} />}
            </div>

            {/* Sync Schedule */}
            <div className="h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent mt-6 mb-5" />
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <h3 className="text-sm font-semibold text-stone-900 mb-4">Sync Schedule</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-stone-700">Background sync</p>
                    <p className="text-xs text-stone-400">Automatically sync all connected platforms</p>
                  </div>
                  <Toggle checked={bgSync} onChange={setBgSync} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-stone-700">Sync frequency</p>
                    <p className="text-xs text-stone-400">How often background sync runs</p>
                  </div>
                  <select
                    value={syncFreq}
                    onChange={(e) => setSyncFreq(e.target.value)}
                    className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="3h">Every 3 hours</option>
                    <option value="6h">Every 6 hours</option>
                    <option value="12h">Every 12 hours</option>
                    <option value="24h">Once daily</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import */}
        {activeTab === "import" && (
          <div className="space-y-4">
            {/* CSV Import */}
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-stone-900">CSV Import</h3>
                  <p className="text-xs text-stone-500 mt-0.5 mb-4">Upload a CSV file with contact data. Supports Google Contacts export format.</p>
                  <CsvImport />
                </div>
              </div>
            </div>

            {/* LinkedIn Import */}
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <LinkedInImport />
              <LinkedInMessagesImport />
            </div>
          </div>
        )}

        {/* Follow-up Rules */}
        {activeTab === "followup" && <FollowUpRulesTab />}

        {/* Tags */}
        {activeTab === "tags" && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <TagTaxonomyPanel />
          </div>
        )}

        {/* Account */}
        {activeTab === "account" && <AccountTab />}
      </div>

      {/* Success modal */}
      {successPlatform && (
        <SuccessModal platform={successPlatform} onClose={() => setSuccessPlatform(null)} />
      )}

      {/* Telegram phone/code/password modal */}
      {showTelegramModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-stone-900">Connect Telegram</h3>
              <button onClick={closeTelegramModal} aria-label="Close" className="text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {telegramStep === "phone" && (
              <>
                <label htmlFor="telegram-phone" className="block text-sm font-medium text-stone-700 mb-1">Phone number</label>
                <input
                  id="telegram-phone"
                  type="tel"
                  value={telegramPhone}
                  onChange={(e) => setTelegramPhone(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <div className="flex gap-2">
                  <button onClick={closeTelegramModal} className="flex-1 px-3 py-2 text-sm rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50">Cancel</button>
                  <button
                    onClick={() => void handleTelegramSendCode()}
                    disabled={!telegramPhone.trim() || telegramConnect.status === "loading"}
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50"
                  >
                    {telegramConnect.status === "loading" ? "Sending..." : "Send code"}
                  </button>
                </div>
              </>
            )}

            {telegramStep === "code" && (
              <>
                <label htmlFor="telegram-code" className="block text-sm text-stone-500 mb-3">
                  Enter the code sent to your Telegram app.
                </label>
                <input
                  id="telegram-code"
                  type="text"
                  value={telegramCode}
                  onChange={(e) => setTelegramCode(e.target.value)}
                  placeholder="12345"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <div className="flex gap-2">
                  <button onClick={closeTelegramModal} className="flex-1 px-3 py-2 text-sm rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50">Cancel</button>
                  <button
                    onClick={() => void handleTelegramVerify()}
                    disabled={!telegramCode.trim() || telegramConnect.status === "loading"}
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50"
                  >
                    {telegramConnect.status === "loading" ? "Verifying..." : "Verify"}
                  </button>
                </div>
              </>
            )}

            {telegramStep === "password" && (
              <>
                <label htmlFor="telegram-password" className="block text-sm text-stone-500 mb-3">
                  Your account has two-step verification. Enter your Telegram password.
                </label>
                <input
                  id="telegram-password"
                  type="password"
                  value={telegramPassword}
                  onChange={(e) => setTelegramPassword(e.target.value)}
                  placeholder="Telegram password"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <div className="flex gap-2">
                  <button onClick={closeTelegramModal} className="flex-1 px-3 py-2 text-sm rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50">Cancel</button>
                  <button
                    onClick={() => void handleTelegram2FA()}
                    disabled={!telegramPassword.trim() || telegramConnect.status === "loading"}
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50"
                  >
                    {telegramConnect.status === "loading" ? "Verifying..." : "Submit"}
                  </button>
                </div>
              </>
            )}

            {telegramConnect.message && (
              <p className={cn("text-xs mt-3", telegramConnect.status === "error" ? "text-red-500" : "text-emerald-600")}>
                {telegramConnect.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Exports                                                     */
/* ═══════════════════════════════════════════════════════════ */

function PageLoading() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-teal-500 border-t-transparent rounded-full" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <SettingsPageInner />
    </Suspense>
  );
}

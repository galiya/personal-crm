"use client";

import { useRef, useState } from "react";
import { Upload, Sparkles } from "lucide-react";
import { client } from "@/lib/api-client";
import { CsvImport } from "@/components/csv-import";

/* ── LinkedIn connections import ── */
function LinkedInImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);
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
        setResult(
          data?.data as { created: number; skipped: number; errors: string[] }
        );
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
      <div className="w-11 h-11 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="#2563eb" strokeWidth="2" />
          <path
            d="M8 11v5M8 8v.01M12 16v-5c0-1 1-2 2-2s2 1 2 2v5"
            stroke="#2563eb"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">LinkedIn Export</h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 mb-4">
          Import your LinkedIn connections and messages.
        </p>

        <div className="bg-stone-50 dark:bg-stone-800 rounded-lg p-4 mb-4">
          <h4 className="text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2">
            How to export from LinkedIn:
          </h4>
          <ol className="text-xs text-stone-500 dark:text-stone-400 space-y-1.5 list-decimal ml-4">
            <li>
              Go to{" "}
              <span className="font-medium text-stone-600 dark:text-stone-300">
                Settings &rarr; Data Privacy &rarr; Get a copy of your data
              </span>
            </li>
            <li>
              Select{" "}
              <span className="font-medium text-stone-600 dark:text-stone-300">&quot;Connections&quot;</span> and
              request the archive
            </li>
            <li>Download the CSV when ready and upload it here</li>
          </ol>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={status === "loading"}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {status === "loading" ? "Importing..." : "Upload Connections.csv"}
        </button>
        {result && (
          <p className="text-xs mt-2 text-emerald-600 dark:text-emerald-400">
            Imported {result.created} contacts
            {result.skipped > 0 ? `, ${result.skipped} duplicates skipped` : ""}
            {result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}
          </p>
        )}
        {error && <p className="text-xs mt-2 text-red-500 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}

/* ── LinkedIn messages import ── */
function LinkedInMessagesImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{
    new_interactions: number;
    skipped: number;
    unmatched: number;
    unmatched_names: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setStatus("loading");
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data, error } = await client.POST(
        "/api/v1/contacts/import/linkedin-messages",
        {
          body: formData as unknown as { file: string },
          bodySerializer: () => formData,
        }
      );
      if (error) {
        setError((error as { detail?: string })?.detail ?? "Import failed");
        setStatus("error");
      } else {
        setResult(
          data?.data as {
            new_interactions: number;
            skipped: number;
            unmatched: number;
            unmatched_names: string[];
          }
        );
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
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={status === "loading"}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
      >
        <Upload className="w-3.5 h-3.5" />
        {status === "loading" ? "Importing..." : "Upload messages.csv"}
      </button>
      {result && (
        <div className="text-xs mt-2">
          <p className="text-emerald-600 dark:text-emerald-400">
            Imported {result.new_interactions} messages
            {result.skipped > 0 ? `, ${result.skipped} duplicates skipped` : ""}
          </p>
          {result.unmatched > 0 && (
            <p className="text-amber-600 dark:text-amber-400 mt-1">
              {result.unmatched} contacts not found: {result.unmatched_names.join(", ")}
              {result.unmatched > result.unmatched_names.length ? "..." : ""}
            </p>
          )}
        </div>
      )}
      {error && <p className="text-xs mt-2 text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}

/* ── Import Tab ── */
export function ImportTab() {
  return (
    <div className="space-y-4">
      {/* CSV Import */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-5">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">CSV Import</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 mb-4">
              Upload a CSV file with contact data. Supports Google Contacts export format.
            </p>
            <CsvImport />
          </div>
        </div>
      </div>

      {/* LinkedIn Import */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-5">
        <LinkedInImport />
        <LinkedInMessagesImport />
      </div>
    </div>
  );
}

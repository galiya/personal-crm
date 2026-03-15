"use client";

import { useState, useRef, useEffect } from "react";
import { Building2, Check, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { InlineListField } from "@/components/inline-list-field";
import { CompanyFavicon } from "@/components/company-favicon";
import { client } from "@/lib/api-client";
import { type Contact } from "@/hooks/use-contacts";

/* ── Copy button ── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={cn(
        "p-0.5 rounded transition-opacity",
        copied
          ? "text-emerald-500 opacity-100"
          : "text-stone-300 hover:text-stone-500 opacity-0 group-hover/row:opacity-100"
      )}
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3" /> : (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

/* ── Inline field ── */

function InlineField({
  label,
  value,
  displayValue,
  onSave,
  copyable,
  isLink,
  linkPrefix,
  internalHref,
}: {
  label: string;
  value: string | null | undefined;
  displayValue?: string;
  onSave: (v: string) => void;
  copyable?: boolean;
  isLink?: boolean;
  linkPrefix?: string;
  internalHref?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    if (draft !== (value ?? "")) onSave(draft);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  const startEdit = () => {
    setDraft(value ?? "");
    setEditing(true);
  };

  return (
    <div className="group/row flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-stone-500 shrink-0 mt-0.5">{label}</span>
      {editing ? (
        <div className="flex flex-col items-end gap-1.5 min-w-0 flex-1">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            className="w-full text-xs border border-stone-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 bg-white"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={cancel}
              className="px-2.5 py-1 text-xs font-medium rounded-md text-stone-600 hover:bg-stone-100 border border-stone-200"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0">
          {value ? (
            internalHref ? (
              <Link
                href={internalHref}
                className="text-xs font-medium text-teal-600 hover:text-teal-700 truncate"
              >
                {displayValue ?? value}
              </Link>
            ) : isLink && linkPrefix !== undefined ? (
              <a
                href={`${linkPrefix}${value}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-teal-600 hover:text-teal-700 cursor-pointer truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {displayValue ?? value}
              </a>
            ) : (
              <span className="text-xs font-medium text-stone-900 truncate">
                {displayValue ?? value}
              </span>
            )
          ) : (
            <span className="text-xs text-stone-400">—</span>
          )}
          {copyable && value && <CopyButton text={value} />}
          <button
            onClick={startEdit}
            className="p-0.5 rounded text-stone-300 hover:text-stone-500 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Company autocomplete field ── */

interface OrgOption {
  id: string;
  name: string;
}

function CompanyAutocompleteField({
  value,
  organizationId,
  emails,
  onSave,
  onLinkOrg,
}: {
  value: string | null | undefined;
  organizationId: string | null | undefined;
  emails?: string[] | null;
  onSave: (v: string) => void;
  onLinkOrg: (orgId: string, orgName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [options, setOptions] = useState<OrgOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchOptions = (query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setOptions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await client.GET("/api/v1/organizations" as any, {
          params: { query: { search: query, page_size: "8" } },
        });
        const orgs = ((res.data as any)?.data ?? []) as OrgOption[];
        setOptions(orgs);
        setShowDropdown(orgs.length > 0 || query.trim().length > 0);
      } catch {
        setOptions([]);
      }
    }, 200);
  };

  const save = () => {
    if (draft !== (value ?? "")) onSave(draft);
    setEditing(false);
    setShowDropdown(false);
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
    setShowDropdown(false);
  };

  const selectOrg = (org: OrgOption) => {
    onLinkOrg(org.id, org.name);
    setEditing(false);
    setShowDropdown(false);
  };

  const startEdit = () => {
    setDraft(value ?? "");
    setEditing(true);
  };

  return (
    <div className="group/row flex items-start justify-between gap-4 py-1.5" ref={wrapperRef}>
      <span className="text-xs text-stone-500 shrink-0 mt-0.5">Company</span>
      {editing ? (
        <div className="flex flex-col items-end gap-1.5 min-w-0 flex-1 relative">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              fetchOptions(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            className="w-full text-xs border border-stone-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 bg-white"
            autoComplete="off"
          />
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
              {options.map((org) => (
                <button
                  key={org.id}
                  onClick={() => selectOrg(org)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 flex items-center gap-2 transition-colors"
                >
                  <Building2 className="w-3 h-3 text-stone-400 shrink-0" />
                  <span className="text-stone-900 truncate">{org.name}</span>
                </button>
              ))}
              {draft.trim() &&
                !options.some((o) => o.name.toLowerCase() === draft.toLowerCase()) && (
                  <button
                    onClick={save}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center gap-2 border-t border-stone-100 transition-colors"
                  >
                    <Plus className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="text-emerald-700">Set as &quot;{draft.trim()}&quot;</span>
                  </button>
                )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={cancel}
              className="px-2.5 py-1 text-xs font-medium rounded-md text-stone-600 hover:bg-stone-100 border border-stone-200"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0">
          {value ? (
            <>
              <CompanyFavicon emails={emails} size="w-3.5 h-3.5" />
              {organizationId ? (
                <Link
                  href={`/organizations/${organizationId}`}
                  className="text-xs font-medium text-teal-600 hover:text-teal-700 truncate"
                >
                  {value}
                </Link>
              ) : (
                <span className="text-xs font-medium text-stone-900 truncate">{value}</span>
              )}
            </>
          ) : (
            <span className="text-xs text-stone-400">—</span>
          )}
          <button
            onClick={startEdit}
            className="p-0.5 rounded text-stone-300 hover:text-stone-500 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Details Panel ── */

export function DetailsPanel({
  contact,
  onSaveField,
  onLinkOrg,
}: {
  contact: Contact;
  onSaveField: (field: string, value: string | string[]) => void;
  onLinkOrg: (orgId: string, orgName: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <h3 className="text-sm font-semibold text-stone-900 mb-4">Contact Details</h3>
      <div className="space-y-0.5">
        <InlineField
          label="First name"
          value={contact.given_name}
          onSave={(v) => onSaveField("given_name", v)}
        />
        <InlineField
          label="Last name"
          value={contact.family_name}
          onSave={(v) => onSaveField("family_name", v)}
        />
        <InlineField
          label="Title"
          value={contact.title}
          onSave={(v) => onSaveField("title", v)}
        />
        <CompanyAutocompleteField
          value={contact.company}
          organizationId={contact.organization_id}
          emails={contact.emails}
          onSave={(v) => onSaveField("company", v)}
          onLinkOrg={onLinkOrg}
        />
        <InlineField
          label="Location"
          value={contact.location}
          onSave={(v) => onSaveField("location", v)}
        />
        <InlineField
          label="Birthday"
          value={contact.birthday}
          onSave={(v) => onSaveField("birthday", v)}
        />

        <div className="my-2 h-px bg-stone-100" />

        <InlineListField
          label="Email"
          values={contact.emails ?? []}
          onSave={(v) => onSaveField("emails", v)}
          copyable
          isLink
          linkPrefix="mailto:"
        />
        <InlineField
          label="Telegram"
          value={contact.telegram_username}
          onSave={(v) => onSaveField("telegram_username", v)}
          copyable
          isLink
          linkPrefix="https://t.me/"
        />
        <InlineField
          label="Twitter"
          value={contact.twitter_handle}
          onSave={(v) => onSaveField("twitter_handle", v)}
          copyable
          isLink
          linkPrefix="https://x.com/"
        />
        <InlineField
          label="LinkedIn"
          value={contact.linkedin_url}
          displayValue={contact.linkedin_url
            ?.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "")
            ?.replace(/\/$/, "")}
          onSave={(v) => onSaveField("linkedin_url", v)}
          isLink
          linkPrefix=""
          copyable
        />
        <InlineListField
          label="Phone"
          values={contact.phones ?? []}
          onSave={(v) => onSaveField("phones", v)}
          copyable
          isLink
          linkPrefix="tel:"
        />
      </div>
    </div>
  );
}

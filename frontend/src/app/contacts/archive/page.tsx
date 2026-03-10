"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Archive, ArrowLeft } from "lucide-react";
import { useContacts } from "@/hooks/use-contacts";
import { useUpdateContact } from "@/hooks/use-contacts";
import { ScoreBadge } from "@/components/score-badge";
import { formatDistanceToNow } from "date-fns";

export default function ArchivedContactsPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 py-8"><div className="h-8 w-48 bg-stone-100 rounded animate-pulse" /></div>}>
      <ArchivedContactsInner />
    </Suspense>
  );
}

function ArchivedContactsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const pageParam = Number(searchParams.get("page")) || 1;
  const searchParam = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(searchParam);

  const { data, isLoading, isError } = useContacts({
    page: pageParam,
    page_size: 20,
    search: searchParam || undefined,
    archived_only: true,
    sort: "created",
  });

  const updateContact = useUpdateContact();

  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (val) params.set(key, val);
        else params.delete(key);
      }
      // Reset to page 1 on search change
      if ("q" in updates) params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `/contacts/archive?${qs}` : "/contacts/archive", {
        scroll: false,
      });
    },
    [searchParams, router],
  );

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      updateUrl({ q: searchInput || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, updateUrl]);

  const contacts = data?.data ?? [];
  const meta = data?.meta;

  const handleUnarchive = (contactId: string) => {
    updateContact.mutate({ id: contactId, input: { priority_level: "normal" } });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/contacts"
            className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-stone-400" />
            <h1 className="text-2xl font-bold text-stone-900">Archived Contacts</h1>
          </div>
          {meta && (
            <span className="text-sm text-stone-400 ml-2">
              <span className="font-mono text-stone-600">{meta.total}</span> contacts
            </span>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text"
          placeholder="Search archived contacts..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-stone-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-red-600 text-sm">Failed to load archived contacts.</p>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <Archive className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No archived contacts found.</p>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs font-medium text-stone-400 uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Last Interaction</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="font-medium text-stone-900 hover:text-teal-600 transition-colors"
                    >
                      {c.full_name || c.emails?.[0] || "Unnamed"}
                    </Link>
                    {c.emails?.[0] && c.full_name && (
                      <p className="text-xs text-stone-400">{c.emails[0]}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{c.company || "—"}</td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={c.relationship_score} lastInteractionAt={c.last_interaction_at} />
                  </td>
                  <td className="px-4 py-3 text-stone-500">
                    {c.last_interaction_at
                      ? formatDistanceToNow(new Date(c.last_interaction_at), { addSuffix: true })
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleUnarchive(c.id)}
                      className="text-xs px-3 py-1 rounded-md border border-stone-200 text-stone-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors"
                    >
                      Unarchive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-stone-500">
          <span>
            Page <span className="font-mono text-stone-700">{meta.page}</span> of{" "}
            <span className="font-mono text-stone-700">{meta.total_pages}</span>
          </span>
          <div className="flex gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => updateUrl({ page: String(meta.page - 1) })}
              className="px-3 py-1 rounded border border-stone-200 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={meta.page >= meta.total_pages}
              onClick={() => updateUrl({ page: String(meta.page + 1) })}
              className="px-3 py-1 rounded border border-stone-200 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

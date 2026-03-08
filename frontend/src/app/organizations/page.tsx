"use client";

import { useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, Building2, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { client } from "@/lib/api-client";
import { ContactAvatar } from "@/components/contact-avatar";
import { ScoreBadge } from "@/components/score-badge";
import { formatDistanceToNow } from "date-fns";

interface OrgContact {
  id: string;
  full_name: string | null;
  given_name: string | null;
  family_name: string | null;
  title: string | null;
  avatar_url: string | null;
  relationship_score: number;
  last_interaction_at: string | null;
}

interface Organization {
  company: string;
  contact_count: number;
  contacts: OrgContact[];
}

export default function OrganizationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchFromUrl = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const page = Number(searchParams.get("page") ?? "1");

  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());

  const setParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      if (!("page" in updates)) params.delete("page");
      router.replace(`/organizations?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["organizations", searchFromUrl, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page), page_size: "50" };
      if (searchFromUrl) params.search = searchFromUrl;
      const { data } = await client.GET("/api/v1/organizations" as any, {
        params: { query: params },
      });
      return data as { data: Organization[]; meta: { total: number; page: number; page_size: number; total_pages: number } };
    },
  });

  const organizations = data?.data ?? [];
  const meta = data?.meta;

  const toggleOrg = (company: string) => {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
            {meta && (
              <p className="text-sm text-gray-500 mt-0.5">
                {meta.total} companies
              </p>
            )}
          </div>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search companies..."
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value;
                setSearchInput(value);
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => {
                  setParams({ q: value || undefined });
                }, 300);
              }}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-12 text-gray-400">Loading organizations...</div>
        )}

        {isError && (
          <div className="text-center py-12 text-red-500">
            Failed to load organizations.
          </div>
        )}

        {!isLoading && !isError && organizations.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No organizations found.
          </div>
        )}

        {organizations.length > 0 && (
          <div className="space-y-2">
            {organizations.map((org) => {
              const isExpanded = expandedOrgs.has(org.company);
              return (
                <div key={org.company} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => toggleOrg(org.company)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-900">{org.company}</span>
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {org.contact_count} {org.contact_count === 1 ? "person" : "people"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-50">
                          {org.contacts.map((contact) => {
                            const name =
                              contact.full_name ??
                              [contact.given_name, contact.family_name].filter(Boolean).join(" ") ??
                              "Unnamed";
                            return (
                              <tr key={contact.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 pl-14">
                                  <Link
                                    href={`/contacts/${contact.id}`}
                                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
                                  >
                                    <ContactAvatar
                                      avatarUrl={contact.avatar_url}
                                      name={name}
                                      size="xs"
                                    />
                                    {name}
                                  </Link>
                                </td>
                                <td className="px-4 py-2.5 text-gray-500">
                                  {contact.title ?? "-"}
                                </td>
                                <td className="px-4 py-2.5">
                                  <ScoreBadge score={contact.relationship_score} />
                                </td>
                                <td className="px-4 py-2.5 text-gray-500 text-right">
                                  {contact.last_interaction_at
                                    ? formatDistanceToNow(new Date(contact.last_interaction_at), { addSuffix: true })
                                    : "Never"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <button
              disabled={page <= 1}
              onClick={() => setParams({ page: String(page - 1) })}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {meta.total_pages}
            </span>
            <button
              disabled={page >= meta.total_pages}
              onClick={() => setParams({ page: String(page + 1) })}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

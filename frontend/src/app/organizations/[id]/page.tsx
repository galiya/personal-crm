"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Globe,
  Linkedin,
  MapPin,
  Pencil,
  Save,
  Trash2,
  Twitter,
  Users,
  X,
  BarChart3,
  MessageSquare,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { client } from "@/lib/api-client";
import { ContactAvatar } from "@/components/contact-avatar";
import { ScoreBadge } from "@/components/score-badge";
import { formatDistanceToNow } from "date-fns";

/* ── Helpers ── */

function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/* ── Types ── */

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

interface OrganizationData {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
  website: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  notes: string | null;
  contact_count: number;
  avg_relationship_score: number;
  total_interactions: number;
  last_interaction_at: string | null;
  contacts: OrgContact[] | null;
}

/* ── Stat Card ── */

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

/* ── Main Page ── */

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<OrganizationData>>({});
  const [sortBy, setSortBy] = useState<"score" | "name" | "recent">("score");

  const { data, isLoading, error } = useQuery({
    queryKey: ["organization", id],
    queryFn: async () => {
      const res = await client.GET("/api/v1/organizations/{org_id}" as any, {
        params: { path: { org_id: id } },
      });
      if (res.error) throw new Error("Failed to load organization");
      return (res.data as any)?.data as OrganizationData;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<OrganizationData>) => {
      const res = await client.PATCH("/api/v1/organizations/{org_id}" as any, {
        params: { path: { org_id: id } },
        body: updates as any,
      });
      return (res.data as any)?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", id] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await client.DELETE("/api/v1/organizations/{org_id}" as any, {
        params: { path: { org_id: id } },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      router.push("/organizations");
    },
  });

  const contacts = data?.contacts ?? [];
  const sortedContacts = useMemo(() => [...contacts].sort((a, b) => {
    if (sortBy === "score") return b.relationship_score - a.relationship_score;
    if (sortBy === "name") return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    if (sortBy === "recent") {
      const aDate = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      const bDate = b.last_interaction_at ? new Date(b.last_interaction_at).getTime() : 0;
      return bDate - aDate;
    }
    return 0;
  }), [contacts, sortBy]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-zinc-500">
        Loading organization...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-red-500">
        Organization not found.
      </div>
    );
  }

  const org = data;

  const handleSave = () => {
    updateMutation.mutate(editData);
  };

  const handleStartEdit = () => {
    setEditData({
      name: org.name,
      domain: org.domain,
      industry: org.industry,
      location: org.location,
      website: org.website,
      linkedin_url: org.linkedin_url,
      twitter_handle: org.twitter_handle,
      notes: org.notes,
    });
    setEditing(true);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/organizations")}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900">
            <Building2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          {editing ? (
            <input
              className="rounded border border-zinc-300 px-2 py-1 text-2xl font-bold dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              value={editData.name ?? ""}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            />
          ) : (
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{org.name}</h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="mr-1 inline h-4 w-4" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="rounded-md bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700 disabled:opacity-50"
              >
                <Save className="mr-1 inline h-4 w-4" /> Save
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartEdit}
                className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <Pencil className="mr-1 inline h-4 w-4" /> Edit
              </button>
              <button
                onClick={() => {
                  if (confirm("Delete this organization? Contacts will be unlinked but not deleted.")) {
                    deleteMutation.mutate();
                  }
                }}
                className="rounded-md px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="mr-1 inline h-4 w-4" /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Users} label="Contacts" value={org.contact_count} />
        <StatCard icon={BarChart3} label="Avg Score" value={org.avg_relationship_score} />
        <StatCard icon={MessageSquare} label="Interactions" value={org.total_interactions} />
        <StatCard
          icon={Clock}
          label="Last Activity"
          value={org.last_interaction_at ? formatDistanceToNow(new Date(org.last_interaction_at), { addSuffix: true }) : "Never"}
        />
      </div>

      {/* Info Panel */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Details
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {editing ? (
            <>
              <Field label="Domain" value={editData.domain} onChange={(v) => setEditData({ ...editData, domain: v })} />
              <Field label="Industry" value={editData.industry} onChange={(v) => setEditData({ ...editData, industry: v })} />
              <Field label="Location" value={editData.location} onChange={(v) => setEditData({ ...editData, location: v })} />
              <Field label="Website" value={editData.website} onChange={(v) => setEditData({ ...editData, website: v })} />
              <Field label="LinkedIn" value={editData.linkedin_url} onChange={(v) => setEditData({ ...editData, linkedin_url: v })} />
              <Field label="Twitter" value={editData.twitter_handle} onChange={(v) => setEditData({ ...editData, twitter_handle: v })} />
            </>
          ) : (
            <>
              <InfoRow icon={Globe} label="Domain" value={org.domain} />
              <InfoRow icon={Building2} label="Industry" value={org.industry} />
              <InfoRow icon={MapPin} label="Location" value={org.location} />
              <InfoRow
                icon={Globe}
                label="Website"
                value={org.website}
                href={safeHref(org.website)}
              />
              <InfoRow
                icon={Linkedin}
                label="LinkedIn"
                value={org.linkedin_url}
                href={safeHref(org.linkedin_url)}
              />
              <InfoRow icon={Twitter} label="Twitter" value={org.twitter_handle} />
            </>
          )}
        </div>

        {/* Notes */}
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Notes</label>
          {editing ? (
            <textarea
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              rows={3}
              value={editData.notes ?? ""}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
            />
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {org.notes || <span className="italic text-zinc-400">No notes</span>}
            </p>
          )}
        </div>
      </div>

      {/* Contacts Table */}
      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Contacts ({contacts.length})
          </h2>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-zinc-400">Sort:</span>
            {(["score", "name", "recent"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`rounded px-2 py-1 ${
                  sortBy === s
                    ? "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-400"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {s === "score" ? "Score" : s === "name" ? "Name" : "Recent"}
              </button>
            ))}
          </div>
        </div>

        {contacts.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-zinc-400">No contacts in this organization.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800">
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Title</th>
                <th className="px-5 py-2 font-medium text-center">Score</th>
                <th className="px-5 py-2 font-medium text-right">Last Interaction</th>
              </tr>
            </thead>
            <tbody>
              {sortedContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-zinc-50 hover:bg-zinc-50 dark:border-zinc-800/50 dark:hover:bg-zinc-800/30"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="flex items-center gap-3 text-sm font-medium text-zinc-900 hover:text-teal-600 dark:text-zinc-100"
                    >
                      <ContactAvatar
                        avatarUrl={contact.avatar_url}
                        name={contact.full_name ?? ""}
                        size="sm"
                      />
                      {contact.full_name || "Unknown"}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                    {contact.title || "-"}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <ScoreBadge score={contact.relationship_score} />
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-zinc-500 dark:text-zinc-400">
                    {contact.last_interaction_at
                      ? formatDistanceToNow(new Date(contact.last_interaction_at), { addSuffix: true })
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Helper Components ── */

function InfoRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Globe;
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
      <span className="text-zinc-500 dark:text-zinc-400">{label}:</span>
      {value ? (
        href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
            {value}
          </a>
        ) : (
          <span className="text-zinc-900 dark:text-zinc-100">{value}</span>
        )
      ) : (
        <span className="italic text-zinc-400">-</span>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500">{label}</label>
      <input
        className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

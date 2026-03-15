"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Users } from "lucide-react";
import { client } from "@/lib/api-client";

interface TelegramGroup {
  id: number;
  title: string;
  username?: string;
  link?: string;
  participants_count?: number;
}

export function CommonGroupsCard({
  contactId,
  hasTelegram,
}: {
  contactId: string;
  hasTelegram: boolean;
}) {
  const [groups, setGroups] = useState<TelegramGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!hasTelegram || fetched) return;
    setLoading(true);
    client
      .GET("/api/v1/contacts/{contact_id}/telegram/common-groups", {
        params: { path: { contact_id: contactId } },
      })
      .then(({ data }) => {
        setGroups((data?.data as TelegramGroup[]) ?? []);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setFetched(true);
      });
  }, [contactId, hasTelegram, fetched]);

  if (!hasTelegram || (!loading && groups.length === 0)) return null;

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-2">
        <Users className="w-4 h-4 text-sky-500" />
        Common Telegram Groups
      </h3>
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="h-4 bg-stone-100 rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <MessageCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                {g.link ? (
                  <a
                    href={g.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-stone-700 hover:text-sky-600 truncate"
                  >
                    {g.title}
                  </a>
                ) : (
                  <span className="text-stone-700 truncate">{g.title}</span>
                )}
              </div>
              {g.participants_count != null && (
                <span className="text-[11px] text-stone-400 shrink-0 ml-2">
                  {g.participants_count} members
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

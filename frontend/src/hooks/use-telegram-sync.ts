import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api-client";

export interface SyncProgress {
  active: boolean;
  phase?: string;
  total_dialogs?: number;
  dialogs_processed?: number;
  batches_total?: number;
  batches_completed?: number;
  contacts_found?: number;
  messages_synced?: number;
  started_at?: string;
}

export function useTelegramSyncProgress() {
  return useQuery({
    queryKey: ["telegram-sync-progress"],
    queryFn: async () => {
      const { data } = await client.GET("/api/v1/telegram/sync-progress" as any, {});
      const raw = (data as any)?.data;
      if (!raw || !raw.active) return { active: false } as SyncProgress;
      return {
        active: raw.active === true || raw.active === "true",
        phase: raw.phase,
        total_dialogs: parseInt(raw.total_dialogs) || 0,
        dialogs_processed: parseInt(raw.dialogs_processed) || 0,
        batches_total: parseInt(raw.batches_total) || 0,
        batches_completed: parseInt(raw.batches_completed) || 0,
        contacts_found: parseInt(raw.contacts_found) || 0,
        messages_synced: parseInt(raw.messages_synced) || 0,
        started_at: raw.started_at,
      } as SyncProgress;
    },
    refetchInterval: (query) => {
      const data = query.state.data as SyncProgress | undefined;
      return data?.active ? 3000 : false; // Poll every 3s when active
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api-client";

export interface SuggestionContact {
  id: string;
  full_name: string | null;
  given_name: string | null;
  family_name: string | null;
  company: string | null;
  title: string | null;
  avatar_url: string | null;
  telegram_username: string | null;
  twitter_handle: string | null;
  last_interaction_at: string | null;
}

export interface Suggestion {
  id: string;
  contact_id: string;
  contact: SuggestionContact | null;
  trigger_type: string;
  suggested_message: string;
  suggested_channel: "email" | "telegram" | "twitter";
  status: "pending" | "sent" | "snoozed" | "dismissed";
  scheduled_for: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface UpdateSuggestionInput {
  suggested_message?: string;
  suggested_channel?: "email" | "telegram" | "twitter";
  status?: "pending" | "sent" | "snoozed" | "dismissed";
  snooze_until?: string | null;
}

export function useSuggestions() {
  return useQuery({
    queryKey: ["suggestions"],
    queryFn: async () => {
      const { data } = await client.GET("/api/v1/suggestions");
      return data;
    },
  });
}

export function useUpdateSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: UpdateSuggestionInput;
    }) => {
      const { data } = await client.PUT(
        "/api/v1/suggestions/{suggestion_id}",
        {
          params: { path: { suggestion_id: id } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          body: input as any,
        }
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    },
  });
}

export function useGenerateSuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await client.POST("/api/v1/suggestions/generate");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contactId,
      message,
      channel,
      scheduledFor,
    }: {
      contactId: string;
      message: string;
      channel: string;
      scheduledFor?: string;
    }) => {
      const res = await fetch(
        `/api/v1/contacts/${contactId}/send-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
          },
          body: JSON.stringify({ message, channel, scheduled_for: scheduledFor || null }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to send message");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["suggestions"] });
      void queryClient.invalidateQueries({ queryKey: ["interactions", vars.contactId] });
      void queryClient.invalidateQueries({ queryKey: ["contacts", vars.contactId] });
    },
  });
}

export function useContactSuggestion(contactId: string | undefined) {
  const { data } = useSuggestions();
  const allSuggestions = (data?.data ?? []) as Suggestion[];
  return allSuggestions.find(
    (s) => s.contact_id === contactId && s.status === "pending"
  ) ?? null;
}

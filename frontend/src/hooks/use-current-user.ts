import { useEffect, useState } from "react";
import { client } from "@/lib/api-client";

export interface CurrentUser {
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await client.GET("/api/v1/auth/me", {});
        const data = (result.data as any)?.data;
        if (data) {
          setUser({
            full_name: data.full_name ?? null,
            email: data.email ?? "",
            avatar_url: data.avatar_url ?? null,
          });
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  return user;
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { client } from "@/lib/api-client";

export interface User {
  id: string;
  email: string;
  full_name: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await client.GET("/api/v1/auth/me");
      if (data?.data) {
        setUser(data.data as User);
      } else {
        localStorage.removeItem("access_token");
        setUser(null);
      }
    } catch {
      localStorage.removeItem("access_token");
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    const params = new URLSearchParams();
    params.set("username", email);
    params.set("password", password);

    const { data } = await client.POST("/api/v1/auth/login", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: params as any,
      bodySerializer: () => params,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!data) throw new Error("Login failed");
    localStorage.setItem("access_token", (data as { access_token: string }).access_token);

    const { data: meData } = await client.GET("/api/v1/auth/me");
    if (meData?.data) {
      setUser(meData.data as User);
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, full_name: string) => {
      await client.POST("/api/v1/auth/register", {
        body: { email, password, full_name },
      });
      await login(email, password);
    },
    [login]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    setUser(null);
    window.location.href = "/auth/login";
  }, []);

  return { user, isLoading, login, register, logout };
}

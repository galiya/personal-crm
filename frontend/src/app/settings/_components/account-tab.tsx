"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Camera, Download, Trash2 } from "lucide-react";
import { client } from "@/lib/api-client";

export function AccountTab() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Load profile
  useEffect(() => {
    (async () => {
      try {
        const result = await client.GET("/api/v1/auth/me", {});
        const user = (result.data as any)?.data;
        if (user) {
          setDisplayName(user.full_name || user.email || "");
          setEmail(user.email || "");
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await (client as any).PATCH("/api/v1/auth/me", {
        body: { full_name: displayName },
      });
      setSaveMsg("Saved");
    } catch {
      setSaveMsg("Error saving");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 2000);
    }
  };

  const initials = displayName
    ? displayName
        .split(" ")
        .map((w: string) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div className="space-y-6">
      {/* Profile */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-5">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">Profile</h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-5">
          Your personal information and preferences.
        </p>

        <div className="flex items-start gap-5 mb-6">
          <div className="relative group/avatar shrink-0">
            <div className="w-16 h-16 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xl font-bold">
              {initials}
            </div>
            <div className="absolute inset-0 w-16 h-16 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer">
              <Camera className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1 block">
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full text-sm border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-sm border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-100 dark:border-stone-800">
          {saveMsg && <span className="text-xs text-stone-500 dark:text-stone-400">{saveMsg}</span>}
          <button
            onClick={saveProfile}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-5">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">Change Password</h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-5">Update your account password.</p>

        <div className="space-y-3 max-w-sm">
          <div>
            <label className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1 block">
              Current password
            </label>
            <input
              type="password"
              placeholder="Enter current password"
              className="w-full text-sm border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder:text-stone-300 dark:placeholder:text-stone-600"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1 block">
              New password
            </label>
            <input
              type="password"
              placeholder="Enter new password"
              className="w-full text-sm border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder:text-stone-300 dark:placeholder:text-stone-600"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1 block">
              Confirm new password
            </label>
            <input
              type="password"
              placeholder="Confirm new password"
              className="w-full text-sm border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder:text-stone-300 dark:placeholder:text-stone-600"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 mt-4 border-t border-stone-100 dark:border-stone-800">
          <button className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm">
            Update password
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-red-200 dark:border-red-800 p-5">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Danger Zone</h3>
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-5">
          Irreversible actions. Proceed with caution.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-stone-200 dark:border-stone-700 rounded-lg">
            <div>
              <p className="text-sm font-medium text-stone-700 dark:text-stone-300">Export all data</p>
              <p className="text-xs text-stone-400 dark:text-stone-500">
                Download all your contacts, interactions, and notes as a ZIP archive
              </p>
            </div>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
          <div className="flex items-center justify-between p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50/50 dark:bg-red-950/50">
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Delete account</p>
              <p className="text-xs text-red-500/80 dark:text-red-400/80">
                Permanently delete your account and all data. This cannot be undone.
              </p>
            </div>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Toggle } from "./shared";
import { GoogleCard } from "./platform-cards/google-card";
import { TelegramCard } from "./platform-cards/telegram-card";
import { TwitterCard } from "./platform-cards/twitter-card";
import { LinkedInCard } from "./platform-cards/linkedin-card";
import type {
  ConnectedAccounts,
  SyncState,
} from "../_hooks/use-settings-controller";
import type { UseTelegramConnectFlowReturn } from "../_hooks/use-telegram-connect-flow";
import type { SyncProgress } from "@/hooks/use-telegram-sync";

export interface IntegrationsTabProps {
  connected: ConnectedAccounts;
  googleConnect: SyncState;
  googleSync: SyncState;
  telegramConnect: SyncState;
  telegramSync: SyncState;
  telegramSyncProgress: SyncProgress | undefined;
  twitterConnect: SyncState;
  twitterSync: SyncState;
  showTelegramModal: boolean;
  telegramFlow: UseTelegramConnectFlowReturn;
  fetchConnectionStatus: () => Promise<void>;
  handleGoogleConnect: () => Promise<void>;
  handleGoogleSyncAll: () => Promise<void>;
  handleTelegramSync: () => Promise<void>;
  handleTwitterConnect: () => Promise<void>;
  handleTwitterSync: () => Promise<void>;
  bgSync: boolean;
  setBgSync: (v: boolean) => void;
  syncFreq: string;
  setSyncFreq: (v: string) => void;
}

export function IntegrationsTab({
  connected,
  googleConnect,
  googleSync,
  telegramConnect,
  telegramSync,
  telegramSyncProgress,
  twitterConnect,
  twitterSync,
  showTelegramModal,
  telegramFlow,
  fetchConnectionStatus,
  handleGoogleConnect,
  handleGoogleSyncAll,
  handleTelegramSync,
  handleTwitterConnect,
  handleTwitterSync,
  bgSync,
  setBgSync,
  syncFreq,
  setSyncFreq,
}: IntegrationsTabProps) {
  return (
    <div className="space-y-4">
      <GoogleCard
        connected={connected}
        googleConnect={googleConnect}
        googleSync={googleSync}
        fetchConnectionStatus={fetchConnectionStatus}
        handleGoogleConnect={handleGoogleConnect}
        handleGoogleSyncAll={handleGoogleSyncAll}
      />

      <TelegramCard
        connected={connected}
        telegramConnect={telegramConnect}
        telegramSync={telegramSync}
        telegramSyncProgress={telegramSyncProgress}
        showTelegramModal={showTelegramModal}
        telegramFlow={telegramFlow}
        handleTelegramSync={handleTelegramSync}
      />

      <TwitterCard
        connected={connected}
        twitterConnect={twitterConnect}
        twitterSync={twitterSync}
        handleTwitterConnect={handleTwitterConnect}
        handleTwitterSync={handleTwitterSync}
      />

      <LinkedInCard
        connected={connected}
        fetchConnectionStatus={fetchConnectionStatus}
      />

      {/* Sync Schedule */}
      <div className="h-px bg-gradient-to-r from-transparent via-stone-200 dark:via-stone-700 to-transparent mt-6 mb-5" />
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-5">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-4">Sync Schedule</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-700 dark:text-stone-300">Background sync</p>
              <p className="text-xs text-stone-400 dark:text-stone-500">Automatically sync all connected platforms</p>
            </div>
            <Toggle checked={bgSync} onChange={setBgSync} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-700 dark:text-stone-300">Sync frequency</p>
              <p className="text-xs text-stone-400 dark:text-stone-500">How often background sync runs</p>
            </div>
            <select
              value={syncFreq}
              onChange={(e) => setSyncFreq(e.target.value)}
              className="text-sm border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-1.5 text-stone-700 dark:text-stone-300 bg-white dark:bg-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value="3h">Every 3 hours</option>
              <option value="6h">Every 6 hours</option>
              <option value="12h">Every 12 hours</option>
              <option value="24h">Once daily</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

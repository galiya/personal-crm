"use client";

import { TagTaxonomyPanel } from "@/components/tag-taxonomy-panel";

export function TagsTab() {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-5">
      <TagTaxonomyPanel />
    </div>
  );
}

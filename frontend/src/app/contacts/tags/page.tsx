"use client";

import { TagTaxonomyPanel } from "@/components/tag-taxonomy-panel";

export default function TagsPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <TagTaxonomyPanel />
      </div>
    </div>
  );
}

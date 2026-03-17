"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCreateContact } from "@/hooks/use-contacts";

export default function NewContactPage() {
  const router = useRouter();
  const createContact = useCreateContact();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const result = await createContact.mutateAsync({
        full_name: fullName || undefined,
        emails: email ? [email] : [],
        phones: phone ? [phone] : [],
        company: company || undefined,
        title: title || undefined,
        twitter_handle: twitterHandle || undefined,
        telegram_username: telegramUsername || undefined,
        tags: tags
          ? tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        notes: notes || undefined,
      });
      router.push(`/contacts/${result?.data?.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create contact.";
      setError(message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/contacts"
            className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-stone-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-stone-300" />
          </Link>
          <span className="text-sm text-gray-500 dark:text-stone-400">
            <Link href="/contacts" className="hover:underline">
              Contacts
            </Link>{" "}
            / New contact
          </span>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-xl border border-gray-200 dark:border-stone-700 p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 dark:text-stone-100 mb-6">Add contact</h1>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1"
              >
                Full name <span className="text-red-500">*</span>
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-stone-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-stone-800 text-gray-900 dark:text-stone-100 placeholder:text-gray-400 dark:placeholder:text-stone-500"
                placeholder="Jane Smith"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-stone-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-stone-800 text-gray-900 dark:text-stone-100 placeholder:text-gray-400 dark:placeholder:text-stone-500"
                  placeholder="jane@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1"
                >
                  Phone
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-stone-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-stone-800 text-gray-900 dark:text-stone-100 placeholder:text-gray-400 dark:placeholder:text-stone-500"
                  placeholder="+1 555 000 0000"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="company"
                  className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1"
                >
                  Company
                </label>
                <input
                  id="company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-stone-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-stone-800 text-gray-900 dark:text-stone-100 placeholder:text-gray-400 dark:placeholder:text-stone-500"
                  placeholder="Acme Corp"
                />
              </div>

              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1"
                >
                  Title
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-stone-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-stone-800 text-gray-900 dark:text-stone-100 placeholder:text-gray-400 dark:placeholder:text-stone-500"
                  placeholder="Software Engineer"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="twitterHandle"
                  className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1"
                >
                  Twitter handle
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-stone-500 text-sm">
                    @
                  </span>
                  <input
                    id="twitterHandle"
                    type="text"
                    value={twitterHandle}
                    onChange={(e) => setTwitterHandle(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-300 dark:border-stone-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-stone-800 text-gray-900 dark:text-stone-100 placeholder:text-gray-400 dark:placeholder:text-stone-500"
                    placeholder="janesmith"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="telegramUsername"
                  className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1"
                >
                  Telegram username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-stone-500 text-sm">
                    @
                  </span>
                  <input
                    id="telegramUsername"
                    type="text"
                    value={telegramUsername}
                    onChange={(e) => setTelegramUsername(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-300 dark:border-stone-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-stone-800 text-gray-900 dark:text-stone-100 placeholder:text-gray-400 dark:placeholder:text-stone-500"
                    placeholder="janesmith"
                  />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="tags"
                className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1"
              >
                Tags
              </label>
              <input
                id="tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-stone-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-stone-800 text-gray-900 dark:text-stone-100 placeholder:text-gray-400 dark:placeholder:text-stone-500"
                placeholder="investor, advisor, customer (comma-separated)"
              />
            </div>

            <div>
              <label
                htmlFor="notes"
                className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1"
              >
                Notes
              </label>
              <textarea
                id="notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-stone-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white dark:bg-stone-800 text-gray-900 dark:text-stone-100 placeholder:text-gray-400 dark:placeholder:text-stone-500"
                placeholder="Any additional information about this contact..."
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href="/contacts"
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-stone-700 text-sm text-gray-600 dark:text-stone-300 hover:bg-gray-50 dark:hover:bg-stone-800 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={createContact.isPending}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createContact.isPending ? "Creating..." : "Create contact"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

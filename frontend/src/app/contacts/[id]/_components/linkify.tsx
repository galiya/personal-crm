import { cn } from "@/lib/utils";
import { URL_RE, URL_TEST, decodeHtmlEntities } from "../_lib/formatters";

export function Linkify({ text, className }: { text: string; className?: string }) {
  const decoded = decodeHtmlEntities(text);
  const parts = decoded.split(URL_RE);
  return (
    <span>
      {parts.map((part, i) =>
        URL_TEST.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("underline break-all", className)}
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </span>
  );
}

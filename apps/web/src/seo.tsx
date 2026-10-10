import { useEffect } from "react";

export function PageMeta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    const clippedTitle = title.length > 60 ? `${title.slice(0, 57)}…` : title;
    document.title = clippedTitle;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    const clipped =
      description.length > 160 ? `${description.slice(0, 157)}…` : description;
    meta.setAttribute("content", clipped);
  }, [title, description]);
  return null;
}

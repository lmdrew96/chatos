"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

interface TenorGif {
  id: string;
  description: string;
  gif: string;
  tinygif: string;
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [tab, setTab] = useState<"search" | "favorites">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const favorites = useQuery(api.gifs.listFavorites);
  const saveFavorite = useMutation(api.gifs.saveFavorite);
  const removeFavorite = useMutation(api.gifs.removeFavorite);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load trending on mount
  useEffect(() => {
    fetchGifs("");
  }, []);

  const fetchGifs = async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (q) params.set("q", q);
      const res = await fetch(`/api/tenor?${params}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGifs(value), 300);
  };

  const isFavorited = (id: string) =>
    favorites?.some((f) => f.tenorId === id) ?? false;

  const toggleFavorite = async (gif: TenorGif, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFavorited(gif.id)) {
      await removeFavorite({ tenorId: gif.id });
    } else {
      await saveFavorite({
        tenorId: gif.id,
        url: gif.gif,
        previewUrl: gif.tinygif,
        description: gif.description,
      });
    }
  };

  return (
    <div
      ref={pickerRef}
      className="flex flex-col overflow-hidden rounded-xl"
      style={{
        width: "340px",
        maxHeight: "420px",
        background: "var(--popover)",
        border: "1px solid rgba(139,189,185,0.2)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.25)",
      }}
    >
      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
        {(["search", "favorites"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 text-xs font-medium capitalize transition-colors"
            style={{
              color: tab === t ? "var(--amber)" : "var(--text-muted)",
              borderBottom: tab === t ? "2px solid var(--amber)" : "2px solid transparent",
            }}
          >
            {t === "favorites" ? "Favorites" : "Search"}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <>
          {/* Search input */}
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search GIFs..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>

          {/* Results grid */}
          <div
            className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 auto-rows-min"
            style={{ minHeight: "200px" }}
          >
            {loading && results.length === 0 && (
              <div className="col-span-2 flex items-center justify-center py-8">
                <div
                  className="w-5 h-5 border-2 rounded-full animate-spin"
                  style={{ borderColor: "var(--border)", borderTopColor: "var(--amber)" }}
                />
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="col-span-2 text-center py-8 text-xs" style={{ color: "var(--text-muted)" }}>
                {query ? "No GIFs found" : "Trending GIFs will appear here"}
              </div>
            )}
            {results.map((gif) => (
              <div
                key={gif.id}
                className="relative group cursor-pointer rounded-lg overflow-hidden"
                style={{ aspectRatio: "1" }}
                onClick={() => onSelect(gif.gif)}
              >
                <img
                  src={gif.tinygif}
                  alt={gif.description}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                <button
                  onClick={(e) => toggleFavorite(gif, e)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    color: isFavorited(gif.id) ? "var(--amber)" : "white",
                  }}
                  title={isFavorited(gif.id) ? "Remove from favorites" : "Save to favorites"}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill={isFavorited(gif.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "favorites" && (
        <div
          className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 auto-rows-min"
          style={{ minHeight: "200px" }}
        >
          {(!favorites || favorites.length === 0) && (
            <div className="col-span-2 text-center py-8 text-xs" style={{ color: "var(--text-muted)" }}>
              No saved GIFs yet. Search and heart some!
            </div>
          )}
          {favorites?.map((fav) => (
            <div
              key={fav._id}
              className="relative group cursor-pointer rounded-lg overflow-hidden"
              style={{ aspectRatio: "1" }}
              onClick={() => onSelect(fav.url)}
            >
              <img
                src={fav.previewUrl}
                alt={fav.description ?? ""}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFavorite({ tenorId: fav.tenorId });
                }}
                className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.5)", color: "var(--amber)" }}
                title="Remove from favorites"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tenor attribution */}
      <div
        className="px-3 py-1.5 text-center text-[9px] border-t"
        style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
      >
        Powered by Tenor
      </div>
    </div>
  );
}

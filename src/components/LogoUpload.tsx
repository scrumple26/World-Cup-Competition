"use client";

import { useRef, useState } from "react";

interface Props {
  /** Currently saved logo URL (from Firestore). */
  currentUrl?: string;
  /** Called with the selected File. Parent is responsible for uploading. */
  onFilePicked: (file: File) => void;
  /** Size of the circle in px (default 64). */
  size?: number;
  /** Whether to show the helper text beside the circle (default true). */
  showLabel?: boolean;
  /** Uploading spinner state controlled by parent. */
  uploading?: boolean;
}

export function LogoUpload({
  currentUrl,
  onFilePicked,
  size = 64,
  showLabel = true,
  uploading = false,
}: Props) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    onFilePicked(file);
    // Reset so picking the same file again still fires onChange
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="relative flex-shrink-0 overflow-hidden rounded-full border-2 border-dashed border-[var(--border)] transition hover:border-[var(--accent)] disabled:opacity-60"
        style={{ width: size, height: size }}
        title="Upload team logo"
      >
        {uploading ? (
          <span className="flex h-full w-full items-center justify-center text-xs text-[var(--muted)]">
            ⏳
          </span>
        ) : preview ? (
          <img
            src={preview}
            alt="Team logo"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg text-[var(--muted)]">
            +
          </span>
        )}
      </button>

      {showLabel && (
        <span className="text-xs text-[var(--muted)]">
          {uploading
            ? "Uploading…"
            : preview
              ? "Click to change logo"
              : "Add team logo"}{" "}
          <span className="opacity-60">(optional, max 2 MB)</span>
        </span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePick}
      />
    </div>
  );
}

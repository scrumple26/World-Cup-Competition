"use client";

import { useRef, useState } from "react";

interface Props {
  currentUrl?: string;
  /** Called with a compressed base64 data URL after the user picks a file. */
  onDataUrl: (dataUrl: string) => void;
  size?: number;
  showLabel?: boolean;
  uploading?: boolean;
}

/** Compress + center-crop an image to maxPx × maxPx JPEG and return a data URL. */
async function compressToDataUrl(file: File, maxPx = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const canvas = document.createElement("canvas");
      canvas.width = maxPx;
      canvas.height = maxPx;
      const ctx = canvas.getContext("2d")!;
      // Center-crop to square then scale to maxPx
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, maxPx, maxPx);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = blobUrl;
  });
}

export function LogoUpload({
  currentUrl,
  onDataUrl,
  size = 64,
  showLabel = true,
  uploading = false,
}: Props) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [compressing, setCompressing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setCompressing(true);
    try {
      const dataUrl = await compressToDataUrl(file);
      setPreview(dataUrl);
      onDataUrl(dataUrl);
    } finally {
      setCompressing(false);
    }
  }

  const busy = uploading || compressing;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="relative flex-shrink-0 overflow-hidden rounded-full border-2 border-dashed border-[var(--border)] transition hover:border-[var(--accent)] disabled:opacity-60"
        style={{ width: size, height: size }}
        title="Upload team logo"
      >
        {busy ? (
          <span className="flex h-full w-full items-center justify-center text-xs text-[var(--muted)]">⏳</span>
        ) : preview ? (
          <img src={preview} alt="Team logo" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg text-[var(--muted)]">+</span>
        )}
      </button>

      {showLabel && (
        <span className="text-xs text-[var(--muted)]">
          {busy ? "Processing…" : preview ? "Click to change logo" : "Add team logo"}{" "}
          <span className="opacity-60">(optional)</span>
        </span>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handlePick} />
    </div>
  );
}

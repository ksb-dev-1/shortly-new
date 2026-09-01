"use client";

import { useEffect, useRef } from "react";

import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const ONE_MB = 1024 * 1024;

/*
 * Mirrors the server so a photo it would refuse is refused here first: the
 * multer fileFilter in profile.routes.ts allows exactly these three types, and
 * MAX_AVATAR_BYTES in config/uploads.ts is the same 5MB cap. Without this a
 * 12MB photo is uploaded in full only to be rejected on arrival.
 */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AVATAR_BYTES = 5 * ONE_MB;

/** Derived, never written by hand — changing the limit rewrites the hint. */
const MAX_AVATAR_LABEL = `${MAX_AVATAR_BYTES / ONE_MB}MB`;

/**
 * A photo chosen but not yet saved, paired with the blob URL previewing it.
 *
 * The two travel together because they must never disagree about which photo
 * is on screen, and because `URL.createObjectURL` is a side effect: it cannot
 * run during render, so the handler that accepts the file is the one place
 * both can be produced at once.
 */
export type PendingImage = { file: File; url: string };

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

type AvatarPickerProps = {
  /** The avatar already saved, shown whenever nothing new is pending. */
  currentUrl: string | null;
  /** Drives the initials fallback and the image's alt text. */
  name: string;
  pending: PendingImage | null;
  /** Called with a new selection, or with null when one is cancelled. */
  onChange: (pending: PendingImage | null) => void;
  disabled?: boolean;
};

/**
 * Pick a photo, see it before committing to it, and back out again.
 *
 * The selection is owned by the caller rather than held here, because the
 * caller is what uploads `pending.file` and what clears it once saved. This
 * component owns everything around that: the file dialog, the rules a photo
 * has to pass, the preview, and releasing the preview afterwards.
 */
export function AvatarPicker({
  currentUrl,
  name,
  pending,
  onChange,
  disabled = false,
}: AvatarPickerProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  /*
   * A blob URL is held by the browser until it is revoked, so this effect
   * exists purely for its cleanup: React runs it when the preview is replaced
   * and again when this unmounts, releasing whichever URL was current. Without
   * it every photo picked leaks for the life of the tab.
   */
  useEffect(() => {
    if (!pending) return;

    return () => URL.revokeObjectURL(pending.url);
  }, [pending]);

  function select(file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Photo must be a JPEG, PNG or WebP file");
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(`Photo must be ${MAX_AVATAR_LABEL} or smaller`);
      return;
    }

    onChange({ file, url: URL.createObjectURL(file) });
  }

  return (
    <div className="flex items-center gap-5">
      <Avatar className="size-20">
        {/* The preview wins while one is pending, so the photo you are looking
            at is the one you are deciding whether to keep. */}
        <AvatarImage src={pending?.url ?? currentUrl ?? undefined} alt={name} />
        <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
      </Avatar>

      <div className="flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
          >
            {pending ? "Choose a different photo" : "Change photo"}
          </Button>

          {/* Only worth offering once there is something to back out of.
              Cancelling restores the saved avatar; it cannot remove that one,
              because the API's COALESCE has no way to write an empty
              avatar_url. */}
          {pending && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              Cancel
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {pending
            ? `${pending.file.name} — not saved yet.`
            : `JPEG, PNG or WebP, up to ${MAX_AVATAR_LABEL}.`}
        </p>
      </div>

      {/* Hidden because the native control cannot be styled to sit with the
          rest of the form; the button above drives it instead. */}
      <input
        ref={fileInput}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          // Clearing the value is what lets the same file be picked twice in a
          // row: without it the second pick fires no change event at all, so
          // re-choosing a photo you had just cancelled would do nothing.
          event.target.value = "";

          if (file) {
            select(file);
          }
        }}
      />
    </div>
  );
}

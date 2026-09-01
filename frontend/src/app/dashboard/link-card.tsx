"use client";

import { useEffect, useState } from "react";

import {
  ChartColumn,
  Check,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortUrl } from "@/lib/api";

import { AnalyticsDialog } from "./analytics-dialog";
import { DeleteLinkDialog } from "./delete-link-dialog";
import { EditLinkDialog } from "./edit-link-dialog";
import type { ShortLink } from "./types";

const COPIED_MS = 1600;

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function LinkCard({
  link,
  onDeleted,
}: {
  link: ShortLink;
  onDeleted: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

  const url = shortUrl(link.code);

  // clears the confirmation without leaving a timer behind if the card
  // unmounts first — paging away mid-copy would otherwise set state on a
  // component that is gone
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // clipboard access is refused outside a secure context, and on a plain
      // http:// origin that is every browser. Say so rather than doing nothing.
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <>
      <Card>
        {/* Column layout: the text block stacks above the actions, which
            items-end pushes to the right. The text side carries min-w-0 +
            truncate so a long destination URL shortens rather than widening
            the card. */}
        <CardContent className="flex flex-col gap-4 py-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="truncate font-mono text-sm font-medium text-brand hover:underline"
              >
                {url.replace(/^https?:\/\//, "")}
              </a>
              <ExternalLink
                aria-hidden
                className="size-3 shrink-0 text-muted-foreground"
              />
            </div>

            <p className="mt-1 truncate text-sm text-muted-foreground">
              {link.original_url}
            </p>

            <p className="mt-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              {dateFormat.format(new Date(link.created_at))}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCopy}
              aria-label={`Copy ${url}`}
            >
              {copied ? <Check className="text-brand" /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`More actions for ${url}`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setIsAnalyticsOpen(true)}>
                  <ChartColumn />
                  Analytics
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsEditOpen(true)}>
                  <Pencil />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setIsDeleteOpen(true)}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <AnalyticsDialog
        link={link}
        open={isAnalyticsOpen}
        onOpenChange={setIsAnalyticsOpen}
      />

      <EditLinkDialog
        link={link}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />

      <DeleteLinkDialog
        link={link}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onDeleted={onDeleted}
      />
    </>
  );
}

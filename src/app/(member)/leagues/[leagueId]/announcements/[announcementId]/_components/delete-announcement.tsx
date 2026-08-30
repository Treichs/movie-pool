"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { deleteAnnouncement } from "../actions";

/**
 * DELETING A POST — the only write on this screen.
 *
 * ── `useTransition` PLUS A DIRECT CALL IS REACT'S DOCUMENTED PATTERN ────
 * This is not a form, so there is no `useActionState`: an action invoked
 * outside one is called directly inside `startTransition`, which is what keeps
 * `pending` honest and the navigation inside the same transition.
 *
 * ── AN `AlertDialog`, BECAUSE THIS ONE IS ACTUALLY IRREVERSIBLE ─────────
 * `delete_league_announcement` does a hard `DELETE`; there is no soft-delete
 * column and no undo. That is the whole test for whether a confirm earns its
 * interruption, and this passes it. The confirm names the post, because "are
 * you sure?" about an unnamed thing is a question nobody can answer.
 *
 * ── THE ACTION DOES NOT REDIRECT; THIS DOES ────────────────────────────
 * A `redirect()` thrown inside the action would be swallowed by the caller and
 * would take the failure message with it. The action returns a result, this
 * reports it, and only a success navigates.
 */
export function DeleteAnnouncement({
  leagueId,
  announcementId,
  title,
}: {
  leagueId: string;
  announcementId: string;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline" size="sm" disabled={pending} />}
      >
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes it for the whole league and cannot be undone. Nothing
            else changes — no season, week or standing refers to an
            announcement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteAnnouncement(
                  leagueId,
                  announcementId
                );
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(result.notice ?? "Announcement deleted.");
                router.push(`/leagues/${leagueId}/announcements`);
              })
            }
          >
            {pending ? "Deleting…" : "Delete it"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

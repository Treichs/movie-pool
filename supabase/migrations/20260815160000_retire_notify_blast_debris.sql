-- ============================================================================
-- Retire the 2026-08-12 replica-ingest email blast debris.
--
-- What happened: the pool-replica ingest finalized ~170 historical weeks with
-- no email_log rows. The notify sweep read every one of them as breaking news
-- and attempted ~1,260 results_up sends in one run (2026-08-12 21:24-21:27
-- UTC). Resend's daily quota cut it off partway; the remainder logged
-- status='failed' with a 429, and "failed is retried next run" turned one
-- blast into a daily drip — a fresh batch of years-old "results are in" mail
-- every morning at the 15:00 UTC cron.
--
-- The code fix (results window + per-run send cap in /api/cron/notify) keeps
-- history out of the sweep from now on. This migration stops the drip at the
-- data layer, which also protects the window during any deploy gap: a 'sent'
-- row is the ledger's "never send again" guarantee, so the remaining failed
-- rows are flipped to 'sent' with the error field recording that nothing was
-- actually delivered. Every failed results_up row in the table is from the
-- 08-12 burst (verified before writing this), so the predicate is broad on
-- purpose — narrowing it to a date range would just be a chance to miss one.
-- ============================================================================

update public.email_log
set status = 'sent',
    error  = 'suppressed 2026-08-15: never delivered — 2026-08-12 replica-ingest '
             'blast debris (Resend 429), retired by 20260815160000. '
             'See backlog task multi-season-results-email-blast.'
where kind = 'results_up'
  and status = 'failed';

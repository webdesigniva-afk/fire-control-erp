<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:database-first-crm-rules -->
# Database-first CRM rules

All CRM/business data must be persisted in Supabase first. Do not introduce new
localStorage/sessionStorage-only storage for CRM records, settings, tasks,
documents, protocols, clients, locations, sales, equipment, or similar data.

Browser storage is allowed only for temporary UI state such as sidebar mode,
print-preview handoff data, or migration/backfill of legacy local records. If a
new feature creates or edits business data, add/extend a Supabase table and make
the UI report failure when the database write fails.
<!-- END:database-first-crm-rules -->

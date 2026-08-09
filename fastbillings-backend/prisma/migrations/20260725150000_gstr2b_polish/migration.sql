-- Phase 13: GSTR-2B polish (doc type, ITC flag, debit-note link)

ALTER TABLE "Gstr2bLine" ADD COLUMN IF NOT EXISTS "docType" TEXT NOT NULL DEFAULT 'B2B';
ALTER TABLE "Gstr2bLine" ADD COLUMN IF NOT EXISTS "itcEligible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Gstr2bLine" ADD COLUMN IF NOT EXISTS "matchedDebitNoteId" TEXT;

CREATE INDEX IF NOT EXISTS "Gstr2bLine_docType_idx" ON "Gstr2bLine"("docType");

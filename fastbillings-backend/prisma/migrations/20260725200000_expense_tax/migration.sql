-- Phase 32: Expense GST capture (tax portion of amount + line tax JSON for INPUT_* split)

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "taxes" JSONB;

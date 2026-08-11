-- BUG-BY: 13th-month computation becomes configurable rather than hardcoded.
--
-- Whether de minimis benefits count towards the "basic salary" the 13th-month
-- divisor works on. Defaults to false, which is both the DOLE default (de
-- minimis is excluded from basic salary unless the employer has integrated it)
-- and the behaviour every organization had before this setting existed, so no
-- org's December figure moves until an admin changes it deliberately.
ALTER TABLE "payroll_settings"
  ADD COLUMN "thirteenth_month_includes_de_minimis" BOOLEAN NOT NULL DEFAULT false;

-- Safe patch for removing equipment status.
-- Run this if the equipment table already exists.

ALTER TABLE equipment DROP COLUMN IF EXISTS status;

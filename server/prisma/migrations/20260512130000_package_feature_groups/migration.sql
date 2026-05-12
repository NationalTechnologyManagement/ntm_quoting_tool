-- Structured feature catalog for packages. Used by the UI ("Show more"
-- expansion on package cards) and the contract PDF (full per-category
-- listing in Part 1 — Quote). The legacy `features` flat array is left in
-- place so quotes snapshotted before this column existed still render.
ALTER TABLE "packages"
  ADD COLUMN "featureGroups" JSONB NOT NULL DEFAULT '[]';

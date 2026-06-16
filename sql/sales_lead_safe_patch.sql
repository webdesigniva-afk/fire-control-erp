-- Safe patch for the lighter sales lead creation flow.
-- Run this if sales_module.sql was copied before object/service categories were added.

ALTER TABLE IF EXISTS sales_opportunities
  ADD COLUMN IF NOT EXISTS object_type TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS sales_opportunity_services
  ADD COLUMN IF NOT EXISTS service_category TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sales_opps_company_phone
  ON sales_opportunities (company_name, phone);

UPDATE locations AS location
SET object_type = opportunity.object_type
FROM sales_opportunities AS opportunity
WHERE opportunity.converted_object_id = location.id
  AND COALESCE(location.object_type, '') = ''
  AND COALESCE(opportunity.object_type, '') <> '';

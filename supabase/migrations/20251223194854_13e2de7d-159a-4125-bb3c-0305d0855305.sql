-- Drop the existing constraint and add a more flexible one
ALTER TABLE public.platform_schemas 
DROP CONSTRAINT platform_schemas_schema_type_check;

ALTER TABLE public.platform_schemas 
ADD CONSTRAINT platform_schemas_schema_type_check 
CHECK (schema_type IN ('event', 'attribute', 'consent', 'metric', 'list', 'template', 'profile', 'segment', 'flow', 'campaign'));
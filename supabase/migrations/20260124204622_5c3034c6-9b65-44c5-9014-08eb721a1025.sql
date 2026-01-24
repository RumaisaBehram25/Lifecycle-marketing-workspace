-- Add unique constraint to enable proper upsert behavior
ALTER TABLE public.data_visibility 
ADD CONSTRAINT data_visibility_unique_item 
UNIQUE (client_id, item_type, item_id);
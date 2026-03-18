-- RPC to return column names for a public table (for dynamic CSV insert).
CREATE OR REPLACE FUNCTION public.get_table_columns(tablename text)
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT column_name::text
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = tablename
  ORDER BY ordinal_position;
$$;

COMMENT ON FUNCTION public.get_table_columns(text) IS 'Returns column names for a public table; used by upload analytics CSV to map columns dynamically.';

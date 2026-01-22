-- Add unique index on source_url for knowledge_documents to support upsert
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_source_url_key 
ON public.knowledge_documents (source_url);
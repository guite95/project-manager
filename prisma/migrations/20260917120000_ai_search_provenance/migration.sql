-- Add only bounded, non-secret source descriptors; raw bodies remain unchanged.
ALTER TABLE ai_ops_message ADD COLUMN source_metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE ai_ops_message ADD CONSTRAINT ai_ops_message_source_metadata_object
 CHECK (jsonb_typeof(source_metadata)='object' AND octet_length(source_metadata::text)<=2048);
CREATE OR REPLACE FUNCTION ai_ops_bump_message_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.body,NEW.role,NEW.model,NEW.occurred_at,NEW.session_id,NEW.source_metadata) IS NOT DISTINCT FROM
     ROW(OLD.body,OLD.role,OLD.model,OLD.occurred_at,OLD.session_id,OLD.source_metadata) THEN RETURN NEW; END IF;
 END IF;
 IF TG_OP IN ('UPDATE','DELETE') THEN
  UPDATE ai_ops_session SET search_revision=search_revision+1 WHERE id=OLD.session_id;
 END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.session_id<>OLD.session_id) THEN
  UPDATE ai_ops_session SET search_revision=search_revision+1 WHERE id=NEW.session_id;
 END IF;
 RETURN NULL;
END $$;

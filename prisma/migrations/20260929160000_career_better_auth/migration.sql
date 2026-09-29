-- Isolated Better Auth provider state; existing account credentials remain authoritative.
ALTER TABLE "access_user" ADD COLUMN "oauth_epoch" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "career_oauth_user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "career_oauth_user_email_key" ON "career_oauth_user"("email");
CREATE TABLE "career_oauth_session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "token" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT NOT NULL,
  "owner_epoch" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "career_oauth_session_token_key" ON "career_oauth_session"("token");
CREATE INDEX "career_oauth_session_user_id_idx" ON "career_oauth_session"("user_id");
CREATE TABLE "career_oauth_account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TIMESTAMP(3),
  "refresh_token_expires_at" TIMESTAMP(3),
  "scope" TEXT,
  "password" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "career_oauth_account_user_id_idx" ON "career_oauth_account"("user_id");
CREATE TABLE "career_oauth_verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "career_oauth_verification_identifier_idx" ON "career_oauth_verification"("identifier");
CREATE TABLE "career_oauth_jwks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "public_key" TEXT NOT NULL,
  "private_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3),
  "alg" TEXT,
  "crv" TEXT
);
CREATE TABLE "career_oauth_client" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "client_id" TEXT NOT NULL,
  "client_secret" TEXT,
  "client_discovery_id" TEXT,
  "disabled" BOOLEAN DEFAULT false,
  "skip_consent" BOOLEAN,
  "enable_end_session" BOOLEAN,
  "subject_type" TEXT,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "client_credentials_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "user_id" TEXT,
  "created_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3),
  "name" TEXT,
  "uri" TEXT,
  "icon" TEXT,
  "contacts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tos" TEXT,
  "policy" TEXT,
  "software_id" TEXT,
  "software_version" TEXT,
  "software_statement" TEXT,
  "redirect_uris" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "post_logout_redirect_uris" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "backchannel_logout_uri" TEXT,
  "backchannel_logout_session_required" BOOLEAN,
  "token_endpoint_auth_method" TEXT,
  "application_type" TEXT,
  "jwks" TEXT,
  "jwks_uri" TEXT,
  "grant_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "response_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "require_p_k_c_e" BOOLEAN,
  "dpop_bound_access_tokens" BOOLEAN DEFAULT false,
  "reference_id" TEXT,
  "metadata" JSONB
);
CREATE UNIQUE INDEX "career_oauth_client_client_id_key" ON "career_oauth_client"("client_id");
CREATE INDEX "career_oauth_client_user_id_idx" ON "career_oauth_client"("user_id");
CREATE TABLE "career_oauth_resource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "access_token_ttl" INTEGER,
  "refresh_token_ttl" INTEGER,
  "signing_algorithm" TEXT,
  "signing_key_id" TEXT,
  "allowed_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "custom_claims" JSONB,
  "dpop_bound_access_tokens_required" BOOLEAN DEFAULT false,
  "disabled" BOOLEAN DEFAULT false,
  "created_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3),
  "policy_version" INTEGER DEFAULT 1,
  "metadata" JSONB
);
CREATE UNIQUE INDEX "career_oauth_resource_identifier_key" ON "career_oauth_resource"("identifier");
CREATE TABLE "career_oauth_client_resource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "client_id" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3)
);
CREATE INDEX "career_oauth_client_resource_client_id_idx" ON "career_oauth_client_resource"("client_id");
CREATE INDEX "career_oauth_client_resource_resource_id_idx" ON "career_oauth_client_resource"("resource_id");
CREATE UNIQUE INDEX "career_oauth_client_resource_client_id_resource_id_key" ON "career_oauth_client_resource"("client_id","resource_id");
CREATE TABLE "career_oauth_refresh_token" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "session_id" TEXT,
  "user_id" TEXT NOT NULL,
  "reference_id" TEXT,
  "authorization_code_id" TEXT,
  "resources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requested_user_info_claims" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "revoked" TIMESTAMP(3),
  "rotated_at" TIMESTAMP(3),
  "rotation_replay_response" TEXT,
  "rotation_replay_expires_at" TIMESTAMP(3),
  "auth_time" TIMESTAMP(3),
  "confirmation" JSONB,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);
CREATE UNIQUE INDEX "career_oauth_refresh_token_token_key" ON "career_oauth_refresh_token"("token");
CREATE INDEX "career_oauth_refresh_token_client_id_idx" ON "career_oauth_refresh_token"("client_id");
CREATE INDEX "career_oauth_refresh_token_session_id_idx" ON "career_oauth_refresh_token"("session_id");
CREATE INDEX "career_oauth_refresh_token_user_id_idx" ON "career_oauth_refresh_token"("user_id");
CREATE INDEX "career_oauth_refresh_token_authorization_code_id_idx" ON "career_oauth_refresh_token"("authorization_code_id");
CREATE TABLE "career_oauth_access_token" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "session_id" TEXT,
  "user_id" TEXT,
  "reference_id" TEXT,
  "authorization_code_id" TEXT,
  "resources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requested_user_info_claims" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "refresh_id" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "revoked" TIMESTAMP(3),
  "confirmation" JSONB,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);
CREATE UNIQUE INDEX "career_oauth_access_token_token_key" ON "career_oauth_access_token"("token");
CREATE INDEX "career_oauth_access_token_client_id_idx" ON "career_oauth_access_token"("client_id");
CREATE INDEX "career_oauth_access_token_session_id_idx" ON "career_oauth_access_token"("session_id");
CREATE INDEX "career_oauth_access_token_user_id_idx" ON "career_oauth_access_token"("user_id");
CREATE INDEX "career_oauth_access_token_authorization_code_id_idx" ON "career_oauth_access_token"("authorization_code_id");
CREATE INDEX "career_oauth_access_token_refresh_id_idx" ON "career_oauth_access_token"("refresh_id");
CREATE TABLE "career_oauth_consent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "client_id" TEXT NOT NULL,
  "user_id" TEXT,
  "reference_id" TEXT,
  "resources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requested_user_info_claims" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "career_oauth_consent_client_id_idx" ON "career_oauth_consent"("client_id");
CREATE INDEX "career_oauth_consent_user_id_idx" ON "career_oauth_consent"("user_id");
CREATE TABLE "career_oauth_client_assertion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expires_at" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "career_oauth_session" ADD CONSTRAINT "career_oauth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "career_oauth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_account" ADD CONSTRAINT "career_oauth_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "career_oauth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_client" ADD CONSTRAINT "career_oauth_client_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "career_oauth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_client_resource" ADD CONSTRAINT "career_oauth_client_resource_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "career_oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_client_resource" ADD CONSTRAINT "career_oauth_client_resource_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "career_oauth_resource"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_refresh_token" ADD CONSTRAINT "career_oauth_refresh_token_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "career_oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_refresh_token" ADD CONSTRAINT "career_oauth_refresh_token_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "career_oauth_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "career_oauth_refresh_token" ADD CONSTRAINT "career_oauth_refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "career_oauth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_access_token" ADD CONSTRAINT "career_oauth_access_token_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "career_oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_access_token" ADD CONSTRAINT "career_oauth_access_token_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "career_oauth_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "career_oauth_access_token" ADD CONSTRAINT "career_oauth_access_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "career_oauth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_access_token" ADD CONSTRAINT "career_oauth_access_token_refresh_id_fkey" FOREIGN KEY ("refresh_id") REFERENCES "career_oauth_refresh_token"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_consent" ADD CONSTRAINT "career_oauth_consent_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "career_oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_consent" ADD CONSTRAINT "career_oauth_consent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "career_oauth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_oauth_user" ADD CONSTRAINT "career_oauth_user_owner_fkey" FOREIGN KEY ("id") REFERENCES "access_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "career_oauth_request" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "query" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "consent_hash" TEXT,
  "owner_epoch" INTEGER,
  "expires_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "career_oauth_request_expires_at_idx" ON "career_oauth_request"("expires_at");
-- Database enforcement also covers existing password/admin mutation paths.
CREATE FUNCTION bump_career_oauth_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active THEN
    NEW.oauth_epoch := OLD.oauth_epoch + 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER access_user_oauth_epoch BEFORE UPDATE ON access_user FOR EACH ROW EXECUTE FUNCTION bump_career_oauth_epoch();

-- CreateTable
CREATE TABLE "access_user" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_session" (
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_session_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "access_membership" (
    "user_id" TEXT NOT NULL,
    "project_slug" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "access_membership_pkey" PRIMARY KEY ("user_id","project_slug")
);

-- CreateTable
CREATE TABLE "access_invite" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_share" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "project_slug" TEXT NOT NULL,
    "chart_slug" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_audit" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_throttle" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_throttle_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_user_username_key" ON "access_user"("username");

-- CreateIndex
CREATE INDEX "access_session_user_id_idx" ON "access_session"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_invite_token_hash_key" ON "access_invite"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "access_invite_username_key" ON "access_invite"("username");

-- CreateIndex
CREATE UNIQUE INDEX "access_share_token_hash_key" ON "access_share"("token_hash");

-- AddForeignKey
ALTER TABLE "access_session" ADD CONSTRAINT "access_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "access_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_membership" ADD CONSTRAINT "access_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "access_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_membership" ADD CONSTRAINT "access_membership_project_slug_fkey" FOREIGN KEY ("project_slug") REFERENCES "flow_project"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_share" ADD CONSTRAINT "access_share_project_slug_chart_slug_fkey" FOREIGN KEY ("project_slug", "chart_slug") REFERENCES "flow_document"("project_slug", "slug") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE access_user ADD CONSTRAINT access_user_role_check CHECK (role IN ('OWNER','ADMIN','MEMBER'));
CREATE UNIQUE INDEX access_single_owner ON access_user (role) WHERE role = 'OWNER';
ALTER TABLE access_membership ADD CONSTRAINT access_membership_role_check CHECK (role IN ('VIEWER','EDITOR'));
ALTER TABLE access_invite ADD CONSTRAINT access_invite_role_check CHECK (role IN ('ADMIN','MEMBER'));

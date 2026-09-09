-- CreateTable
CREATE TABLE "custom_project" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_project_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "issue" (
    "id" TEXT NOT NULL,
    "project_slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "placement" TEXT NOT NULL,
    "today_date" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completion" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT,
    "project_slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed_on" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "completion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_note" (
    "id" TEXT NOT NULL,
    "project_slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "issue_placement_position_idx" ON "issue"("placement", "position");

-- CreateIndex
CREATE INDEX "completion_completed_on_idx" ON "completion"("completed_on");

-- CreateIndex
CREATE INDEX "project_note_project_slug_position_idx" ON "project_note"("project_slug", "position");

-- AddForeignKey
ALTER TABLE "completion" ADD CONSTRAINT "completion_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

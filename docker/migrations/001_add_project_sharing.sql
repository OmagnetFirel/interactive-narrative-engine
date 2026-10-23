-- Migration: add visibility and share_token to existing projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'private'));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS share_token UUID NOT NULL DEFAULT uuid_generate_v4();

UPDATE projects SET visibility = 'private' WHERE visibility IS NULL;
UPDATE projects SET share_token = uuid_generate_v4() WHERE share_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_share_token ON projects(share_token);

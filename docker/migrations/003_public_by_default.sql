-- Migration: projetos passam a ser públicos por padrão.
-- O player só abre projetos públicos (pelo link de compartilhamento),
-- então um projeto privado não pode ser assistido por ninguém.
ALTER TABLE projects ALTER COLUMN visibility SET DEFAULT 'public';

-- Opcional: tornar públicos os projetos que já existem.
-- UPDATE projects SET visibility = 'public' WHERE visibility = 'private';

/*
  Reuniones y comunicaciones usan listas administradas desde Excel. Sus tipos
  no deben depender de enums fijos en PostgreSQL.
*/

ALTER TABLE public.reuniones
  ALTER COLUMN tipo DROP DEFAULT,
  ALTER COLUMN tipo TYPE text USING tipo::text,
  ALTER COLUMN tipo SET DEFAULT 'presencial';

ALTER TABLE public.comunicaciones
  ALTER COLUMN tipo TYPE text USING tipo::text;

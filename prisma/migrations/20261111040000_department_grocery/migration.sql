-- New catalogue department. PostgreSQL allows ADD VALUE inside a migration
-- transaction from version 12 onward, as long as this statement does not also
-- insert the new label.
ALTER TYPE "Department" ADD VALUE 'GROCERY';

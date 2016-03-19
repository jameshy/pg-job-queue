-- DROP FUNCTION IF EXISTS public.pending_jobs(integer);
-- DROP TABLE IF EXISTS "JobQueue";
-- DROP TYPE jobState;




CREATE TYPE jobState AS ENUM ('waiting', 'processing', 'failed', 'finished');

CREATE TABLE "JobQueue"
(
    "id" serial NOT NULL,
    "state" jobState NOT NULL DEFAULT 'waiting',
    "type" character varying NOT NULL,
    "data" json,
    "scheduledFor" timestamp with time zone NOT NULL,
    "failedAttempts" integer DEFAULT 0,
    "lastFailureMessage" character varying,
    "maxAttempts" integer DEFAULT 1,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
    "lastRun" timestamp with time zone,
    CONSTRAINT "JobQueue_pkey" PRIMARY KEY (id)
)
WITH (
    OIDS=FALSE
);




CREATE OR replace FUNCTION public.pending_jobs (integer, text[] default '{}') RETURNS SETOF "JobQueue" AS
$$
DECLARE
    r "JobQueue" % rowtype;
BEGIN
    LOCK TABLE "JobQueue" IN EXCLUSIVE MODE;
    FOR r IN
        SELECT * FROM "JobQueue"
        WHERE
            "state" = 'waiting' AND
            ($2 = '{}' OR "type" = ANY($2)) AND
            
            ("scheduledFor" IS NULL OR "scheduledFor" <= NOW())
        ORDER BY "id" ASC
        LIMIT $1
    LOOP
        UPDATE "JobQueue" SET "state"='processing' WHERE "id"=r."id" RETURNING * INTO r;
        RETURN NEXT r;
  END LOOP;
  RETURN;
END
$$ LANGUAGE plpgsql VOLATILE STRICT;
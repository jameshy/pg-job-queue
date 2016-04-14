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

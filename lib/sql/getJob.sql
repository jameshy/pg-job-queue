WITH RECURSIVE jobs AS (
  SELECT (j).*, pg_try_advisory_lock((j).id) AS locked
  FROM (
    SELECT j
    FROM "JobQueue" AS j
    WHERE "state" = 'waiting' AND
          (${types} = '{}' OR "type" = ANY(${types})) AND
          ("scheduledFor" IS NULL OR "scheduledFor" <= NOW())
          ORDER BY "scheduledFor", "id"
          LIMIT 1
  ) AS t1
  UNION ALL (
    SELECT (j).*, pg_try_advisory_lock((j).id) AS locked
    FROM (
      SELECT (
        SELECT j
        FROM "JobQueue" AS j
        WHERE "state" = 'waiting'
          AND (${types} = '{}' OR "type" = ANY(${types}))
          AND ("scheduledFor" IS NULL OR "scheduledFor" <= NOW())
          AND ("scheduledFor", "id") > (jobs."scheduledFor", jobs."id")
          ORDER BY "scheduledFor", "id"
          LIMIT 1
      ) AS j
      FROM jobs
      WHERE jobs.id IS NOT NULL
      LIMIT 1
    ) AS t1
  )
)
SELECT * FROM jobs WHERE locked LIMIT 1;
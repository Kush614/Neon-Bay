/* @bruin
name: report.action_sequences
type: duckdb.sql
description: The five most frequent three-action sequences per agent persona across all sessions (waits left out).
materialization:
  type: table
columns:
  - name: persona
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: sequence
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: occurrences
    type: bigint
    checks:
      - name: positive
@bruin */

WITH a AS (
    SELECT
        session_id,
        persona,
        action_type,
        lead(action_type, 1) OVER w AS a2,
        lead(action_type, 2) OVER w AS a3
    FROM raw.ledger
    WHERE actor_kind = 'agent' AND action_type <> 'wait'
    WINDOW w AS (PARTITION BY session_id, actor_id ORDER BY tick)
)
SELECT
    persona,
    action_type || ' > ' || a2 || ' > ' || a3 AS sequence,
    count(*) AS occurrences,
    count(DISTINCT session_id) AS sessions
FROM a
WHERE a3 IS NOT NULL
GROUP BY persona, sequence
QUALIFY row_number() OVER (PARTITION BY persona ORDER BY count(*) DESC, sequence) <= 5

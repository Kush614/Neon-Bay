/* @bruin
name: report.stuck_points
type: duckdb.sql
description: >
  Stretches of 20 s or more where a player's ledger rows show no position change (1 m grid) in
  one phase, outside lobby, plan, payout and ended. Rows are written per action, so this sees
  the positions at decision times, not every frame.
materialization:
  type: table
columns:
  - name: session_id
    type: varchar
    checks:
      - name: not_null
  - name: actor_id
    type: varchar
    checks:
      - name: not_null
  - name: stuck_seconds
    type: double
    checks:
      - name: min
        value: 20
@bruin */

WITH r AS (
    SELECT session_id, actor_id, actor_name, phase, game_seconds, round(x) AS rx, round(z) AS rz
    FROM raw.ledger
    WHERE actor_id <> 'world'
),
g AS (
    SELECT
        *,
        CASE
            WHEN rx = lag(rx) OVER w AND rz = lag(rz) OVER w AND phase = lag(phase) OVER w THEN 0
            ELSE 1
        END AS moved
    FROM r
    WINDOW w AS (PARTITION BY session_id, actor_id ORDER BY game_seconds)
),
i AS (
    SELECT *, sum(moved) OVER (PARTITION BY session_id, actor_id ORDER BY game_seconds ROWS UNBOUNDED PRECEDING) AS island
    FROM g
)
SELECT
    session_id,
    actor_id,
    any_value(actor_name) AS actor_name,
    any_value(phase) AS phase,
    min(game_seconds) AS from_s,
    max(game_seconds) AS to_s,
    max(game_seconds) - min(game_seconds) AS stuck_seconds,
    any_value(rx) AS x,
    any_value(rz) AS z
FROM i
WHERE phase NOT IN ('lobby', 'plan', 'payout', 'ended')
GROUP BY session_id, actor_id, island
HAVING max(game_seconds) - min(game_seconds) >= 20

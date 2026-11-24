/* @bruin
name: report.phase_times
type: duckdb.sql
description: Time each player spent in each phase, from game ticks (20 Hz), with their action count.
materialization:
  type: table
columns:
  - name: session_id
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: actor_id
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: phase
    type: varchar
    primary_key: true
    checks:
      - name: accepted_values
        value: [lobby, plan, prepare, heist, getaway, payout, ended]
  - name: seconds
    type: double
    checks:
      - name: non_negative
  - name: actions
    type: bigint
    checks:
      - name: positive
@bruin */

SELECT
    session_id,
    actor_id,
    any_value(actor_name) AS actor_name,
    any_value(actor_kind) AS actor_kind,
    phase,
    min(game_seconds) AS started_s,
    max(game_seconds) AS ended_s,
    max(game_seconds) - min(game_seconds) AS seconds,
    count(*) AS actions
FROM raw.ledger
WHERE actor_id <> 'world'
GROUP BY session_id, actor_id, phase

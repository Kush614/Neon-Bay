/* @bruin
name: report.heatmap
type: duckdb.sql
description: Ledger positions binned into 10 m cells of the world layout, per session.
materialization:
  type: table
columns:
  - name: session_id
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: cell_x
    type: double
    primary_key: true
  - name: cell_z
    type: double
    primary_key: true
  - name: samples
    type: bigint
    checks:
      - name: positive
@bruin */

SELECT
    session_id,
    floor(x / 10) * 10 AS cell_x,
    floor(z / 10) * 10 AS cell_z,
    count(*) AS samples,
    count(DISTINCT actor_id) AS players
FROM raw.ledger
WHERE actor_id <> 'world'
GROUP BY session_id, cell_x, cell_z

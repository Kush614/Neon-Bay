/* @bruin
name: report.issues
type: duckdb.sql
description: Issues the playtesters reported, grouped by type and severity, with the ledger ticks that hold each report.
materialization:
  type: table
columns:
  - name: session_id
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: issue_type
    type: varchar
    primary_key: true
    checks:
      - name: accepted_values
        value: [bug, exploit, stuck, confusing, balance]
  - name: issue_severity
    type: varchar
    primary_key: true
    checks:
      - name: accepted_values
        value: [low, medium, high]
  - name: reports
    type: bigint
    checks:
      - name: positive
@bruin */

SELECT
    session_id,
    issue_type,
    issue_severity,
    count(*) AS reports,
    list(DISTINCT actor_name) AS reporters,
    list(issue_description ORDER BY tick) AS descriptions,
    list(tick ORDER BY tick) AS ledger_ticks
FROM raw.ledger
WHERE issue_type IS NOT NULL
GROUP BY session_id, issue_type, issue_severity

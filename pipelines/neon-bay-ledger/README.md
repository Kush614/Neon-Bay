# neon-bay-ledger

Builds the playtest report tables from `raw.ledger`, which the game server fills (one row per
action; `LEDGER_SINK=bruin`). Locally it runs on `data/warehouse.duckdb`; with
`--environment motherduck` (and `MOTHERDUCK_TOKEN`) on MotherDuck; on Bruin Cloud against the
team's `neon-bay-warehouse` connection.

| Table | Spec item |
| --- | --- |
| `report.phase_times` | completion time per player and phase |
| `report.issues` | issues grouped by type and severity, linked to their ledger ticks |
| `report.stuck_points` | players with no position change for 20 s outside `plan` |
| `report.action_sequences` | most frequent action sequences per persona |
| `report.heatmap` | positions binned into 10 m cells |

Not here yet: the economy chart (clean cash and stake prices are not in the ledger rows) and
"top scorers" for the sequences (final scores are not in the ledger either).

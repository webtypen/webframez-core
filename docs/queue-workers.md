# Managed queue workers

`queue:worker --worker=<key>` handles SIGTERM and SIGINT by stopping new claims and automated scheduling, then finishing the current job and persisting its result. A claim that completes after a stop request is returned to pending without executing its handler. Repeated stop signals remain graceful; SIGKILL is the explicit force operation.

The server runtime assigns `WEBFRAMEZ_QUEUE_INSTANCE` for independent status files and `WEBFRAMEZ_QUEUE_STATE_FILE` for readiness/drain telemetry. The worker configuration key still controls routing and job selection. When the managed console finishes its command/application completion hooks, it exits even if a database connection keeps Node sockets open. Run queue:worker directly under the runtime; do not nest queue:start or queue:worker:autorestart.

Automatic schedule occurrences have deterministic primary keys, preventing concurrent managed workers from creating the same occurrence twice. Existing pending jobs still use an atomic claim.

Graceful draining does not make job side effects transactional. A forcibly killed job may remain running in the database and have partially completed external work. Check its effects before manually recovering/retrying it.

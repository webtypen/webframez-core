# Managed queue workers

`queue:worker --worker=<key>` handles SIGTERM and SIGINT by stopping new claims and automated scheduling, then finishing the current job and persisting its result. A claim that completes after a stop request is returned to pending without executing its handler. Repeated stop signals remain graceful; SIGKILL is the explicit force operation.

The server runtime assigns `WEBFRAMEZ_QUEUE_INSTANCE` for independent status files and `WEBFRAMEZ_QUEUE_STATE_FILE` for readiness/drain telemetry. The worker configuration key still controls routing and job selection. When the managed console finishes its command/application completion hooks, it exits even if a database connection keeps Node sockets open. Run queue:worker directly under the runtime; do not nest queue:start or queue:worker:autorestart.

Automatic schedule occurrences have deterministic primary keys, preventing concurrent managed workers from creating the same occurrence twice. Existing pending jobs still use an atomic claim.

Graceful draining does not make job side effects transactional. A forcibly killed job may remain running in the database and have partially completed external work. Check its effects before manually recovering/retrying it.

## Bounded retries

Console workers and the embedded `Queue` use the same policy. Every execution is
counted before the handler runs. The persisted `attempts_made`, `failed_attempts`
and `first_started_at` survive restarts; existing execution histories are used for
legacy jobs. No migration or automatic reactivation of failed jobs is performed.

```ts
export default {
    retry: {
        maxAttempts: 100,          // All handler attempts, including executeAgain()
        maxErrorRetries: 3,        // Additional attempts after errors, across the job lifetime
        maxFinalizationAttempts: 3,
        maxAgeSeconds: 86400,      // Since first execution, not a future not_before date
        retryOn: "retryable",      // "retryable", "all", or "never"
        delaySeconds: 30,
        backoffMultiplier: 2,
        maxDelaySeconds: 300,
    },
    jobs: {
        ExternalStatusPollJob: {
            retry: {
                maxAttempts: 54,
                maxErrorRetries: 53,
                maxAgeSeconds: 7 * 86400,
                stages: [
                    { attempts: 3, delaySeconds: 0 },
                    { attempts: 2, delaySeconds: 10 },
                    { attempts: 5, delaySeconds: 30 },
                    { attempts: 10, delaySeconds: 60 },
                    { attempts: 10, delaySeconds: 300 },
                    { attempts: 10, delaySeconds: 900 },
                    { attempts: 14, delaySeconds: 43200 },
                ],
            },
        },
    },
    workers: { worker_1: { is_active: true } },
};
```

The seven-day staged policy above is an illustrative application override, not a
payment-provider recommendation or Core default. Choose limits for the actual
workflow; bank debit settlement can outlast a generic job's 24-hour default.

The first stage includes the initial execution: three immediate attempts means
one initial execution and two retries. Stages apply to both errors and
`executeAgain()`. They set the minimum delay before the **next** attempt; a longer
explicit delay requested by the handler is preserved. Use `executeAgain(0)` to
follow the configured stages. Without stages, error retries use capped exponential
backoff, and explicit reschedules have a minimum delay of one second. Stages also
cap total attempts at their summed attempt count. All limits must be finite;
zero, negative, fractional or infinite limits are rejected (`maxErrorRetries: 0`
is supported). Repeated automation occurrences are independent jobs.

Only errors with `retryable === true` are retried by default. `retryOn: "all"` opts
into retrying unmarked errors; `retryable === false` always prevents an error retry.
`retryOn: "never"` disables error retries but does not disable bounded
`executeAgain()` polling. Retries do not undo side effects; use "all" only for
handlers that can safely run again. Notifications remain pending until success or
terminal failure.

Precedence, from lowest to highest: built-in defaults, `queue.retry`, the handler's
`static retry`, `queue.jobs[JobClass].retry`, and the optional asynchronous
`retryPolicy(job)` result. The latter can resolve tenant-specific limits and an
absolute `deadlineAt: Date`. `maxAgeSeconds` and `deadlineAt` are both enforced.
The worker wakes at a deadline even if the next configured delay would overshoot
it. Limits are checked again before executing the handler.

On budget/deadline exhaustion, the worker calls `onRetryExhausted(job, error)` if
provided. This is the extension point for domain reconciliation or cleanup. Return
`"finished"` when a final reconciliation resolves the job; otherwise it ends as
`failed`. A failing finalizer is attempted at most `maxFinalizationAttempts` times,
with `delaySeconds` between calls, without rerunning the handler. An error marked
`retryable: false` stops finalization immediately. A finalization error is retained
in `retry_exhaustion_error` for investigation. This is bounded best-effort cleanup,
not an atomic transaction with an external payment provider.

The old instance property `BaseQueueJob.attempts` was not used by workers and is
deprecated. Use the policy fields above. Changing the policy affects the next
claim; already scheduled jobs are not proactively woken when configuration changes.

## Upgrades and recovery of long-running polls

A handler that returns `executeAgain()` has completed an execution successfully,
but the job remains `pending`. These executions consume `maxAttempts`; only failed
executions consume the separate error allowance. A provider's `processing` state
therefore need not represent a failed payment or a failed queue execution.

Before enabling finite limits on existing queues, account for their persisted
history. `attempts_made` is at least the execution history length, and the earliest
recorded execution bounds age. Small new stage totals can reject a legacy job even
when its provider workflow is healthy. An application-specific `deadlineAt` based
on the original domain record prevents recreating a job from extending that window.

For a failed job that is safe to resume:

1. Verify the external operation's current state and identity. Check for active
   sibling jobs and partially completed effects.
2. Deploy the corrected policy to every eligible worker before releasing the job.
3. Check both the attempt budget and age/deadline, including stage totals.
4. Atomically change only the intended still-failed job to `pending` and set its
   next execution date. Core's `QueueJob.findOneAndUpdate(filter, update)` supports
   a conditional single-record update; include identity and expected state in the
   filter. If an exhausted job is intentionally returned to normal handling,
   reset `retry_exhaustion_attempts` to zero and `retry_exhaustion_error` to null;
   otherwise the worker resumes finalization instead of calling the handler.
5. Preserve original timestamps, counters and execution history, record the reason
   for recovery, and verify the first execution and its next scheduled date.

Do not reset histories to bypass limits, automatically resume all failed jobs, or
create another external operation as part of recovery. Finalizers may have domain
side effects, so inspect them before retrying. Error capture and the Server Manager
error group's status are separate from job recovery: see [Error reporting](errors.md).

## Embedded worker pools

`Queue.createWorker(jobClasses, {concurrency: 2, intervalMs: 1000})` starts an
independent bounded pool using the same atomic claims and renewable leases as
`Queue.runOnce`. `await worker.stop({drain: true})` stops new claims and waits for
active handlers; `worker.stop()` aborts that pool's handlers. Pools do not share
abort controllers. Host-wide resource limits remain the application's concern.

Dedicated workers with an explicit `jobclasses` allowlist may set
`includeBackupJobs: false` to prevent the automatic addition of `BackupRunJob`.
This keeps long backups out of a latency-sensitive worker. Existing workers keep
the previous default; explicitly listed backup jobs remain allowed.

### Server-owned execution context

`QueueExecutionContext.run(context, callback)` carries JSON-serializable server-owned
attribution through asynchronous calls. Jobs saved via `QueueJob.save()` or
`Queue.enqueue()` capture it in `execution_context`; console and embedded workers
restore it for handlers and retry-exhaustion callbacks. Child jobs inherit it.
`QueueExecutionContext.capture()` returns a detached snapshot. Do not populate this
field from client payloads or treat it as authorization: reload the referenced
account and current permissions before protected effects. Raw database inserts
must explicitly capture the context when used instead of the queue APIs.

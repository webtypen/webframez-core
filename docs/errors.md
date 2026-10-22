# Error reporting and execution context

`ErrorHandler.onReport(listener)` subscribes independently of the logging handlers and returns an unsubscribe function. `setHandler`, `setHandlers` and `clearHandlers` do not remove observers. Observers must not throw; failures are isolated from application error handling.

`ErrorHandler.withContext(context, callback)` uses AsyncLocalStorage, propagating through promises and timers. A new `operationId` establishes an independent execution and deduplication boundary. Re-reporting the same Error object within that boundary emits once; later requests/jobs still emit independently. Context is explicit and not a replacement for application authorization.

Events include eventId, timestamp, severity, expected, applicationType, scope/source, process instance/PID/start time/Node/Core version, route/method, ApiScope/ApiFunction, command signature and queue job/worker/attempt/outcome. Manager application identity and deployment identity belong to authenticated transport, not this generic context.

The Router catches async middleware rejections and uses generic 500 responses; expected 4xx responses keep their message. ApiFunction exceptions enter the same error channel. Web/Console/Lambda boot boundaries and both queue workers report unexpected errors. Failed ConsoleCommands set a nonzero process exit code. Queue retries remain individual executions.

```ts
const unsubscribe = ErrorHandler.onReport(async event => {
    if (!event.expected) await persistSafely(event);
});
await ErrorHandler.withContext({ scope: 'command', operationId: 'unique-operation' }, async () => {
    try { await execute(); }
    catch (error) { await ErrorHandler.report(error, { source: 'import.execute' }); }
});
unsubscribe();
```

Use `@webtypen/webframez-errors` for durable Server Manager delivery and redaction. Do not send raw error events directly or globally replace console.error. Fatal process observation lives in that package and preserves Node's normal crash behavior.

## Queue failures and monitoring

A failed queue execution is reported with its attempt, worker/process and final
job status or retry date. A later retry is a distinct execution and can produce a
new occurrence. A successful `executeAgain()` status poll is not itself an error.
`QueueRetryLimitError` means the queue policy stopped execution; it does not prove
that an external payment failed. Check the provider separately.

Changing an error group's status in the Server Manager does not resume, cancel or
finish its queue job. Likewise, resuming a job does not erase the earlier error
occurrence. See [Queue retry limits and safe recovery](queue-workers.md).

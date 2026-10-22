import { ErrorHandler } from "../ErrorHandling/ErrorHandler";
import crypto from "crypto";
import {DBConnection} from "../Database/DBConnection";
import {QueueJobsRegisty} from "./QueueJobsRegisty";
import { QueueRetryLimitError } from "./QueueRetryLimitError";
import { QueueRetryPolicy, QueueRetryOptions } from "./QueueRetryPolicy";

/** Embedded worker for applications whose database must stay in one process (e.g. DuckDB).
 * Uses the same queue_jobs records and BaseQueueJob handlers as console workers. */
export class Queue {
    private static timer: ReturnType<typeof setInterval> | undefined;
    private static running: Promise<void> | undefined;
    private static abort: AbortController | undefined;
    private static worker = "embedded-" + crypto.randomUUID();
    private static async collection() {return (await DBConnection.getDocumentStore()).collection("queue_jobs");}
    static async enqueue(jobclass:string, props:Record<string,any>={}) {
        QueueJobsRegisty.getJobOrFail(jobclass);
        const jobs=await this.collection(), id=props._id || crypto.randomUUID();
        await jobs.updateOne({_id:id},{$setOnInsert:{...props,_id:id,jobclass,status:"pending",created_at:new Date(),not_before:null,worker:null}},{upsert:true});
        return jobs.findOne({_id:id});
    }
    static start(jobclasses:string[], intervalMs=1000) {
        if(this.timer)return;
        const tick=()=>{if(!this.running)this.running=this.runOnce(jobclasses).catch(error => ErrorHandler.report(error, { scope: "job", source: "queue.embedded.poll", job: { worker: this.worker } })).finally(()=>{this.running=undefined;});};
        this.timer=setInterval(tick,intervalMs);this.timer.unref();tick();
    }
    static async stop(){if(this.timer)clearInterval(this.timer);this.timer=undefined;this.abort?.abort();await this.running;}
    static async runOnce(jobclasses:string[]) {
        const jobs=await this.collection(),now=new Date();
        await jobs.updateMany({status:"running",embedded_queue:true,lease_until:{$lt:now}},{$set:{status:"pending",worker:null,recovered:true}});
        const token=crypto.randomUUID();
        const claimed=await jobs.findOneAndUpdate({status:"pending",jobclass:{$in:jobclasses},$or:[{not_before:null},{not_before:{$lte:now}}]},{$set:{status:"running",worker:this.worker,embedded_queue:true,lease_token:token,lease_until:new Date(Date.now()+60000),started_at:now}},{sort:{priority:-1,created_at:1},returnDocument:"after"});
        const job=claimed;
        if(!job)return;
        return ErrorHandler.withContext({ scope: "job", operationId: token, source: "queue.embedded", job: { id: String(job._id), number: job.number, jobclass: job.jobclass, worker: this.worker, attempt: QueueRetryPolicy.attempts(job) + 1 } }, async () => {
            const filter={_id:job._id,lease_token:token,status:"running"};
            const controller=new AbortController();this.abort=controller;
            const heartbeat=setInterval(()=>{void jobs.updateOne(filter,{$set:{lease_until:new Date(Date.now()+60000)}}).then((result:any)=>{if(!result.matchedCount)controller.abort();}).catch(()=>controller.abort());},15000);heartbeat.unref();
            const previousAttempts = QueueRetryPolicy.attempts(job);
            const previousFailures = QueueRetryPolicy.failures(job);
            job.first_started_at = QueueRetryPolicy.startedAt(job, now);
            job.attempts_made = previousAttempts + 1;
            let policy: QueueRetryOptions | null = null;
            let handler: any = null;
            try {
                // Persist the attempt before calling user code, including across lease recovery.
                const reserved = await jobs.updateOne(filter, { $set: {
                    first_started_at: job.first_started_at,
                    attempts_made: job.attempts_made,
                    failed_attempts: previousFailures,
                } });
                if (!reserved.matchedCount) return;
                const Handler = QueueJobsRegisty.getJobOrFail(job.jobclass);
                handler = new Handler();
                policy = QueueRetryPolicy.resolve(job.jobclass, Handler, await handler.retryPolicy?.(job));
                if (job.retry_exhaustion_attempts) throw new QueueRetryLimitError("Retry exhaustion finalization pending.");
                QueueRetryPolicy.assertCanRun(policy, job, previousAttempts, now);
                const result = await ErrorHandler.withContext({ scope: "job", operationId: token, source: "queue.embedded", job: { id: String(job._id), number: job.number, jobclass: job.jobclass, worker: this.worker, attempt: job.attempts_made } }, () => handler.handle({ ...job, signal: controller.signal }));
                const endedAt = new Date();
                const retryAt = result?.__execute_again
                    ? QueueRetryPolicy.rescheduleAt(policy, job, job.attempts_made, result.__execute_again, endedAt)
                    : null;
                await jobs.updateOne(filter, { $set: {
                    status: retryAt ? "pending" : "finished",
                    not_before: retryAt,
                    ended_at: retryAt ? null : endedAt,
                    worker: null,
                    error: null,
                } });
            } catch (error) {
                const endedAt = new Date();
                const failures = previousFailures + 1;
                let retryAt = policy
                    ? QueueRetryPolicy.retryAt(policy, job, job.attempts_made, failures, error, endedAt)
                    : null;
                let recovered = false;
                let finalizationFailed = false;
                const exhausted = policy && (error instanceof QueueRetryLimitError
                    || policy.retryOn !== "never" && (error as any)?.retryable !== false && (policy.retryOn === "all" || (error as any)?.retryable === true) && !retryAt);
                if (exhausted && handler?.onRetryExhausted && (job.retry_exhaustion_attempts || 0) < policy!.maxFinalizationAttempts) {
                    job.retry_exhaustion_attempts = (job.retry_exhaustion_attempts || 0) + 1;
                    try {
                        recovered = await handler.onRetryExhausted(job, error) === "finished";
                    } catch (finalizationError) {
                        await ErrorHandler.report(finalizationError, { scope: "job", source: "queue.embedded.finalization", job: { id: String(job._id), jobclass: job.jobclass, worker: this.worker } });
                        finalizationFailed = true;
                        if ((finalizationError as any)?.retryable !== false && job.retry_exhaustion_attempts < policy!.maxFinalizationAttempts) {
                            retryAt = new Date(endedAt.getTime() + policy!.delaySeconds * 1000);
                        }
                    }
                }
                await ErrorHandler.withContext({ operationId: token }, () => ErrorHandler.report(error, { scope: "job", source: "queue.embedded", job: { id: String(job._id), number: job.number, jobclass: job.jobclass, worker: this.worker, attempt: job.attempts_made, status: recovered ? "finished" : retryAt ? "pending" : "failed", retryAt: retryAt?.toISOString() || null } }));
                // Handler owns log redaction. Do not persist raw exception output or credentials here.
                await jobs.updateOne(filter, { $set: {
                    status: recovered ? "finished" : retryAt ? "pending" : "failed",
                    not_before: retryAt,
                    ended_at: retryAt ? null : endedAt,
                    failed_attempts: failures,
                    worker: null,
                    retry_exhaustion_attempts: job.retry_exhaustion_attempts || 0,
                    retry_exhaustion_error: finalizationFailed ? "Queue exhaustion finalization failed. See the domain status for details." : null,
                    error: recovered ? null : retryAt ? "Queue job will be retried." : "Queue job failed or reached its retry limit. See the domain status for details.",
                } });
            } finally {clearInterval(heartbeat);if(this.abort===controller)this.abort=undefined;}
        });
    }
}

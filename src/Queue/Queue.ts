import crypto from "crypto";
import {DBConnection} from "../Database/DBConnection";
import {QueueJobsRegisty} from "./QueueJobsRegisty";

/** Embedded worker for applications whose database must stay in one process (e.g. DuckDB).
 * Uses the same queue_jobs records and BaseQueueJob handlers as console workers. */
export class Queue {
    private static timer: ReturnType<typeof setInterval> | undefined;
    private static running: Promise<void> | undefined;
    private static abort: AbortController | undefined;
    private static worker = "embedded-" + crypto.randomUUID();
    private static async collection() {return (await DBConnection.getConnection()).client.db(null).collection("queue_jobs");}
    static async enqueue(jobclass:string, props:Record<string,any>={}) {
        QueueJobsRegisty.getJobOrFail(jobclass);
        const jobs=await this.collection(), id=props._id || crypto.randomUUID();
        await jobs.updateOne({_id:id},{$setOnInsert:{...props,_id:id,jobclass,status:"pending",created_at:new Date(),not_before:null,worker:null}},{upsert:true});
        return jobs.findOne({_id:id});
    }
    static start(jobclasses:string[], intervalMs=1000) {
        if(this.timer)return;
        const tick=()=>{if(!this.running)this.running=this.runOnce(jobclasses).catch(()=>{}).finally(()=>{this.running=undefined;});};
        this.timer=setInterval(tick,intervalMs);this.timer.unref();tick();
    }
    static async stop(){if(this.timer)clearInterval(this.timer);this.timer=undefined;this.abort?.abort();await this.running;}
    static async runOnce(jobclasses:string[]) {
        const jobs=await this.collection(),now=new Date();
        await jobs.updateMany({status:"running",embedded_queue:true,lease_until:{$lt:now}},{$set:{status:"pending",worker:null,recovered:true}});
        const token=crypto.randomUUID();
        const claimed=await jobs.findOneAndUpdate({status:"pending",jobclass:{$in:jobclasses},$or:[{not_before:null},{not_before:{$lte:now}}]},{$set:{status:"running",worker:this.worker,embedded_queue:true,lease_token:token,lease_until:new Date(Date.now()+60000),started_at:now}},{sort:{priority:-1,created_at:1},returnDocument:"after"});
        const job=claimed?._id?claimed:claimed?.value;
        if(!job)return;
        const filter={_id:job._id,lease_token:token,status:"running"};
        const controller=new AbortController();this.abort=controller;
        const heartbeat=setInterval(()=>{void jobs.updateOne(filter,{$set:{lease_until:new Date(Date.now()+60000)}}).then((result:any)=>{if(!result.matchedCount)controller.abort();}).catch(()=>controller.abort());},15000);heartbeat.unref();
        try {
            const Handler=QueueJobsRegisty.getJobOrFail(job.jobclass),handler=new Handler();
            const result=await handler.handle({...job,signal:controller.signal});
            await jobs.updateOne(filter,{$set:result?.__execute_again?{status:"pending",not_before:result.__execute_again,worker:null}:{status:"finished",ended_at:new Date(),worker:null}});
        } catch(error) {
            // Handler owns log redaction. Do not persist raw exception output or credentials here.
            await jobs.updateOne(filter,{$set:{status:"failed",ended_at:new Date(),worker:null,error:"Queue job failed. See the domain status for details."}});
        } finally {clearInterval(heartbeat);if(this.abort===controller)this.abort=undefined;}
    }
}

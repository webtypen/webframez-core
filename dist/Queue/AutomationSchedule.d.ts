export type DueAutomationExecution = {
    type: string;
    value: any;
    options: any;
    executionKey: string;
    identifier: string | null;
    dueAt: any;
};
export declare function getDueAutomationExecutions(executions: any[], since: any, until: any, timezone?: string, identifier?: string | null): DueAutomationExecution[];
export declare function matchesAutomationExecutions(executions: any[] | undefined, date: Date | string | undefined, timezone?: string): boolean;

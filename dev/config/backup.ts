export default {
    defaults: {
        workDir: "dev/storage/backups/.work",
        outputDir: "dev/storage/backups",
        filename: "{key}_{date}_{time}",
        zip: true,
        cleanupWorkDir: true,
        retention: {
            keepLast: 10,
            maxAgeDays: 30,
            runAfterBackup: true,
        },
    },
    types: {
        storage_demo: {
            is_active: true,
            files: [
                {
                    from: "dev/storage/test-storage-check",
                    to: "storage-check",
                    include: ["**/*"],
                },
            ],
            outputs: [
                {
                    driver: "local",
                    path: "dev/storage/backups/storage-demo",
                    retention: {
                        keepLast: 3,
                        maxAgeDays: 14,
                        runAfterBackup: true,
                    },
                },
            ],
            automation: {
                worker: "worker_1",
                executions: [["daily", "02:00"]],
                priority: 10,
            },
        },
    },
};

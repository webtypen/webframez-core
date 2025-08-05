export default {
    workers: {
        worker_1: {
            is_active: true,
            // jobclasses: [],
            automation: [
                {
                    jobclass: "TestJob",
                    executions: [
                        ["tuesdays", "01:02"],
                        ["daily", "01:04"],
                        ["every_hour"],
                        ["every_hour", 1],
                        ["daily", "02:23"],
                        ["daily", "02:24"],
                        ["daily", "02:25"],
                        ["every_hour", 20],
                    ],
                },
            ],
        },
        worker_2: {
            is_active: true,
        },
        worker_3: {
            is_active: true,
        },
    },
};

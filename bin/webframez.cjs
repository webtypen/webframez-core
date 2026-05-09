#!/usr/bin/env node

require("../dist/Cli")
    .runWebframezCli()
    .catch((error) => {
        console.error("[webframez]", error && error.stack ? error.stack : error);
        process.exit(1);
    });

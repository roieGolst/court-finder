#!/usr/bin/env node
import main from '../src/cli/index.js';

main()
    .then(() => console.log("Bye :)"))
    .catch(e => {
        console.error("Error:", e.message || e);
        process.exit(1);
    });
    
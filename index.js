'use strict';

const fs = require('fs');
const csv = require('csv/lib/sync');
const lo = require('lodash');
const delay = require('delay');
const chalk = require('chalk');
const request = require('request-promise-native');
require('dotenv');

const HOOK_URL = process.env.HOOK_URL;
const HOOK_TOKEN = process.env.HOOK_TOKEN; // Optional
const SIMULATE_CSV_UPLOADER = process.env.SIMULATE_CSV_UPLOADER; // Optional
const START_ROW = process.env.START_ROW; // Optional

const CONCURRENCY = 8; // Kustomer limit is 16.6 (1000 rpm)
const DELAY = 1000;

(async function() {
    const sheet = readCsv();
    console.log(`Found ${chalk.yellow(sheet.length)} rows`);
    const chunks = lo.chunk(sheet, CONCURRENCY);
    let count = 0;

    for (const [index, chunk] of chunks.entries()) {
        const requests = chunk.map(row => sendRequest(row));
        const responses = Promise.all(requests);
        count = count + chunk.length;

        for (const [i, res] of responses.entries()) {
            if (!res) {
                console.log(`${chalk.red('Error')}: Failed webhook for row ${chalk.yellow(index*CONCURRENCY + i + 1)}`);
                count--;
            }
        }

        console.log(`Uploaded: Chunk ${chalk.yellow(index+1)} (${chalk.yellow(count)} rows)`);
        await delay(DELAY);
    }

    async function sendRequest(payload) {
        const body = SIMULATE_CSV_UPLOADER === 'true' ? { upload: payload } : payload;
        const params = {
            url: HOOK_URL,
            method: 'GET',
            json: true,
            auth: {
                bearer: HOOK_TOKEN
            },
            body: body
        };

        try {
            return await request(params);
        } catch(e) {
            return null;
        }
    }

    function readCsv() {
        const file = readFile();
        const sheet = parseSheet(file);
        const slicedSheet = sliceSheet(sheet);

        return slicedSheet;

        function readFile() {
            try {
                return fs.readFile('./data.csv');
            } catch (e) {
                console.log(`${chalk.red('Error')}: Could not find CSV. The file must be named "data.csv" and be located in this folder`);
                process.exit(1);
            }
        }

        function parseSheet(file) {
            try {
                return csv.parse(file, { columns: true });
            } catch (e) {
                console.log(`${chalk.red('Error')}: Could not parse CSV`);
                process.exit(1);
            }
        }

        function sliceSheet(sheet) {
            const offset = calculateOffset();

            return sheet.slice(offset);

            function calculateOffset() {
                const startRow = parseInt(START_ROW);

                if (typeof startRow !== 'number' || isNaN(startRow)) {
                    return 0;
                } else if (startRow < 1) {
                    return 0;
                } else {
                    return startRow - 1;
                }
            }
        }
    }
})();

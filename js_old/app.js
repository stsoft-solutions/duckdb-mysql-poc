import 'dotenv/config';
import {DuckDBInstance} from '@duckdb/node-api';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as dotenv from "dotenv";

function mustGet(name) {
    const v = process.env[name];
    if (v === undefined || v === '') throw new Error(`Missing env var: ${name}`);
    return v;
}

function sqlIdent(name) {
    // very small safety: allow only typical identifier characters
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        throw new Error(`Invalid identifier: ${name}`);
    }
    return name;
}

function timeExpr(col, unit) {
    // DuckDB time conversion choice depends on whether your BIGINT is seconds or milliseconds.
    // - seconds: to_timestamp(<seconds>)
    // - milliseconds: to_timestamp(<milliseconds> / 1000.0)
    // Note: This keeps it simple and portable.
    const c = sqlIdent(col);
    if (unit === 'milliseconds') return `to_timestamp(${c} / 1000.0)`;
    if (unit === 'seconds') return `to_timestamp(${c})`;
    throw new Error(`TIME_UNIT must be 'seconds' or 'milliseconds', got: ${unit}`);
}

async function exportYear(conn, exportDir, tableName, yearFrom, timeUnit, year, maxFileSize, columns, batchSize) {
    const ts = timeExpr(yearFrom, timeUnit);
    const yearPath = path.resolve(exportDir, `year=${year}`);
    fs.mkdirSync(yearPath, {recursive: true});

    console.log(`  Discovering months in year ${year}...`);

    // Find all months in this year and get their timestamp ranges
    const monthsSql = `
        SELECT 
            EXTRACT(month FROM ${ts})::INTEGER AS month,
            MIN(${yearFrom}) as min_ts,
            MAX(${yearFrom}) as max_ts
        FROM ${tableName}
        WHERE ${yearFrom} IS NOT NULL
          AND ${yearFrom} > 0
          AND EXTRACT(year FROM ${ts})::INTEGER = ${year}
        GROUP BY EXTRACT(month FROM ${ts})::INTEGER
        ORDER BY month
    `;

    /*
    SELECT EXTRACT(YEAR FROM FROM_UNIXTIME(open_time / 1000)) AS year,
           EXTRACT(MONTH FROM FROM_UNIXTIME(open_time / 1000)) AS month,
           MIN(open_time) AS first_open_time,
           MAX(open_time) AS last_open_time,
           COUNT(*) AS total_orders
    FROM order_mt4
    WHERE open_time IS NOT NULL
      AND open_time > 0
    GROUP BY year, month
    ORDER BY year, month;
    */

    const monthsReader = await conn.runAndReadAll(monthsSql);
    const monthsData = monthsReader.getRowObjectsJS();

    console.log(`  Found ${monthsData.length} month(s) in year ${year}: ${monthsData.map(m => m.month).join(', ')}`);

    // Export each month
    for (const monthInfo of monthsData) {
        const month = monthInfo.month;
        const minTs = Number(monthInfo.min_ts);
        const maxTs = Number(monthInfo.max_ts);

        const monthPadded = String(month).padStart(2, '0');
        const monthPath = path.resolve(yearPath, `month=${monthPadded}`);
        fs.mkdirSync(monthPath, {recursive: true});

        // Use specific columns if provided, otherwise use *
        const selectColumns = columns || '*';

        let copySql;

        // Use batching with cursor-based pagination to reduce MySQL memory usage
        console.log(`    Exporting month ${monthPadded} in batches of ${batchSize}...`);
        console.log(`    Timestamp range: ${minTs} to ${maxTs}`);

        let lastTimestamp = minTs - 1; // Start before the minimum
        let batchNum = 0;

        // Cycle through batches
        while (lastTimestamp < maxTs) {

            // Use a unique filename for each batch to avoid overwriting
            const batchFilename = `order_mt4_batch${batchNum}_{i}`;

            // Get last timestamp for current batch
            const batchLastTsSql = `
                    SELECT ifnull(max(a.${yearFrom}), 0) AS batch_last_ts
                    FROM (SELECT ${yearFrom}
                          FROM ${tableName}
                          WHERE ${yearFrom} > ${lastTimestamp}
                            AND ${yearFrom} <= ${maxTs}
                          ORDER BY ${yearFrom}
                          LIMIT ${batchSize}) AS a;
                `;
            const batchLastTsReader = await conn.runAndReadAll(batchLastTsSql);
            const batchLastTsResult = batchLastTsReader.getRowObjectsJS()[0];
            let batchLastTs = 0;
            if (batchLastTsResult && batchLastTsResult.batch_last_ts) {
                batchLastTs = Number(batchLastTsResult.batch_last_ts);
            }

            console.log(`      Determined batch last timestamp: ${batchLastTs} for batch ${batchNum}`);

            // If no more rows, we're done
            if (lastTimestamp >= batchLastTs) {
                console.log(`      No more rows to export, finishing month export.`);
                break;
            }

            console.log(`      Batch ${batchNum} (timestamp > ${lastTimestamp} AND timestamp <= ${batchLastTs})...`);

            // Use cursor-based pagination: WHERE timestamp > lastTimestamp
            copySql = `
                COPY (
                  SELECT ${selectColumns}
                  FROM ${tableName}
                  WHERE ${yearFrom} > ${lastTimestamp} 
                    AND ${yearFrom} <= ${batchLastTs} 
                )
                TO '${monthPath}'
                (FORMAT PARQUET,
                 COMPRESSION ZSTD,
                 FILE_SIZE_BYTES '${maxFileSize}',
                 OVERWRITE_OR_IGNORE true,
                 FILENAME_PATTERN '${batchFilename}');
              `;

            const copyResult = await conn.run(copySql);
            console.log(`      Batch ${batchNum} exported. Rows: ${copyResult.rowsChanged}`);

            // Switch to the next batch
            lastTimestamp = batchLastTs;
            batchNum++;

            console.log(`      Excepted batch ${batchNum}. Last timestamp: ${lastTimestamp}. Max: ${maxTs}`);
        }

        // Safety check: if we've reached or passed the max timestamp, we're done
        console.log(`      Reached end of month (${maxTs})`);
    }
}

async function consolidateYear(conn, exportDir, consolidateDir, year, maxFileSize) {
    console.log(`  Consolidating year ${year}...`);

    const yearPath = path.resolve(exportDir, `year=${year}`);
    const consolidatedPath = path.resolve(consolidateDir, `year=${year}`);
    fs.mkdirSync(consolidatedPath, {recursive: true});

    // Read all parquet files from all months in this year
    const yearPattern = path.join(yearPath, '**', '*.parquet').replace(/\\/g, '/');

    console.log(`    Reading from: ${yearPattern}`);
    console.log(`    Writing to: ${consolidatedPath}`);

    // Read all monthly/batched files and write as a consolidated yearly file
    const consolidateSql = `
        COPY (
            SELECT * FROM read_parquet('${yearPattern}')
            ORDER BY open_time
        )
        TO '${consolidatedPath}'
        (FORMAT PARQUET,
         COMPRESSION ZSTD,
         FILE_SIZE_BYTES '${maxFileSize}',
         FILENAME_PATTERN 'year_${year}_{i}');
    `;

    await conn.run(consolidateSql);
    console.log(`  ✓ Year ${year} consolidated`);
}

async function main() {
    const startTime = Date.now();
    const duckdbPath = process.env.DUCKDB_PATH ?? ':memory:';
    const threads = process.env.DUCKDB_THREADS ?? '4';
    const memoryLimit = process.env.DUCKDB_MEMORY_LIMIT ?? '8GB';

    const mysqlHost = mustGet('MYSQL_HOST');
    const mysqlPort = mustGet('MYSQL_PORT');
    const mysqlDatabase = mustGet('MYSQL_DATABASE');
    const mysqlUser = mustGet('MYSQL_USER');
    const mysqlPassword = mustGet('MYSQL_PASSWORD');

    const exportDir = mustGet('EXPORT_DIR');
    const maxFileSize = mustGet('MAX_FILE_SIZE');
    const yearFrom = sqlIdent(process.env.YEAR_FROM ?? 'open_time');
    const timeUnit = (process.env.TIME_UNIT ?? 'seconds').toLowerCase();

    // Optional: specify columns to export (reduces temp table size)
    const exportColumns = process.env.EXPORT_COLUMNS || null;

    // Optional: batch size for large exports (reduces MySQL memory usage)
    const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE, 10) : 150000;

    // Optional: filter years to export
    const startYear = process.env.START_YEAR ? parseInt(process.env.START_YEAR, 10) : null;
    const endYear = process.env.END_YEAR ? parseInt(process.env.END_YEAR, 10) : null;

    // Optional: consolidate into yearly files after export
    const consolidateDir = process.env.CONSOLIDATE_DIR || null;
    const enableConsolidation = consolidateDir && consolidateDir.trim() !== '';

    if (exportColumns) {
        console.log('Export columns:', exportColumns);
    }
    if (batchSize > 0) {
        console.log('Batch size:', batchSize);
    }
    if (startYear) {
        console.log('Start year:', startYear);
    }
    if (endYear) {
        console.log('End year:', endYear);
    }
    if (enableConsolidation) {
        console.log('Consolidation directory:', consolidateDir);
    }

    console.log('Initializing DuckDB...');
    const instance = await DuckDBInstance.create(duckdbPath);
    const conn = await instance.connect();

    await conn.run(`SET threads=${threads}`);
    await conn.run(`SET memory_limit='${memoryLimit}'`);

    console.log('Installing and loading MySQL extension...');
    await conn.run("INSTALL mysql");
    await conn.run("LOAD mysql");

    console.log('Attaching MySQL database...');
    const attachSql = `
    ATTACH 'host=${mysqlHost} port=${mysqlPort} database=${mysqlDatabase} user=${mysqlUser} password=${mysqlPassword}'
    AS mysql_db (TYPE mysql, READ_ONLY)
  `;
    await conn.run(attachSql);

    console.log('Setting up MySQL connection parameters...');
    await conn.run("SET mysql_experimental_filter_pushdown=true");
    await conn.run("SET mysql_tinyint1_as_boolean=false");

    fs.mkdirSync(exportDir, {recursive: true});

    const ts = timeExpr(yearFrom, timeUnit);

    // Discover years - use a temp table approach to avoid reader complexity
    console.log('Discovering years in table...');
    const yearsSql = `
    CREATE TEMP TABLE temp_years AS
    SELECT DISTINCT EXTRACT(year FROM ${ts})::INTEGER AS year
    FROM mysql_db.order_mt4
    WHERE ${yearFrom} IS NOT NULL
    ORDER BY year
  `;

    console.log('Creating temp table with years...');
    await conn.run(yearsSql);

    console.log('Reading years from temp table...');
    const readYearsSql = 'SELECT year FROM temp_years ORDER BY year';
    const resultReader = await conn.runAndReadAll(readYearsSql);

    const years = [];
    const rows = resultReader.getRowObjectsJS();

    for (const row of rows) {
        const year = row.year;

        // Apply year filtering if specified
        if (startYear && year < startYear) continue;
        if (endYear && year > endYear) continue;

        years.push(year);
    }

    console.log(`Found ${years.length} year(s) to export: ${years.join(', ')}`);

    for (let i = 0; i < years.length; i++) {
        const y = years[i];
        // Filter years based on environment variables
        if ((startYear !== null && y < startYear) || (endYear !== null && y > endYear)) {
            console.log(`Skipping year ${y} (out of range)`);
            continue;
        }
        console.log(`\n[${i + 1}/${years.length}] Processing year ${y}...`);
        try {
            await exportYear(
                conn,
                exportDir,
                'mysql_db.order_mt4',
                yearFrom,
                timeUnit,
                y,
                maxFileSize,
                exportColumns,
                batchSize
            );
            console.log(`? Year ${y} exported successfully`);
        } catch (err) {
            console.error(`? Failed to export year ${y}:`, err.message);
            // Continue with next year instead of failing completely
        }
    }

    console.log(`\n✓ Done. Output: ${path.resolve(exportDir)}`);

    // Consolidation step: merge monthly batched files into yearly files
    if (enableConsolidation) {
        console.log('\n====================');
        console.log('Starting consolidation...');
        console.log('====================\n');

        fs.mkdirSync(consolidateDir, {recursive: true});

        const consolidatedYears = [];
        for (let i = 0; i < years.length; i++) {
            const y = years[i];
            console.log(`[${i + 1}/${years.length}] Consolidating year ${y}...`);
            try {
                await consolidateYear(conn, exportDir, consolidateDir, y, maxFileSize);
                consolidatedYears.push(y);
            } catch (err) {
                console.er
                ~ror(`✗ Failed to consolidate year ${y}:`, err.message);
            }
        }

        console.log(`\n✓ Consolidation complete!`);
        console.log(`  Exported: ${path.resolve(exportDir)}`);
        console.log(`  Consolidated: ${path.resolve(consolidateDir)}`);
        console.log(`  Years consolidated: ${consolidatedYears.join(', ')}`);
    }

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const durationSec = (durationMs / 1000).toFixed(2);
    const durationMin = (durationMs / 60000).toFixed(2);
    console.log(`\n====================`);
    console.log(`Total execution time: ${durationMs}ms (${durationSec}s / ${durationMin}min)`);
    console.log(`====================`);
}

dotenv.config();

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

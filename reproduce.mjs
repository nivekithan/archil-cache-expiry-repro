import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { promisify } from "node:util";

const READ_SIZE = 8;
const READS_PER_PHASE = 100;
const EXPIRY_WAIT_MILLISECONDS = 32_000;
const execFileAsync = promisify(execFile);

if (process.argv.length !== 3) {
	console.error(`Usage: sudo node ${process.argv[1]} /mnt/archil/path/to/file`);
	process.exit(2);
}

const path = process.argv[2];
const file = await open(path, constants.O_RDONLY | constants.O_DIRECT);

async function invalidateCache() {
	await execFileAsync("archil", ["invalidate-cache", path]);
}

async function measureReads(label, expected) {
	const buffer = Buffer.alloc(READ_SIZE);
	const started = process.hrtime.bigint();

	for (let readNumber = 0; readNumber < READS_PER_PHASE; readNumber += 1) {
		const { bytesRead } = await file.read(buffer, 0, READ_SIZE, 0);
		if (bytesRead !== READ_SIZE) {
			throw new Error(`Short read: expected ${READ_SIZE} bytes, got ${bytesRead}`);
		}
		if (expected === undefined) {
			expected = Buffer.from(buffer);
		} else if (!buffer.equals(expected)) {
			throw new Error("File contents changed during reproduction");
		}
	}

	const elapsedMilliseconds = Number(process.hrtime.bigint() - started) / 1_000_000;
	console.log(
		`${label.padEnd(38)} ${elapsedMilliseconds.toFixed(2).padStart(6)} ms (${READS_PER_PHASE} x ${READ_SIZE}-byte reads)`,
	);
	return expected;
}

try {
	await invalidateCache();
	const expected = await measureReads("Fresh cache");

	console.log(`Waiting ${EXPIRY_WAIT_MILLISECONDS / 1000}s for page expiry...`);
	await new Promise((resolve) => setTimeout(resolve, EXPIRY_WAIT_MILLISECONDS));
	await measureReads("After expiry", expected);

	await invalidateCache();
	await measureReads("After explicit invalidation", expected);
} finally {
	await file.close();
}

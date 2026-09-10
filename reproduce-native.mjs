import { ArchilClient } from "@archildata/native";

const READ_SIZE = 8;
const READS_PER_PHASE = 100;
const EXPIRY_WAIT_MILLISECONDS = 32_000;

if (process.argv.length !== 3) {
	console.error(`Usage: node ${process.argv[1]} <inode-id>`);
	process.exit(2);
}

const inodeId = Number(process.argv[2]);
if (!Number.isSafeInteger(inodeId) || inodeId <= 0) {
	throw new Error("The inode ID must be a positive safe integer");
}

const region = requiredEnvironmentVariable("ARCHIL_REGION");
const diskName = requiredEnvironmentVariable("ARCHIL_DISK_NAME");
const authToken = requiredEnvironmentVariable("ARCHIL_MOUNT_TOKEN");

const client = await ArchilClient.connect({ region, diskName, authToken });

async function measureReads(label, expected) {
	const started = process.hrtime.bigint();

	for (let readNumber = 0; readNumber < READS_PER_PHASE; readNumber += 1) {
		const buffer = await client.readInode(inodeId, 0, READ_SIZE);
		if (buffer.length !== READ_SIZE) {
			throw new Error(`Short read: expected ${READ_SIZE} bytes, got ${buffer.length}`);
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

function requiredEnvironmentVariable(name) {
	const value = process.env[name];
	if (value === undefined || value === "") {
		throw new Error(`${name} is required`);
	}
	return value;
}

try {
	client.invalidateCache();
	const expected = await measureReads("Fresh cache");

	console.log(`Waiting ${EXPIRY_WAIT_MILLISECONDS / 1000}s for page expiry...`);
	await new Promise((resolve) => setTimeout(resolve, EXPIRY_WAIT_MILLISECONDS));
	await measureReads("After expiry", expected);

	client.invalidateCache();
	await measureReads("After explicit invalidation", expected);
} finally {
	await client.close();
}

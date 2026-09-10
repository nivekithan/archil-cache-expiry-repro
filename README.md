# Archil FUSE cache expiry reproduction

Minimal timing reproduction for an Archil v0.8.35 client-cache issue: after a clean file-data page expires, repeated reads become substantially slower. Explicitly invalidating the page restores the initial performance.

This reproduction targets the Linux FUSE client. A dependency-free Node.js script issues sequential, asynchronous 8-byte positional reads against a mounted file.

## Requirements

- Linux with Node.js 18 or newer
- Archil CLI v0.8.35
- An Archil disk and mount token
- Permission to copy the included test file onto the disk
- Root access for mounting and cache invalidation

The scripts only read the test file. They do not modify or delete it.

## Reproduce

Mount the disk normally:

```bash
export ARCHIL_MOUNT_TOKEN='<disk-token>'
sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount \
  '<account>/<disk>' /mnt/archil \
  --region aws-us-east-1

sudo cp test-file.txt /mnt/archil/archil-cache-expiry-repro.txt
sudo sync -f /mnt/archil/archil-cache-expiry-repro.txt
```

Run it as root so it can invoke `archil invalidate-cache`:

```bash
sudo node reproduce.mjs /mnt/archil/archil-cache-expiry-repro.txt
```

It takes approximately 35 seconds. On an affected client, the output resembles:

```text
Fresh cache                              9.46 ms (100 x 8-byte reads)
Waiting 32s for page expiry...
After expiry                           145.21 ms (100 x 8-byte reads)
After explicit invalidation              8.08 ms (100 x 8-byte reads)
```

Exact timings vary by machine. The signal is that all repeated reads become slower after expiry and explicit invalidation restores performance.

## Bypassing Linux's page cache

Normal repeated reads can be served entirely by Linux's page cache and never reach the Archil FUSE process. The program opens the file with:

```js
await open(path, constants.O_RDONLY | constants.O_DIRECT)
```

For this FUSE filesystem, `O_DIRECT` bypasses Linux's page cache while still exercising Archil's in-process client cache. Archil accepts the 8-byte direct reads without imposing block-alignment requirements. Every returned byte is compared with the first read, and a short or changed read fails the reproduction.

## Cleanup

Unmount normally when finished:

```bash
sudo rm /mnt/archil/archil-cache-expiry-repro.txt
sudo archil unmount /mnt/archil
```

Do not use `umount`; Archil's documented `archil unmount` command waits for pending writes to be synchronized.

## Native client reproduction

The same behavior can be reproduced without FUSE reads by using `@archildata/native`. Install the pinned dependency using Node.js 22 or newer:

```bash
npm install
```

Set the connection details and obtain the Archil inode ID from the mounted test file:

```bash
export ARCHIL_REGION='aws-us-east-1'
export ARCHIL_DISK_NAME='<account>/<disk>'
export ARCHIL_MOUNT_TOKEN='<disk-token>'

inode_id=$(stat -c %i /mnt/archil/archil-cache-expiry-repro.txt)
node reproduce-native.mjs "$inode_id"
```

The native reproduction performs the same sequential 8-byte reads through `ArchilClient.readInode()`. It clears only the native client's in-process cache and does not use Linux's page cache.

Observed with `@archildata/native@0.8.35`:

```text
Fresh cache                              9.72 ms (100 x 8-byte reads)
Waiting 32s for page expiry...
After expiry                            74.68 ms (100 x 8-byte reads)
After explicit invalidation              5.38 ms (100 x 8-byte reads)
```

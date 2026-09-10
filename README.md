# Archil FUSE cache expiry reproduction

Minimal reproduction for an Archil v0.8.35 client-cache issue: after file data expires (around 30seconds), repeated reads become substantially slower. Explicitly invalidating the page restores the initial performance.

## Requirements

- Linux with Node.js 18 or newer
- Archil CLI v0.8.35
- An Archil disk and mount token
- Root access for mounting and cache invalidation


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

## Bypassing Linux's page cache

Linux can serve normal repeated reads entirely from its page cache, so they never reach the Archil FUSE process. The program opens the file with:

```js
await open(path, constants.O_RDONLY | constants.O_DIRECT)
```
`O_DIRECT` bypasses Linux's page cache while still exercising Archil's in-process client cache

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

The native reproduction performs the same sequential 8-byte reads through `ArchilClient.readInode()`. 

```text
Fresh cache                              9.72 ms (100 x 8-byte reads)
Waiting 32s for page expiry...
After expiry                            74.68 ms (100 x 8-byte reads)
After explicit invalidation              5.38 ms (100 x 8-byte reads)
```

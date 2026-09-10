# Archil FUSE cache expiry reproduction

Minimal timing reproduction for an Archil v0.8.35 client-cache issue: after a clean file-data page expires, repeated reads become substantially slower. Explicitly invalidating the page restores the initial performance.

This reproduction targets the Linux FUSE client. A small Go program issues explicit 8-byte positional reads against a mounted file.

## Requirements

- Linux with Go 1.18 or newer
- Archil CLI v0.8.35
- An Archil disk and mount token
- An existing non-empty file on that disk
- Root access for mounting and cache invalidation

The script only reads the test file. It does not modify or delete it.

## Reproduce

Mount the disk normally:

```bash
export ARCHIL_MOUNT_TOKEN='<disk-token>'
sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount \
  '<account>/<disk>' /mnt/archil \
  --region aws-us-east-1
```

Build it, then run as root so it can invoke `archil invalidate-cache`:

```bash
go build -o reproduce .
sudo ./reproduce /mnt/archil/path/to/file.bin
```

It takes approximately 35 seconds. On an affected client, the output resembles:

```text
Fresh cache                              9.54 ms (100 x 8-byte reads)
Waiting 32s for page expiry...
After expiry                            83.07 ms (100 x 8-byte reads)
After explicit invalidation              5.21 ms (100 x 8-byte reads)
```

Exact timings vary by machine. The signal is that all repeated reads become slower after expiry and explicit invalidation restores performance.

## Bypassing Linux's page cache

Normal repeated reads can be served entirely by Linux's page cache and never reach the Archil FUSE process. The program opens the file with:

```c
unix.Open(path, unix.O_RDONLY|unix.O_DIRECT, 0)
```

For this FUSE filesystem, `O_DIRECT` bypasses Linux's page cache while still exercising Archil's in-process client cache. Archil accepts the 8-byte direct reads without imposing block-alignment requirements. Every returned byte is compared with the first read, and a short or changed read fails the reproduction.

## Cleanup

Unmount normally when finished:

```bash
sudo archil unmount /mnt/archil
```

Do not use `umount`; Archil's documented `archil unmount` command waits for pending writes to be synchronized.

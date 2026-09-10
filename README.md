# Archil FUSE cache expiry reproduction

Minimal timing reproduction for an Archil v0.8.35 client-cache issue: after a clean file-data page expires, repeated reads become substantially slower. Explicitly invalidating the page restores the initial performance.

This reproduction targets the Linux FUSE client and uses only Bash and standard GNU/Linux tools.

## Requirements

- Linux with Bash and GNU coreutils
- Archil CLI v0.8.35
- An Archil disk and mount token
- An existing file of at least 64 KiB on that disk
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

Run the reproduction as root so it can invoke `archil invalidate-cache`:

```bash
sudo ./reproduce.sh /mnt/archil/path/to/file.bin
```

It takes approximately 35 seconds. On an affected client, the output resembles:

```text
Fresh cache                               98 ms (100 reads)
Waiting 32s for page expiry...
After expiry                             225 ms (100 reads)
After explicit invalidation               96 ms (100 reads)
```

Exact timings vary by machine. The signal is that all repeated reads become slower after expiry and explicit invalidation restores performance.

## Why `iflag=nocache` is used

Normal repeated reads can be served entirely by Linux's page cache and never reach the Archil FUSE process. GNU `dd`'s `iflag=nocache` asks Linux to discard the selected input range from its page cache after each read. It does not use the global `/proc/sys/vm/drop_caches` control.

## Cleanup

Unmount normally when finished:

```bash
sudo archil unmount /mnt/archil
```

Do not use `umount`; Archil's documented `archil unmount` command waits for pending writes to be synchronized.

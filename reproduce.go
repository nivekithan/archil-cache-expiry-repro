package main

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"

	"golang.org/x/sys/unix"
)

const (
	readSize          = 8
	readsPerPhase     = 100
	expiryWaitSeconds = 32
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintf(os.Stderr, "Usage: sudo %s /mnt/archil/path/to/file\n", os.Args[0])
		os.Exit(2)
	}

	path := os.Args[1]
	fd, err := unix.Open(path, unix.O_RDONLY|unix.O_DIRECT, 0)
	if err != nil {
		fatal(err)
	}
	file := os.NewFile(uintptr(fd), path)
	defer file.Close()

	invalidateCache(path)
	expected := measureReads(file, "Fresh cache", nil)

	fmt.Printf("Waiting %ds for page expiry...\n", expiryWaitSeconds)
	time.Sleep(expiryWaitSeconds * time.Second)
	measureReads(file, "After expiry", expected)

	invalidateCache(path)
	measureReads(file, "After explicit invalidation", expected)
}

func measureReads(file *os.File, label string, expected []byte) []byte {
	buffer := make([]byte, readSize)
	started := time.Now()

	for readNumber := 0; readNumber < readsPerPhase; readNumber++ {
		bytesRead, err := file.ReadAt(buffer, 0)
		if err != nil && err != io.EOF {
			fatal(err)
		}
		if bytesRead != readSize {
			fatal(fmt.Errorf("short read: expected %d bytes, got %d", readSize, bytesRead))
		}
		if expected == nil {
			expected = append([]byte(nil), buffer...)
		} else if !bytes.Equal(buffer, expected) {
			fatal(fmt.Errorf("file contents changed during reproduction"))
		}
	}

	fmt.Printf("%-38s %6.2f ms (%d x %d-byte reads)\n",
		label, time.Since(started).Seconds()*1000, readsPerPhase, readSize)
	return expected
}

func invalidateCache(path string) {
	command := exec.Command("archil", "invalidate-cache", path)
	command.Stdout = io.Discard
	command.Stderr = os.Stderr
	if err := command.Run(); err != nil {
		fatal(err)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

//go:build !windows

package screens

import "syscall"

func init() {
	diskFree = unixDiskFree
}

func unixDiskFree(path string) (uint64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, err
	}
	return stat.Bavail * uint64(stat.Bsize), nil
}

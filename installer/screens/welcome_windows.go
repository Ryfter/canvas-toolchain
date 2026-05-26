//go:build windows

package screens

import (
	"syscall"
	"unsafe"
)

func init() {
	diskFree = winDiskFree
}

func winDiskFree(path string) (uint64, error) {
	kernel32, err := syscall.LoadDLL("kernel32.dll")
	if err != nil {
		return 0, err
	}
	proc, err := kernel32.FindProc("GetDiskFreeSpaceExW")
	if err != nil {
		return 0, err
	}
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, err
	}
	var freeBytesAvailable, totalBytes, totalFreeBytes uint64
	r1, _, err := proc.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFreeBytes)),
	)
	if r1 == 0 {
		return 0, err
	}
	return freeBytesAvailable, nil
}

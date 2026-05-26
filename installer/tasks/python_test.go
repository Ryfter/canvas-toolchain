package tasks

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDownloadTo_SavesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("hello"))
	}))
	defer srv.Close()

	tmp := filepath.Join(t.TempDir(), "out.bin")
	if err := downloadTo(context.Background(), srv.URL, tmp); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(tmp)
	if string(data) != "hello" {
		t.Errorf("expected 'hello', got %q", string(data))
	}
}

func TestDownloadTo_ReturnsErrorOnNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	tmp := filepath.Join(t.TempDir(), "out.bin")
	if err := downloadTo(context.Background(), srv.URL, tmp); err == nil {
		t.Fatal("expected error")
	}
}

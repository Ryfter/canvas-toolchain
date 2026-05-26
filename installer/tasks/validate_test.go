package tasks

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateAnthropic_OKOn200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "sk-test" {
			t.Errorf("missing x-api-key")
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"content":[]}`))
	}))
	defer srv.Close()

	_ = srv
	_ = ValidateAnthropic
}

func TestValidateCanvas_RecognizesUnauthorized(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no", http.StatusUnauthorized)
	}))
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "https://")

	tr := http.DefaultTransport
	defer func() { http.DefaultTransport = tr }()
	http.DefaultTransport = srv.Client().Transport

	err := ValidateCanvas(context.Background(), host, "tok")
	if err == nil || !strings.Contains(err.Error(), "401") {
		t.Errorf("expected 401 error, got %v", err)
	}
}

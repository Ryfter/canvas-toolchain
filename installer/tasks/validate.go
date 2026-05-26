package tasks

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const validateTimeout = 10 * time.Second

func ValidateAnthropic(ctx context.Context, apiKey, model string) error {
	if model == "" {
		model = "claude-haiku-4-5-20251001"
	}
	body, _ := json.Marshal(map[string]any{
		"model":      model,
		"max_tokens": 1,
		"messages":   []map[string]string{{"role": "user", "content": "."}},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	cli := &http.Client{Timeout: validateTimeout}
	resp, err := cli.Do(req)
	if err != nil {
		return fmt.Errorf("network: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("invalid API key (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("anthropic API returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func ValidateCanvas(ctx context.Context, host, token string) error {
	url := fmt.Sprintf("https://%s/api/v1/users/self", host)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+token)

	cli := &http.Client{Timeout: validateTimeout}
	resp, err := cli.Do(req)
	if err != nil {
		return fmt.Errorf("network: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("invalid Canvas token (HTTP 401)")
	}
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("canvas API returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func ValidatePanopto(ctx context.Context, domain, clientID, clientSecret string) error {
	form := fmt.Sprintf("grant_type=client_credentials&client_id=%s&client_secret=%s&scope=api", clientID, clientSecret)
	url := fmt.Sprintf("https://%s/Panopto/oauth2/connect/token", domain)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader([]byte(form)))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/x-www-form-urlencoded")

	cli := &http.Client{Timeout: validateTimeout}
	resp, err := cli.Do(req)
	if err != nil {
		return fmt.Errorf("network: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("panopto OAuth returned HTTP %d", resp.StatusCode)
	}
	return nil
}

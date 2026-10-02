// Copyright 2026 Kano. Licensed under the Apache License, Version 2.0.

package routers

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestKanoPublicIndexAssets(t *testing.T) {
	path := filepath.Join(t.TempDir(), "index.html")
	content := `<html lang="en"><head><title>Casdoor</title><link rel="icon" href="https://cdn.casbin.org/img/favicon.png" /></head><body></body></html>`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	theme := &OrganizationThemeCookie{Favicon: "https://example.com/org-icon.png", DisplayName: "Organization console"}
	for _, test := range []struct {
		path   string
		public bool
	}{
		{"/", true},
		{"/login/built-in", false},
		{"/account", false},
		{"/login/oauth/authorize?client_id=unchanged", false},
	} {
		t.Run(test.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			serveFileWithReplace(response, httptest.NewRequest("GET", test.path, nil), path, theme)
			body := response.Body.String()
			if test.public {
				for _, expected := range []string{"Kano 通行证", `href="/kano/favicon.svg"`, `imagesrcset=`, `imagesizes=`, `fetchpriority="high"`} {
					if !strings.Contains(body, expected) {
						t.Errorf("missing public asset metadata: %s", expected)
					}
				}
				if strings.Contains(body, "https://cdn.casbin.org") || strings.Contains(body, theme.Favicon) {
					t.Error("public homepage requested another organization's favicon")
				}
			} else if !strings.Contains(body, theme.Favicon) || !strings.Contains(body, theme.DisplayName) || strings.Contains(body, "hero-768.webp") {
				t.Error("non-public routes lost their existing organization branding")
			}
		})
	}
}

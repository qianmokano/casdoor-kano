// Copyright 2021 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package util

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsEmailDomainAllowed(t *testing.T) {
	scenarios := []struct {
		description    string
		email          string
		allowedDomains []string
		expected       bool
	}{
		{"Should allow any email when the list is empty", "a@gmail.com", []string{}, true},
		{"Should allow any email when the list is nil", "a@gmail.com", nil, true},
		{"Should allow an email whose domain is in the list", "a@example.com", []string{"example.com", "test.com"}, true},
		{"Should allow the second domain in the list", "a@test.com", []string{"example.com", "test.com"}, true},
		{"Should be case-insensitive on the email domain", "a@EXAMPLE.com", []string{"example.com"}, true},
		{"Should be case-insensitive on the list entry", "a@example.com", []string{"Example.COM"}, true},
		{"Should allow an entry with a leading @", "a@example.com", []string{"@example.com"}, true},
		{"Should allow an entry with surrounding spaces", "a@example.com", []string{" example.com "}, true},
		{"Should reject an email whose domain is not in the list", "a@gmail.com", []string{"example.com"}, false},
		{"Should reject a subdomain not explicitly listed", "a@mail.example.com", []string{"example.com"}, false},
		{"Should allow a subdomain when explicitly listed", "a@mail.example.com", []string{"example.com", "mail.example.com"}, true},
		{"Should ignore empty list entries", "a@example.com", []string{"", "@"}, false},
		{"Should reject an email without a domain", "a@", []string{"example.com"}, false},
		{"Should reject an email without @", "example.com", []string{"example.com"}, false},
		{"Should take the domain after the last @", "a@b@example.com", []string{"example.com"}, true},
	}

	for _, scenario := range scenarios {
		t.Run(scenario.description, func(t *testing.T) {
			actual := IsEmailDomainAllowed(scenario.email, scenario.allowedDomains)
			assert.Equal(t, scenario.expected, actual, "email: %q, allowedDomains: %v", scenario.email, scenario.allowedDomains)
		})
	}
}

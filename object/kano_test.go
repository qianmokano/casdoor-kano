// Copyright 2026 Kano. Licensed under the Apache License, Version 2.0.

package object

import (
	"errors"
	"testing"
)

func TestIsKanoCustomer(t *testing.T) {
	for _, tc := range []struct {
		user *User
		want bool
	}{
		{nil, false},
		{&User{Owner: "kano"}, true},
		{&User{Owner: "kano", IsAdmin: true}, false},
		{&User{Owner: "built-in"}, false},
		{&User{Owner: "other"}, false},
	} {
		if got := IsKanoCustomer(tc.user); got != tc.want {
			t.Fatalf("customer = %v, want %v", got, tc.want)
		}
	}
}

func TestCheckKanoProfileUpdate(t *testing.T) {
	old := &User{Owner: "kano", Name: "alice", Id: "stable-subject", Email: "alice@example.com", EmailVerified: true}
	for _, tc := range []struct {
		name    string
		mutate  func(*User)
		admin   bool
		wantErr bool
	}{
		{"nickname", func(u *User) { u.DisplayName = "Alice" }, false, false},
		{"avatar", func(u *User) { u.Avatar = "https://example.com/avatar.png" }, false, false},
		{"email", func(u *User) { u.Email = "other@example.com" }, false, true},
		{"verified", func(u *User) { u.EmailVerified = false }, false, true},
		{"owner", func(u *User) { u.Owner = "other" }, false, true},
		{"username", func(u *User) { u.Name = "other" }, false, true},
		{"subject", func(u *User) { u.Id = "other" }, false, true},
		{"administrator", func(u *User) { u.Email = "other@example.com" }, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			next := *old
			tc.mutate(&next)
			if err := CheckKanoProfileUpdate(old, &next, tc.admin); (err != nil) != tc.wantErr {
				t.Fatalf("unexpected result: %v", err)
			}
		})
	}
	if CheckKanoProfileUpdate(old, nil, false) == nil {
		t.Fatal("nil update accepted")
	}
	if err := CheckKanoProfileUpdate(nil, nil, false); err != nil {
		t.Fatal(err)
	}
	next := *old
	next.Email = "new@example.com"
	if !errors.Is(CheckKanoProfileUpdate(old, &next, false), ErrKanoEmailReadOnly) {
		t.Fatal("email policy error not returned")
	}
}

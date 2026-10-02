// Copyright 2026 Kano. Licensed under the Apache License, Version 2.0.
// Kano fork: customer identity policy; other organizations keep upstream behavior.

package object

import "errors"

var ErrKanoEmailReadOnly = errors.New("Your identity email is read-only. Please contact support to change it.")

func IsKanoCustomer(user *User) bool {
	return user != nil && user.Owner == "kano" && !user.IsAdmin
}

// CheckKanoProfileUpdate protects the identity tuple and verified email, including
// column-specific updates. Privileged updates still use the usual permission checks.
func CheckKanoProfileUpdate(oldUser, newUser *User, isAdmin bool) error {
	if !IsKanoCustomer(oldUser) || isAdmin {
		return nil
	}
	if newUser == nil {
		return errors.New("Invalid account update")
	}
	if oldUser.Email != newUser.Email || oldUser.EmailVerified != newUser.EmailVerified {
		return ErrKanoEmailReadOnly
	}
	if oldUser.Owner != newUser.Owner || oldUser.Name != newUser.Name || oldUser.Id != newUser.Id {
		return errors.New("Your account identity cannot be changed")
	}
	return nil
}

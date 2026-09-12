package auth

import (
	"context"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
	"github.com/avisi-cloud/acloud-playrooms/backend/terminal"
)

// Login opens a terminal running `acloud auth login`.
func Login(emulator terminal.Emulator) error {
	return terminal.Open(emulator, []string{"auth", "login"})
}

// Logout clears the credentials on the current context.
func Logout(ctx context.Context, operationID string) error {
	_, err := cli.Run(ctx, []string{"auth", "logout"}, cli.Options{OperationID: operationID})
	return err
}

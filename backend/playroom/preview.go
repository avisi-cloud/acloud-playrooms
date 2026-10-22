package playroom

import "github.com/avisi-cloud/acloud-playrooms/backend/cli"

// Each function returns the exact arguments its matching entry point executes —
// same builder, same value — so the preview cannot drift from what happens.

func PreviewCreate(input CreateInput) []string { return cli.ShellPreview(buildCreateArguments(input)) }
func PreviewUpdate(input UpdateInput) []string { return cli.ShellPreview(buildUpdateArguments(input)) }
func PreviewDelete(input DeleteInput) []string { return cli.ShellPreview(buildDeleteArguments(input)) }
func PreviewOpen(input OpenInput) []string     { return cli.ShellPreview(buildOpenArguments(input)) }
func PreviewConnect(input ConnectInput) []string {
	return cli.ShellPreview(buildConnectArguments(input))
}

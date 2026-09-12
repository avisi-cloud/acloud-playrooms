package playhouse

import "github.com/avisi-cloud/acloud-playrooms/backend/cli"

// These return the exact arguments the matching entry point executes, so the
// preview and the command that runs come from one value.

func PreviewCreate(input CreateInput) []string { return cli.Preview(buildCreateArguments(input)) }
func PreviewDelete(input DeleteInput) []string { return cli.Preview(buildDeleteArguments(input)) }

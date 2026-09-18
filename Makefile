-include .env.local

BINARY ?= acloud-playrooms
GORELEASER ?= goreleaser
LOCAL_ACLOUD ?= ../acloud/bin/acloud
LOCAL_ACLOUD_ABS := $(abspath $(LOCAL_ACLOUD))

# The application version is written down once, in build/config.yml, which is
# also what Wails reads when it packages the app.
CONFIG_VERSION := $(shell awk -F'"' '/^[[:space:]]*version:/ { value=$$2 } END { print value }' build/config.yml)
ifeq ($(strip $(VERSION)),)
VERSION := $(CONFIG_VERSION)
endif
COMMIT ?= $(shell git rev-parse HEAD)
BUILD_DATE ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
BUILD_BY ?= make
LDFLAGS = -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(BUILD_DATE) -X main.builtBy="$(BUILD_BY)"

WAILS_VERSION := $(shell go list -m -f '{{.Version}}' github.com/wailsapp/wails/v3)
GOBIN_DIR := $(shell go env GOBIN)
ifeq ($(GOBIN_DIR),)
GOBIN_DIR := $(shell go env GOPATH)/bin
endif
WAILS3 := $(GOBIN_DIR)/wails3
export PATH := $(GOBIN_DIR):$(PATH)

.DEFAULT_GOAL := build

tools:
	@if [ ! -x "$(WAILS3)" ] || ! "$(WAILS3)" version 2>&1 | grep -Fq "$(WAILS_VERSION)"; then \
		go install github.com/wailsapp/wails/v3/cmd/wails3@$(WAILS_VERSION); \
	fi

dev: tools
	"$(WAILS3)" dev -config ./build/config.yml

dev-local: tools
	@if [ ! -f "$(LOCAL_ACLOUD_ABS)" ] || [ ! -x "$(LOCAL_ACLOUD_ABS)" ]; then \
		echo "Local acloud binary not found or not executable: $(LOCAL_ACLOUD_ABS)"; \
		echo "Build it first in your acloud checkout, or pass LOCAL_ACLOUD=<your-path-to-acloud>/bin/acloud"; \
		exit 1; \
	fi
	ACLOUD_BINARY="$(LOCAL_ACLOUD_ABS)" "$(WAILS3)" dev -config ./build/config.yml

build: tools
	"$(WAILS3)" task common:build:frontend BUILD_FLAGS="-tags gui"
	CGO_ENABLED=1 go build -tags production,gui -ldflags "$(LDFLAGS)" -o bin/$(BINARY) ./main
	@if [ "$$(go env GOOS)" = "darwin" ]; then \
		"$(WAILS3)" task darwin:create:app:bundle APP_NAME="Acloud Playrooms" BIN_DIR=bin SOURCE_BINARY=bin/$(BINARY) VERSION="$(VERSION)"; \
	fi

test:
	go test -race -tags gui . ./backend/... ./main

vet:
	go vet -tags gui . ./backend/... ./main

fmt:
	git ls-files -z '*.go' | xargs -0 gofmt -w

fmt-check:
	@unformatted="$$(git ls-files -z '*.go' | xargs -0 gofmt -l)"; \
	if [ -n "$$unformatted" ]; then \
		printf 'Run make fmt to format these Go files:\n%s\n' "$$unformatted"; \
		exit 1; \
	fi

check:
	$(MAKE) fmt-check
	npm --prefix frontend run check
	$(MAKE) vet test

package: tools
	"$(WAILS3)" task darwin:package:universal VERSION="$(VERSION)"
	lipo "bin/Acloud Playrooms.app/Contents/MacOS/Acloud Playrooms" -verify_arch arm64 x86_64
	codesign --verify --deep --strict "bin/Acloud Playrooms.app"

release-snapshot:
	$(GORELEASER) release --snapshot --clean
	node scripts/generate-homebrew-cask.mjs
	bash scripts/verify-release.sh

clean:
	-rm -rf bin node_modules frontend/node_modules frontend/dist frontend/.angular frontend/.vite frontend/coverage .task icons.icns

.PHONY: tools dev dev-local build test vet fmt fmt-check check package release-snapshot clean

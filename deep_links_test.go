//go:build gui

package gui

import (
	"reflect"
	"testing"
)

func TestDeepLinksWaitForFrontendAndAreDeliveredOnceInOrder(t *testing.T) {
	var received []string
	delivery := &deepLinkDelivery{send: func(url string) { received = append(received, url) }}
	delivery.open("acloud-playrooms://rooms/ph/demo")
	delivery.open("acloud-playrooms://create?playhouse=ph")
	if len(received) != 0 {
		t.Fatal("delivered before frontend was ready")
	}
	delivery.frontendReady()
	delivery.frontendReady()
	delivery.open("acloud-playrooms://connect/ph/demo")
	want := []string{"acloud-playrooms://rooms/ph/demo", "acloud-playrooms://create?playhouse=ph", "acloud-playrooms://connect/ph/demo"}
	if !reflect.DeepEqual(received, want) {
		t.Fatalf("received %v, want %v", received, want)
	}
}

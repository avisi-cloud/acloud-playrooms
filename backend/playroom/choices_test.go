package playroom

import (
	"strings"
	"testing"
)

func TestCapabilitiesValidateAcceptsOnlyKnownProfiles(t *testing.T) {
	for _, capabilities := range []Capabilities{"", CapabilitiesMinimal, CapabilitiesStandard} {
		if err := capabilities.Validate(); err != nil {
			t.Errorf("Capabilities(%q).Validate() = %v, want nil", capabilities, err)
		}
	}
	if err := Capabilities("everything").Validate(); err == nil {
		t.Error(`Capabilities("everything").Validate() = nil, want an error`)
	}
}

func TestExposureValidateAcceptsOnlyKnownExposures(t *testing.T) {
	for _, exposure := range []Exposure{"", ExposureTailscale, ExposureNodePort, ExposurePortForward} {
		if err := exposure.Validate(); err != nil {
			t.Errorf("Exposure(%q).Validate() = %v, want nil", exposure, err)
		}
	}
	if err := Exposure("public").Validate(); err == nil {
		t.Error(`Exposure("public").Validate() = nil, want an error`)
	}
}

func TestCreateAndUpdateRefuseAnUnknownChoiceBeforeRunning(t *testing.T) {
	createError := validateCreateInput(CreateInput{Exposure: "public", Capabilities: "everything"})
	updateError := validateUpdateInput(UpdateInput{Exposure: "public", Capabilities: "everything"})
	for name, err := range map[string]error{"create": createError, "update": updateError} {
		if err == nil || !strings.Contains(err.Error(), "public") || !strings.Contains(err.Error(), "everything") {
			t.Errorf("%s validation = %v, want it to name both rejected values", name, err)
		}
	}
	if err := validateCreateInput(CreateInput{Exposure: ExposureTailscale, Capabilities: CapabilitiesMinimal}); err != nil {
		t.Errorf("validateCreateInput(valid) = %v, want nil", err)
	}
}

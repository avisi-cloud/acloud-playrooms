package playroom

import "fmt"

// Capabilities is the Linux capability profile for root inside a playroom (--capabilities).
type Capabilities string

const (
	CapabilitiesMinimal  Capabilities = "minimal"
	CapabilitiesStandard Capabilities = "standard"
)

// Validate accepts a known profile, or blank for "let acloud decide".
func (capabilities Capabilities) Validate() error {
	switch capabilities {
	case "", CapabilitiesMinimal, CapabilitiesStandard:
		return nil
	}
	return fmt.Errorf("capabilities %q is not one of %s, %s", capabilities, CapabilitiesMinimal, CapabilitiesStandard)
}

// Exposure is how a playroom's SSH is reachable (--exposure).
type Exposure string

const (
	ExposureTailscale   Exposure = "tailscale"
	ExposureNodePort    Exposure = "nodeport"
	ExposurePortForward Exposure = "portforward"
)

// Validate accepts a known exposure, or blank for "the playhouse default".
func (exposure Exposure) Validate() error {
	switch exposure {
	case "", ExposureTailscale, ExposureNodePort, ExposurePortForward:
		return nil
	}
	return fmt.Errorf("exposure %q is not one of %s, %s, %s", exposure, ExposureTailscale, ExposureNodePort, ExposurePortForward)
}

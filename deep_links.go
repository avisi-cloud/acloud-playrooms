//go:build gui

package gui

import "sync"

// Startup links wait until Angular has installed its listener.
type deepLinkDelivery struct {
	mutex   sync.Mutex
	ready   bool
	pending []string
	send    func(string)
}

func (delivery *deepLinkDelivery) open(url string) {
	delivery.mutex.Lock()
	defer delivery.mutex.Unlock()
	if !delivery.ready {
		delivery.pending = append(delivery.pending, url)
		return
	}
	delivery.send(url)
}

func (delivery *deepLinkDelivery) frontendReady() {
	delivery.mutex.Lock()
	defer delivery.mutex.Unlock()
	delivery.ready = true
	for _, url := range delivery.pending {
		delivery.send(url)
	}
	delivery.pending = nil
}

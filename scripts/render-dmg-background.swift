// Optional artwork regeneration on macOS; release builds use the committed TIFF.
// Run from the repository root: swift scripts/render-dmg-background.swift
import AppKit
import WebKit

final class ArtworkRenderer: NSObject, WKNavigationDelegate {
    let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 720, height: 480))
    var window: NSWindow!

    func start() {
        window = NSWindow(contentRect: view.frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.setFrameOrigin(NSPoint(x: -10000, y: -10000))
        window.contentView = view
        window.orderBack(nil)
        view.navigationDelegate = self
        view.loadFileURL(root.appendingPathComponent("build/darwin/dmg/background.html"), allowingReadAccessTo: root)
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { self.fail("Artwork rendering timed out") }
    }

    func fail(_ message: String) -> Never {
        fputs("\(message)\n", stderr)
        exit(1)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fail(error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fail(error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("Loaded installer artwork; waiting for local fonts and images")
        webView.callAsyncJavaScript("""
            await document.fonts.ready;
            await Promise.all(Array.from(document.images, image => image.decode()));
            const background = new Image();
            background.src = '../../../frontend/public/brand/AvisiBackground.webp';
            await background.decode();
            if (!document.fonts.check('600 32px Poppins')) throw new Error('Poppins did not load');
            return true;
            """, arguments: [:], in: nil, in: .page) { result in
            if case .failure(let error) = result { self.fail(error.localizedDescription) }
            let configuration = WKSnapshotConfiguration()
            configuration.snapshotWidth = 1440
            webView.takeSnapshot(with: configuration) { image, error in
                guard let image = image else { self.fail(error?.localizedDescription ?? "No snapshot") }
                do { try self.save(image) } catch { self.fail(error.localizedDescription) }
                print("Rendered build/darwin/dmg/background.png and background.tiff (1x + 2x)")
                exit(0)
            }
        }
    }

    func save(_ image: NSImage) throws {
        guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            fail("Cannot read artwork snapshot")
        }
        var representations: [NSBitmapImageRep] = []
        for scale in [1, 2] {
            let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 720 * scale,
                pixelsHigh: 480 * scale, bitsPerSample: 8, samplesPerPixel: 4,
                hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
            let context = NSGraphicsContext(bitmapImageRep: bitmap)!.cgContext
            context.interpolationQuality = .high
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: 720 * scale, height: 480 * scale))
            bitmap.size = NSSize(width: 720, height: 480)
            representations.append(bitmap)
            if scale == 1 {
                try bitmap.representation(using: .png, properties: [:])!.write(to: root.appendingPathComponent("build/darwin/dmg/background.png"))
            }
        }
        let tiff = NSBitmapImageRep.representationOfImageReps(in: representations, using: .tiff,
            properties: [.compressionMethod: NSBitmapImageRep.TIFFCompression.lzw.rawValue])!
        try tiff.write(to: root.appendingPathComponent("build/darwin/dmg/background.tiff"))
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
let renderer = ArtworkRenderer()
renderer.start()
application.run()

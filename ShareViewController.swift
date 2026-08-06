//
//  ShareViewController.swift
//  FamFeedShare (Share Extension target)
//
//  Entry point for the "Share to Fam Feed" action in the iOS share sheet.
//  Deliberately has NO compose UI (unlike Apple's default template) — it
//  just grabs whatever URL was shared, stashes it where the main app can
//  find it, shows a one-line confirmation, and hands control back to Fam
//  Feed so the person lands straight back in the app with the link ready
//  to save.
//
//  IMPORTANT — before this will build, replace APP_GROUP_ID below with your
//  own App Group identifier (must match exactly what you create in Xcode's
//  Signing & Capabilities for BOTH this extension target and the main app
//  target — see SHARE_EXTENSION_SETUP.md). A typical value looks like
//  "group.com.yourname.famfeed".
//
import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

// Change this to your own App Group identifier.
let APP_GROUP_ID = "group.com.yourname.famfeed"
// Key the main app's Capacitor plugin reads from — must match
// SharedContentPlugin.swift's SHARED_URL_KEY exactly.
let SHARED_URL_KEY = "famfeed_shared_url"
// Custom URL scheme registered in the main app's Info.plist (CFBundleURLTypes)
// — used purely to relaunch/foreground the host app after saving the link.
let HOST_APP_URL_SCHEME = "famfeed"

class ShareViewController: UIViewController {

    private let statusLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.systemBackground
        setupStatusLabel()
        handleSharedItem()
    }

    private func setupStatusLabel() {
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0
        statusLabel.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        statusLabel.text = "🍽️ Saving to Fam Feed…"
        view.addSubview(statusLabel)
        NSLayoutConstraint.activate([
            statusLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            statusLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            statusLabel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            statusLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
        ])
    }

    private func handleSharedItem() {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let attachments = item.attachments,
            !attachments.isEmpty
        else {
            finishWithMessage("⚠️ Nothing to share.")
            return
        }

        // TikTok/Instagram/Safari/etc. can hand this over as either a URL
        // attachment or plain text containing a URL — try both, URL first.
        let urlType = UTType.url.identifier
        let textType = UTType.plainText.identifier

        if let provider = attachments.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) }) {
            provider.loadItem(forTypeIdentifier: urlType, options: nil) { [weak self] (item, error) in
                let url = item as? URL
                DispatchQueue.main.async {
                    self?.saveAndFinish(urlString: url?.absoluteString)
                }
            }
        } else if let provider = attachments.first(where: { $0.hasItemConformingToTypeIdentifier(textType) }) {
            provider.loadItem(forTypeIdentifier: textType, options: nil) { [weak self] (item, error) in
                let text = item as? String
                let extracted = Self.firstURL(in: text ?? "")
                DispatchQueue.main.async {
                    self?.saveAndFinish(urlString: extracted)
                }
            }
        } else {
            finishWithMessage("⚠️ Couldn't find a link in that share.")
        }
    }

    // Pulls the first http(s) URL out of a block of shared plain text (some
    // apps share a caption + link together rather than a clean URL item).
    private static func firstURL(in text: String) -> String? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return nil
        }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let match = detector.firstMatch(in: text, options: [], range: range)
        return match?.url?.absoluteString
    }

    private func saveAndFinish(urlString: String?) {
        guard let urlString = urlString, !urlString.isEmpty else {
            finishWithMessage("⚠️ Couldn't find a link in that share.")
            return
        }

        if let defaults = UserDefaults(suiteName: APP_GROUP_ID) {
            defaults.set(urlString, forKey: SHARED_URL_KEY)
            defaults.synchronize()
        }

        finishWithMessage("✅ Saved — opening Fam Feed…")

        // Give the confirmation a beat to actually be seen, then hand off to
        // the main app and close the extension.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            self?.openHostApp()
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    private func finishWithMessage(_ message: String) {
        statusLabel.text = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    // Share Extensions don't have a UIApplication instance of their own, so
    // opening the host app means walking the responder chain to find one
    // that can — this is the standard, widely-used trick for this exact
    // scenario. `famfeed://shared` is just a signal; the actual payload was
    // already written to the App Group above.
    private func openHostApp() {
        guard let url = URL(string: "\(HOST_APP_URL_SCHEME)://shared") else { return }
        var responder: UIResponder? = self
        let selector = NSSelectorFromString("openURL:")
        while let current = responder {
            if current.responds(to: selector) {
                current.perform(selector, with: url)
                return
            }
            responder = current.next
        }
    }
}

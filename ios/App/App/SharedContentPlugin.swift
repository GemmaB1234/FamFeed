//
//  SharedContentPlugin.swift
//  Main app target (NOT the share extension)
//
//  Bridges the App Group's shared UserDefaults (written by the FamFeedShare
//  extension when someone shares a link into the app) into the web layer,
//  so index.html's JS can ask "is there a pending shared link?" and clear
//  it once it's been read into the Add Idea form. Registered with Capacitor
//  via the CAP_PLUGIN macro in SharedContentPlugin.m alongside this file —
//  both files need to be added to the MAIN app target, not the extension.
//
//  IMPORTANT — appGroupId below must exactly match APP_GROUP_ID in
//  ShareViewController.swift, and both must match whatever you name the App
//  Group capability in Xcode for BOTH the main app and extension targets
//  (see SHARE_EXTENSION_SETUP.md).
//
import Foundation
import Capacitor

@objc(SharedContentPlugin)
public class SharedContentPlugin: CAPPlugin {
    private let appGroupId = "group.com.gemma.famfeed"
    private let sharedURLKey = "famfeed_shared_url"

    // Returns { url: "..." } — url is "" when nothing's pending.
    @objc func getSharedURL(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: appGroupId)
        let url = defaults?.string(forKey: sharedURLKey) ?? ""
        call.resolve(["url": url])
    }

    // Called once the JS side has read the value into the form, so the
    // same link doesn't get re-applied next time the app opens.
    @objc func clearSharedURL(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: appGroupId)
        defaults?.removeObject(forKey: sharedURLKey)
        call.resolve()
    }
}

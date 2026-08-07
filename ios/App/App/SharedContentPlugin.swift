import Foundation
import Capacitor

@objc(SharedContentPlugin)
public class SharedContentPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedContentPlugin"
    public let jsName = "SharedContent"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSharedURL", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSharedURL", returnType: CAPPluginReturnPromise)
    ]

    private let appGroupId = "group.com.gemma.famfeed"
    private let sharedURLKey = "famfeed_shared_url"

    @objc func getSharedURL(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: appGroupId)
        let url = defaults?.string(forKey: sharedURLKey) ?? ""
        call.resolve(["url": url])
    }

    @objc func clearSharedURL(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: appGroupId)
        defaults?.removeObject(forKey: sharedURLKey)
        call.resolve()
    }
}

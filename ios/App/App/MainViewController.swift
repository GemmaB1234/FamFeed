import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        print("🔌🔌🔌 capacitorDidLoad CALLED")
        if bridge == nil {
            print("🔌🔌🔌 bridge is NIL")
        } else {
            print("🔌🔌🔌 bridge exists — registering plugin now")
            bridge?.registerPluginType(SharedContentPlugin.self)
            print("🔌🔌🔌 registerPluginType finished")
        }
    }
}

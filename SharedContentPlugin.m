#import <Capacitor/Capacitor.h>

CAP_PLUGIN(SharedContentPlugin, "SharedContent",
  CAP_PLUGIN_METHOD(getSharedURL, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(clearSharedURL, CAPPluginReturnPromise);
)
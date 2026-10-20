import AppKit

// Started by Chrome as the companion extension's native-messaging host.
if ChromeHost.isHostLaunch(CommandLine.arguments) {
  ChromeHost.run(origin: CommandLine.arguments[1])
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()

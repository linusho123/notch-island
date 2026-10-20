import CoreAudio
import Foundation
import IslandCore

/// The output-device name for the source line (D4, D119, D120): the system's
/// default audio output, followed through its change notifications (no
/// polling). In a test build the harness may stand in a device name, such as
/// a Bluetooth speaker `JBL Flip 5`, through the test input (BUILD-PLAN Q2).
final class OutputDeviceWatcher {
  /// Called on the main thread whenever the output device changes.
  var onChange: ((OutputDevice?) -> Void)?
  private(set) var current: OutputDevice?

  func start() {
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultOutputDevice,
      mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    AudioObjectAddPropertyListenerBlock(
      AudioObjectID(kAudioObjectSystemObject), &address, DispatchQueue.main
    ) { [weak self] _, _ in self?.refresh() }
    TestInput.onChange { [weak self] in self?.refresh() }
    refresh()
  }

  func refresh() {
    let device = TestInput.outputDevice ?? Self.systemDefault()
    guard device != current else { return }
    current = device
    onChange?(device)
  }

  static func systemDefault() -> OutputDevice? {
    var id = AudioObjectID(0)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultOutputDevice,
      mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    guard
      AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &id) == noErr,
      id != 0
    else { return nil }
    var name: Unmanaged<CFString>?
    size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    address.mSelector = kAudioObjectPropertyName
    guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &name) == noErr,
      let name = name?.takeRetainedValue() as String?
    else { return nil }
    var transport = UInt32(0)
    size = UInt32(MemoryLayout<UInt32>.size)
    address.mSelector = kAudioDevicePropertyTransportType
    _ = AudioObjectGetPropertyData(id, &address, 0, nil, &size, &transport)
    return OutputDevice(name: name, isBuiltIn: transport == kAudioDeviceTransportTypeBuiltIn)
  }
}

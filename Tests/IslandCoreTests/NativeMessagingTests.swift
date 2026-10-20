import Foundation
import Testing

@testable import IslandCore

/// The companion extension's native messaging (D126): framing, the one
/// origin the host accepts, and what of a tab's report the island takes.
struct NativeMessagingTests {
  @Test func onlyTheCompanionExtensionIsAccepted() {
    #expect(NativeMessaging.isAllowedOrigin("chrome-extension://iibgeapdjhifkjdbhpehkdpjejakjnfh/"))
    #expect(
      !NativeMessaging.isAllowedOrigin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"))
    #expect(!NativeMessaging.isAllowedOrigin("chrome-extension://iibgeapdjhifkjdbhpehkdpjejakjnfh"))
    #expect(!NativeMessaging.isAllowedOrigin(""))
  }

  @Test func framesRoundTripAndWaitForWholeMessages() throws {
    let a = Data(#"{"type":"tabs"}"#.utf8)
    let b = Data(#"{"x":1}"#.utf8)
    var buffer = NativeMessaging.frame(a) + NativeMessaging.frame(b)
    let tail = buffer.suffix(3)
    buffer.removeLast(3)
    #expect(NativeMessaging.unframe(&buffer) == [a])
    buffer.append(tail)
    #expect(NativeMessaging.unframe(&buffer) == [b])
    #expect(buffer.isEmpty)
  }

  @Test func anOversizedLengthIsRefused() {
    var length = UInt32(NativeMessaging.maxMessage + 1).littleEndian
    var buffer = Data(bytes: &length, count: 4)
    #expect(NativeMessaging.unframe(&buffer) == nil)
  }

  @Test func aTabReportIsReadAndOtherSitesAreDropped() {
    let tab = ChromeTab.parse([
      "tab": 7, "site": "YouTube", "title": "Lecture 4: Fourier Series", "duration": 3000,
      "position": 754.5, "playing": true,
    ])
    #expect(tab?.title == "Lecture 4: Fourier Series")
    #expect(tab?.playing == true)
    #expect(ChromeTab.parse(["tab": 8, "site": "News", "title": "clip"]) == nil)
    #expect(ChromeTab.parse(["site": "YouTube"]) == nil)
  }
}

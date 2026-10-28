import Foundation
import HarnessCore
import Testing

@Suite struct CaptureReferenceTests {
  @Test func nativeScreenshotControlColoursRemainRecognizable() {
    // FU's native screenshots on this Mac; SCK gives nearly pure RGB.
    // Both halves were physically present despite the old zero score.
    #expect(
      CaptureControlColor.matches(red: 0.5094474, green: 0.9654517, blue: 0.3682771, left: true))
    #expect(
      CaptureControlColor.matches(red: 0.9411744, green: 0.3449992, blue: 0.9725973, left: false))
    #expect(CaptureControlColor.matches(red: 0, green: 0.992, blue: 0, left: true))
    #expect(CaptureControlColor.matches(red: 0.996, green: 0, blue: 0.996, left: false))
  }

  @Test func missingOrSwappedControlCannotPass() {
    for left in [false, true] {
      for grey in [0.0, 0.5, 1.0] {
        #expect(!CaptureControlColor.matches(red: grey, green: grey, blue: grey, left: left))
      }
    }
    #expect(!CaptureControlColor.matches(red: 0, green: 0.5, blue: 0, left: true))
    #expect(!CaptureControlColor.matches(red: 0.5, green: 0, blue: 0.5, left: false))
    #expect(!CaptureControlColor.matches(red: 1, green: 0, blue: 1, left: true))
    #expect(!CaptureControlColor.matches(red: 0, green: 1, blue: 0, left: false))
  }

  @Test func movieUsesItsLastPreActionFrameAndCannotLearnALeakAsReference() {
    var reference = CaptureRecordingReference<String>()
    #expect(reference.frame == nil)
    reference.observe("native closed", captured: 1, actionStart: 2)
    reference.observe("latest native closed", captured: 1.9, actionStart: 2)
    reference.observe("island leaking", captured: 2, actionStart: 2)
    reference.observe("later island leaking", captured: 3, actionStart: 2)
    reference.observe("late old frame", captured: 1.95, actionStart: 2)
    #expect(reference.frame == "latest native closed")
  }

  @Test func movieWithoutAPreActionFrameHasNoReference() {
    var reference = CaptureRecordingReference<String>()
    reference.observe("island leaking", captured: 2, actionStart: 2)
    #expect(reference.frame == nil)
  }
}

@Suite struct CaptureWorkTests {
  @Test @MainActor func blockingScreenshotDoesNotFreezeTheControlClock() async {
    var ticks = 0
    let pulse = Task { @MainActor in
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 10_000_000)
        ticks += 1
      }
    }
    let result = await CaptureWork.run {
      Thread.sleep(forTimeInterval: 0.15)
      return 42
    }
    let observed = ticks
    pulse.cancel()
    #expect(result == 42)
    #expect(observed > 0)
  }
}

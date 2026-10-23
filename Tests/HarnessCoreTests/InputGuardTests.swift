import Foundation
import Testing

@testable import HarnessCore

/// The input guard tells the harness's own posted events from the
/// visionary's real keyboard and trackpad input (Sharing the Mac): every
/// event the harness posts carries its tag in the event's source user data;
/// any input event without it is the visionary's, and voids the run.
struct InputGuardTests {
  @Test func anEventCarryingTheHarnessTagIsTheHarnesss() {
    for type in [UInt32(1), 2, 5, 6, 10, 11, 22] {
      #expect(InputGuard.origin(type: type, userData: InputGuard.tag, subtype: nil) == .harness)
    }
  }

  @Test func untaggedKeyboardAndPointerInputIsReal() {
    // key down/up, modifier change, clicks, moves, drags, scrolls.
    for type in [UInt32(10), 11, 12, 1, 2, 3, 4, 5, 6, 7, 22, 25, 26, 27] {
      #expect(InputGuard.origin(type: type, userData: 0, subtype: nil) == .real, "type \(type)")
    }
  }

  @Test func aTrackpadTouchWithoutMovingIsReal() {
    // A finger resting on the trackpad sends gesture events (29) only.
    #expect(InputGuard.origin(type: 29, userData: 0, subtype: nil) == .real)
    #expect(InputGuard.origin(type: 29, userData: InputGuard.tag, subtype: nil) == .harness)
  }

  @Test func anotherTagIsNotTheHarnesss() {
    #expect(InputGuard.origin(type: 5, userData: InputGuard.tag + 1, subtype: nil) == .real)
  }

  @Test func mediaAndAuxKeysAreRealButOtherSystemEventsAreNotInput() {
    // System-defined events (14): subtype 8 is a media or special key, 7 an
    // extra mouse button; others are the system's own notices.
    #expect(InputGuard.origin(type: 14, userData: 0, subtype: 8) == .real)
    #expect(InputGuard.origin(type: 14, userData: 0, subtype: 7) == .real)
    #expect(InputGuard.origin(type: 14, userData: InputGuard.tag, subtype: 8) == .harness)
    #expect(InputGuard.origin(type: 14, userData: 0, subtype: 1) == .notInput)
    #expect(InputGuard.origin(type: 14, userData: 0, subtype: nil) == .notInput)
  }

  @Test func tapNoticesAndNullEventsAreNotInput() {
    // The tap disabled by a timeout or by user input, and the null event.
    for type in [UInt32(0xFFFF_FFFE), 0xFFFF_FFFF, 0] {
      #expect(InputGuard.origin(type: type, userData: 0, subtype: nil) == .notInput)
    }
  }

  @Test func theTagIsNotZero() {
    #expect(InputGuard.tag != 0)
  }

  // The idle clock catches input the tap cannot see (keys typed into a
  // password field reach no event tap): the system's HIDIdleTime counts from
  // the last input of any kind, so if it is clearly shorter than the time
  // since the harness's own last event, someone else made input.
  @Test func anIdleClockShorterThanTheHarnesssLastEventMeansRealInput() {
    #expect(InputGuard.idleShowsRealInput(hidIdleMs: 50, msSinceHarnessEvent: 2000))
  }

  @Test func anIdleClockAsLongAsTheHarnesssQuietIsNotInput() {
    // The harness's own events reset the clock or they do not: either way the
    // clock is at least as long as the quiet since the last of them.
    #expect(!InputGuard.idleShowsRealInput(hidIdleMs: 2000, msSinceHarnessEvent: 2000))
    #expect(!InputGuard.idleShowsRealInput(hidIdleMs: 190_000, msSinceHarnessEvent: 500))
  }

  @Test func theIdleClockHasSlackForTheHarnesssOwnEventsInFlight() {
    // An event the harness posted a moment before the tap saw it.
    #expect(!InputGuard.idleShowsRealInput(hidIdleMs: 1800, msSinceHarnessEvent: 2000))
    #expect(InputGuard.idleShowsRealInput(hidIdleMs: 1000, msSinceHarnessEvent: 2000))
  }
}

import Foundation
import Testing

@testable import IslandCore

/// Tabs of two Chromes with the extension are told apart, and one Chrome
/// leaving drops only its own tabs (P2 fix S4).
struct ChromeTabBookTests {
  @Test func theSameTabIdInTwoChromesIsTwoSources() {
    #expect(ChromeTabBook.id(connection: 1, tab: 7) != ChromeTabBook.id(connection: 2, tab: 7))
  }

  @Test func oneChromeLeavingDropsOnlyItsOwnTabs() {
    var book = ChromeTabBook()
    _ = book.apply(connection: 1, tabs: [7])
    _ = book.apply(connection: 2, tabs: [7, 8])
    let gone = book.close(connection: 2)
    #expect(
      Set(gone) == [
        ChromeTabBook.id(connection: 2, tab: 7), ChromeTabBook.id(connection: 2, tab: 8),
      ])
    #expect(book.ids == [ChromeTabBook.id(connection: 1, tab: 7)])
  }

  @Test func aReportFromOneChromeNeverDropsAnotherChromesTabs() {
    var book = ChromeTabBook()
    _ = book.apply(connection: 1, tabs: [7])
    let gone = book.apply(connection: 2, tabs: [])
    #expect(gone.isEmpty)
    #expect(book.ids == [ChromeTabBook.id(connection: 1, tab: 7)])
  }

  @Test func aTabThatStopsCountingGoesFromItsOwnChromeOnly() {
    var book = ChromeTabBook()
    _ = book.apply(connection: 1, tabs: [7])
    _ = book.apply(connection: 2, tabs: [7])
    let gone = book.apply(connection: 1, tabs: [])
    #expect(gone == [ChromeTabBook.id(connection: 1, tab: 7)])
    #expect(book.ids == [ChromeTabBook.id(connection: 2, tab: 7)])
  }
}

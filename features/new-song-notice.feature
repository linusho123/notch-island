Feature: The new-song notice
  Each time a new song starts with the island closed, a small wing slides
  out to the left of the notch inside the menu bar strip within a second,
  with the cover art and as much of the title as fits, and folds back on its
  own after four seconds. It never covers an app menu or a status icon and
  never reaches right of the notch, where the visionary's own status bar
  goes. With less room the title goes first and the art shows alone; when
  even the art does not fit, nothing pops. There is no playing indicator and
  no card below the notch. The island lives only at the built-in screen's
  notch, even with an external monitor connected, and no wing pops while an
  app is fullscreen, so a fullscreen movie is never interrupted.

  @D115 @D113 @D147
  Scenario: A new song slides a small wing out left of the notch
    Given the island is closed and Apple Music is near the end of "Wonderwall" with "Champagne Supernova" next
    And Chrome is in front, leaving 139.5 points free between its Help menu and the notch
    When "Wonderwall" ends and "Champagne Supernova" starts
    Then the visionary sees the cover art and "Champagne Sup…" in a wing left of the notch
    And the visionary sees nothing of the island right of the notch, and no playing indicator

  @D115
  Scenario Outline: The wings checked <after> after a new song starts
    Given the island is closed and "Champagne Supernova" has just started after "Wonderwall"
    When the visionary waits <after> with the pointer away from the notch
    Then the visionary sees <state>

    Examples:
      | after       | state                                          |
      | 1 second    | the wing still out left of the notch           |
      | 3.5 seconds | the wing still out left of the notch           |
      | 4.5 seconds | the wing folded back into the plain notch      |
      | 1 minute    | the plain notch, with no wing                  |

  @D78
  Scenario Outline: A new song in <source> brings the wing out within a second
    Given the island is closed and <source> is playing <first>
    When <second> starts in <source>
    Then the visionary sees the wing out left of the notch within 1 second of <second> starting

    Examples:
      | source                               | first                       | second                          |
      | Apple Music                          | "Wonderwall"                | "Champagne Supernova"           |
      | Apple Music out through "JBL Flip 5" | "Wonderwall"                | "Champagne Supernova"           |
      | a youtube.com playlist in Chrome     | "Lecture 4: Fourier Series" | "Lecture 5: Laplace Transforms" |
      | a soundcloud.com tab in Chrome       | "late night mix"            | "sunrise mix"                   |
      | IINA                                 | "part-1.mkv"                | "part-2.mkv"                    |
      | QuickTime Player                     | "holiday.mov"               | "holiday-2.mov"                 |
      | Music                                | "demo-take-2.wav"           | "demo-take-3.mp3"               |

  @D44
  Scenario Outline: <count> songs starting about a second apart keep the wing out
    Given the island is closed and the wing is out for "Champagne Supernova"
    When <count> more songs start one after another, about 1 second apart
    Then the visionary sees the wing stay out the whole time, never folding in between
    And the visionary sees the title in the wing change with each new song
    And the visionary sees the wing fold back 4 seconds after the last song started

    Examples:
      | count |
      | 2     |
      | 5     |
      | 20    |

  @D114 @D113 @D147
  Scenario Outline: The new-song notice finds room: <where>
    Given the island is closed and the free gap left of the notch <left>
    When "Champagne Supernova" starts
    Then the visionary sees <shown>
    And the visionary sees nothing of the island right of the notch
    And the visionary sees every app menu and status icon uncovered

    Examples:
      | where                    | left                                                | shown                                                                          |
      | the whole title          | is wider than the cover art and the whole title     | the cover art and "Champagne Supernova" in a wing left of the notch           |
      | the title shortened      | is 139.5 points wide, as with Chrome in front       | the cover art and "Champagne Sup…" in a wing left of the notch                |
      | the art alone            | holds the cover art but no letters of the title     | the cover art alone in a wing left of the notch, with no title                |
      | nothing, art too wide    | is too narrow for the cover art                     | the plain notch, with no wing and no card below it                            |
      | nothing, menus reach it  | is full of menus up to the notch                    | the plain notch, with no wing and no card below it                            |

  @D28
  Scenario: Moving onto the notch while the wing is out opens the full panel
    Given the wing is out for "Champagne Supernova"
    When the visionary rests the pointer on the notch
    Then the visionary sees the island open downward into the full panel showing "Champagne Supernova"
    And the visionary sees the back, pause and skip buttons

  @D115
  Scenario: With an external monitor connected, the wing still pops at the built-in notch
    Given an external monitor is connected as an extended display and the visionary is working in Chrome on it
    And the island is closed and "Wonderwall" is near its end with "Champagne Supernova" next
    When "Champagne Supernova" starts
    Then the visionary sees the wing come out left of the built-in screen's notch
    And the visionary sees nothing of the island on the external monitor

  @D125 @D100
  Scenario: A new song in fullscreen pops no wing
    Given IINA is playing a movie fullscreen, the menu bar is hidden and the notch area is black
    When "Champagne Supernova" starts in Apple Music
    Then the visionary sees the notch area stay black, with no wing beside it
    And the visionary sees the movie play on, uninterrupted

  @D139 @D138 @D147
  Scenario: The wing slides out of the notch's left edge and back in
    Given the island is closed and Apple Music is near the end of "Wonderwall" with "Champagne Supernova" next
    And Chrome is in front, leaving 139.5 points free between its Help menu and the notch
    When "Wonderwall" ends and "Champagne Supernova" starts
    Then the visionary sees the wing grow leftward out of the notch's left edge over about 0.4 seconds rather than appear at once
    And the visionary sees the wing never reach past its 139.5-point gap, even mid-bounce
    And the visionary sees the wing slide back into the notch's edge when it folds, rather than vanish

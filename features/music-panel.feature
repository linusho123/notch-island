Feature: The music panel
  The camera notch of the visionary's MacBook Air is a closed island. Resting
  the pointer on it for about a sixth of a second, or clicking it, opens the
  island downward on the music page: the current song, its source line, a
  progress bar, and back, pause and skip. A sweep across the notch on the
  way to a status icon opens nothing. The island waits a moment before
  closing when the pointer slips off, and never closes in the middle of a
  drag. A right-click offers one thing only: Quit.

  @D18 @D51 @D137
  Scenario: Resting the pointer on the notch opens the music panel
    Given Apple Music is playing "Wonderwall" by Oasis and the island is closed to the plain notch
    When the visionary rests the trackpad pointer on the notch for about 0.15 seconds
    Then the visionary sees the island start opening downward by the end of the rest, then showing "Wonderwall" and "Oasis" once it has settled
    And the visionary sees three buttons on it: back, pause and skip

  @D51 @D137
  Scenario Outline: Resting the pointer on the notch for <rest> opens the island
    Given Apple Music is playing "Wonderwall" and the island is closed to the plain notch
    When the visionary rests the pointer on the notch for <rest>
    Then the visionary sees the island start opening by the end of the rest, then settle on the music page

    Examples:
      | rest              |
      | about 0.15 seconds |
      | 2 seconds         |

  @D51 @D99
  Scenario: Sweeping across the notch without resting opens nothing
    Given Chrome is in front and the island is closed to the plain notch
    When the visionary sweeps the pointer from Chrome's Help menu across the notch to the Wi-Fi icon without resting
    Then the visionary sees the notch stay plain the whole way across, with nothing opening

  @D74 @D137
  Scenario: Clicking the closed notch opens the island at once
    Given Apple Music is playing "Wonderwall" and the island is closed to the plain notch
    When the visionary clicks the notch the moment the pointer reaches it
    Then the visionary sees the island start opening at once, without waiting for a rest, then settle on the music page

  @D74 @D52
  Scenario: An island opened by a click closes as after a hover
    Given the visionary opened the island by clicking the notch
    When the visionary moves the pointer off the island for 2 seconds
    Then the visionary sees the island close back to the plain notch

  @D19
  Scenario: Pause stops the music and becomes play
    Given the island is open over "Wonderwall" playing at 1:40
    When the visionary clicks pause
    Then the visionary hears "Wonderwall" stop at 1:40
    And the visionary sees the pause button turned into a play button

  @D19
  Scenario: Play resumes from the same spot
    Given "Wonderwall" was paused at 1:40 from the island and the island is open showing play
    When the visionary clicks play
    Then the visionary hears "Wonderwall" carry on from 1:40, not from the start

  @D124
  Scenario: A pause Apple Music ignores leaves the pause button showing
    Given the island is open over "Wonderwall" playing in Apple Music at 1:40
    And Apple Music ignores the pause the island sends it
    When the visionary clicks pause
    Then the visionary hears "Wonderwall" keep playing
    And the visionary sees the pause button still showing, never turned into play
    And the visionary sees no shake and no message on the island

  @D124
  Scenario: A seek Apple Music ignores leaves the progress dot where playback really is
    Given the island is open over "Wonderwall" playing in Apple Music at 1:40
    And Apple Music ignores the seek the island sends it
    When the visionary drags the progress dot to 3:00 and lets go
    Then the visionary hears "Wonderwall" carry on from about 1:40, not from 3:00
    And the visionary sees the progress dot at the position Apple Music is really playing, not at 3:00

  @D20
  Scenario: Skip plays the next song in the queue
    Given the island is open over "Wonderwall" with "Champagne Supernova" next in the Apple Music queue
    When the visionary clicks skip
    Then the visionary hears "Champagne Supernova" start
    And the visionary sees "Champagne Supernova" on the island in place of "Wonderwall"

  @D112
  Scenario Outline: Back at <position> into Wonderwall plays <song> from the start
    Given the Apple Music queue has "Don't Look Back in Anger" just before "Wonderwall"
    And the island is open over "Wonderwall" playing at <position>
    When the visionary clicks back
    Then the visionary hears <song> playing from 0:00
    And the visionary sees <song> on the island

    Examples:
      | position | song                       |
      | 1:40     | "Wonderwall"               |
      | 0:04     | "Wonderwall"               |
      | 0:03     | "Don't Look Back in Anger" |
      | 0:02     | "Don't Look Back in Anger" |
      | 0:00     | "Don't Look Back in Anger" |

  @D24
  Scenario: The panel shows a downloaded file with no cover art and no artist
    Given IINA is playing the downloaded file "concert_2019_final_v2.mkv", with no cover art and no artist, at 1:12:05 of 2:03:40
    And its sound goes out through the Bluetooth speaker "JBL Flip 5"
    When the visionary rests the pointer on the notch and the island opens
    Then the visionary sees a music-note placeholder where the cover art would be
    And the visionary sees the filename cut short with an ellipsis
    And the visionary sees the source line "IINA · JBL Flip 5"
    And the visionary sees a progress bar reading 1:12:05 elapsed of 2:03:40
    And the visionary sees the back, pause and skip buttons

  @D25 @D24
  Scenario Outline: Moving the progress dot by <how> to <target> jumps the concert file there
    Given the island is open over "concert_2019_final_v2.mkv" playing in IINA at 1:12:05 of 2:03:40
    When the visionary moves playback by <how> to <target>
    Then the visionary hears the concert carry on from <target>
    And the visionary sees the elapsed time read <target> of 2:03:40

    Examples:
      | how                     | target  |
      | dragging the dot        | 1:45:00 |
      | clicking the bar        | 1:45:00 |
      | dragging the dot back   | 0:30:00 |
      | clicking the bar's start | 0:00:00 |

  @D26
  Scenario Outline: Clicking the <part> brings <front> to the front
    Given <source> is playing while Messages is in front
    When the visionary opens the island and clicks its <part>
    Then the visionary sees <front> come to the front over Messages

    Examples:
      | part        | source                                                     | front                                                    |
      | source line | "Wonderwall" in Apple Music                                | the Apple Music window                                   |
      | cover art   | a youtube.com video in a Chrome tab behind a Gmail tab     | Chrome showing that youtube.com tab, not the Gmail tab   |
      | source line | a soundcloud.com track in a Chrome tab behind a Gmail tab  | Chrome showing that soundcloud.com tab, not the Gmail tab |

  @D52
  Scenario Outline: The pointer leaving the open island for <away>
    Given the island is open over "Wonderwall" because the pointer is on it
    When the visionary moves the pointer off the island for <away>
    Then the visionary sees the island <state>

    Examples:
      | away                         | state                          |
      | 0.2 seconds and back onto it | still open on the music page   |
      | 2 seconds                    | closed back to the plain notch |

  @D52
  Scenario Outline: Dragging <what> far from the island keeps it open until let go
    Given the island is open on <page>
    When the visionary drags <what> with the pointer down to the Dock, without letting go
    Then the visionary sees the island stay open for as long as the drag is under way

    Examples:
      | what                        | page                                             |
      | the progress dot            | the music page over "concert_2019_final_v2.mkv" |
      | the parked "tax-return.pdf" | the shelf page                                   |

  @D76
  Scenario Outline: With an external mouse, the visionary <action> as with the trackpad
    Given an external mouse is connected and Apple Music is playing "Wonderwall"
    And the island is <before>
    When the visionary <action>
    Then the visionary sees <result>

    Examples:
      | before                    | action                                                      | result                                                            |
      | closed to the plain notch | rests the mouse pointer on the notch for about 0.15 seconds | the island open on the music page                                 |
      | closed to the plain notch | clicks the notch with the mouse                             | the island open at once on the music page                         |
      | open on the music page    | turns the mouse wheel down on the island                    | the shelf page come up from below, as with a two-finger scroll    |

  @D31
  Scenario: With nothing playing, the music page offers the last song paused and ready
    Given nothing is playing or paused, and the last song the visionary played was "Wonderwall" in Apple Music
    When the visionary rests the pointer on the notch
    Then the visionary sees the island open on the music page showing "Wonderwall" paused, with a play button

  @D31
  Scenario: Play on the last song starts it again
    Given nothing is playing and the island is open over "Wonderwall", paused and ready
    When the visionary clicks play
    Then the visionary hears "Wonderwall" start playing in Apple Music

  @D90
  Scenario: Before any song has ever played, the music page reads Nothing played yet
    Given no song has played since the island was installed
    When the visionary rests the pointer on the notch
    Then the visionary sees the music page read "Nothing played yet"
    And the visionary sees back, play and skip greyed out

  @D31 @D90
  Scenario Outline: Scrolling down reaches the shelf when <history>
    Given <history> and nothing is playing
    And the island is open on the music page
    When the visionary scrolls down with two fingers
    Then the visionary sees the shelf page come up from below

    Examples:
      | history                                         |
      | the last song played was "Wonderwall"           |
      | no song has played since the island was installed |

  @D86
  Scenario: Right-clicking the notch offers only Quit
    Given the island is running
    When the visionary right-clicks the notch
    Then the visionary sees a menu whose single item is "Quit"

  @D86
  Scenario: Picking Quit stops the island
    Given the visionary has right-clicked the notch
    When the visionary picks "Quit"
    And the visionary then rests the pointer on the notch for 2 seconds while "Wonderwall" plays
    Then the visionary sees the plain notch, with nothing opening

  @D86 @D60
  Scenario: After Quit, the next login starts the island again
    Given the visionary quit the island from the notch's menu
    When the visionary logs out and logs back in
    And the visionary rests the pointer on the notch while "Wonderwall" plays
    Then the visionary sees the island open on the music page

  @D125
  Scenario: In fullscreen, resting on the notch still opens the panel
    Given IINA is playing a movie fullscreen, the menu bar is hidden and the notch area is black
    And Apple Music is playing "Wonderwall"
    When the visionary rests the pointer on the notch
    Then the visionary sees the music panel open showing "Wonderwall"

  @D135 @D136
  Scenario: The open island stays as wide as the notch inside the menu bar
    Given Apple Music is playing "Wonderwall" and the island is closed to the plain notch
    And Chrome is in front with its Help menu left of the notch, and a status item sits right of the notch as Meter's readings do
    When the visionary rests the pointer on the notch, the island opens, and later the pointer leaves it
    Then the visionary sees the island no wider than the notch inside the menu bar strip at every moment while it opens, stays open and closes
    And the visionary sees Chrome's Help menu and the status item right of the notch uncovered the whole time
    And the visionary sees the full-width panel only below the menu bar strip, joined to the notch

  @D137 @D138
  Scenario: Opening springs out of the notch and settles
    Given Apple Music is playing "Wonderwall" and the island is closed to the plain notch
    When the visionary rests the pointer on the notch
    Then the visionary sees the island grow out of the notch's own shape over about 0.4 seconds rather than appear at once
    And the visionary sees its edges pass their resting places by at most 4 points before settling

  @D137
  Scenario Outline: The island checked <after> after it starts opening
    Given Apple Music is playing "Wonderwall" and the island is closed to the plain notch
    When the visionary rests the pointer on the notch and the island starts opening
    Then the visionary sees <state> <after> after the opening started

    Examples:
      | after       | state                                                                                     |
      | 0.1 seconds | the island partway grown, larger than the notch and smaller than the open panel            |
      | 0.6 seconds | the island at its full open size showing "Wonderwall" and "Oasis"                          |

  @D137 @D138
  Scenario Outline: The island checked <after> after it starts closing
    Given the island is open over "Wonderwall" because the pointer is on it
    When the visionary moves the pointer off the island and its grace runs out
    Then the visionary sees <state> <after> after the closing started
    And the visionary sees the island never smaller than the notch, and never larger than the open panel, on its way back

    Examples:
      | after       | state                                                                  |
      | 0.1 seconds | the island partway shrunk, smaller than the open panel and larger than the notch |
      | 0.5 seconds | the plain notch                                                        |

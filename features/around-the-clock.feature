Feature: Around the clock
  The island starts by itself at every login and sits at the notch costing
  the fanless Air almost nothing. While the screen is shared or recorded it
  keeps working for the visionary as always, while nothing of it, wing,
  panel or shelf, appears in what the share or the recording captures, so
  the visionary's notes, reminders and shelf stay off other people's
  screens. The app menus
  and status icons beside the notch work exactly as they did, with no dead
  zone around the closed island.

  @D60
  Scenario Outline: Logging in <when> has the island working with nobody opening it
    Given the visionary has not opened the island themselves
    When the visionary logs in to the Mac <when>
    And the visionary rests the pointer on the notch while "Wonderwall" plays in Apple Music
    Then the visionary sees the island open on the music page

    Examples:
      | when                              |
      | after a restart for an update     |
      | after a restart following a crash |
      | after logging out                 |

  @D108
  Scenario Outline: While <sharing>, the visionary still has the island and the capture shows none of it: <event>
    Given the visionary is <sharing>
    When <event>
    Then the visionary sees <seen>
    And the visionary sees nothing of the island in <capture>

    Examples:
      | sharing                    | event                                                           | seen                                                     | capture                          |
      | sharing the screen in Zoom | "Champagne Supernova" starts in Apple Music                     | the wing out left of the notch with "Champagne Su…"      | what the Zoom viewers see        |
      | sharing the screen in Meet | the visionary rests the pointer on the notch for 2 seconds      | the island open on the music page                        | what the Meet viewers see        |
      | recording the screen       | the visionary clicks the notch                                  | the island open at once on the music page                | the played-back recording        |
      | sharing the screen in Zoom | the visionary drags "tax-return.pdf" onto the notch and lets go | "tax-return.pdf" parked on the shelf page                | what the Zoom viewers see        |

  @D109
  Scenario Outline: With <showing> on screen while <sharing>, <capture> holds none of it
    Given the visionary is <sharing>
    And the island is showing <showing> on the visionary's screen
    When the visionary checks <capture>
    Then the visionary sees nothing of the island in <capture>, only the plain menu bar around the notch

    Examples:
      | sharing                    | showing                                                      | capture                    |
      | sharing the screen in Zoom | the shelf page, holding the note "✎ idea: notch app shows lyrics" | what the Zoom viewers see  |
      | sharing the screen in Meet | the music page over "Wonderwall"                             | what the Meet viewers see  |
      | recording the screen       | the wing left of the notch for "Champagne Supernova"         | the played-back recording  |

  @D108
  Scenario: When the share ends, the island works as before
    Given the visionary was sharing the screen in Zoom and has just stopped sharing
    When the visionary rests the pointer on the notch while "Wonderwall" plays
    Then the visionary sees the island open on the music page

  @D108
  Scenario: A screen recording that has just ended still lands on the shelf
    Given the visionary is recording the screen and the island is closed to the plain notch
    When the visionary stops the recording and it saves as "Screen Recording 2026-10-18 at 10.16.40.mov"
    Then the visionary sees "Screen Recording 2026-10-18 at 10.16.40.mov" on the shelf page

  @D79
  Scenario Outline: Over a closed minute of Wonderwall, the island's <measure> stays at or under <ceiling>
    Given the island is closed and Apple Music is playing "Wonderwall"
    When 1 minute passes with nothing touched
    Then the visionary sees in Activity Monitor the island's <measure>, averaged over that minute, at <ceiling> or less

    Examples:
      | measure       | ceiling |
      | CPU           | 3%      |
      | Energy Impact | 5       |

  @D70
  Scenario Outline: Clicking <target> beside the closed island works as today
    Given Chrome is in front and the island is closed to the plain notch
    When the visionary clicks <target>
    Then the visionary sees <result>

    Examples:
      | target                                                    | result                                        |
      | Chrome's Help menu, the nearest menu left of the notch    | Chrome's Help menu open                       |
      | the right-hand edge of Chrome's Help menu                 | Chrome's Help menu open                       |
      | the Wi-Fi icon                                            | the Wi-Fi menu open                           |
      | the leftmost status icon right of the notch               | that status icon's own menu open, as before   |

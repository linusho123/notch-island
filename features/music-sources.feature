Feature: Music sources
  The island follows Apple Music, youtube.com and soundcloud.com in Chrome,
  and downloaded mp4, mp3, wav, mov and mkv files playing in IINA,
  QuickTime Player or Music, whichever the visionary's default apps pick.
  Music still counts when the sound goes out over Bluetooth. In Chrome only
  YouTube and SoundCloud count, and only while they play sound. The source
  line names the site for Chrome sources and the app otherwise, adding the
  speaker only when it is not the built-in one. When more than one source
  plays, the newest shows and a flip turns the card to the others, through
  the sources the island can see separately, with a count such as "1 of 2".
  A closed source reopens where it left off. Control Center and the keyboard's media keys keep working as they
  do today, and the island follows what they did.

  @D18
  Scenario Outline: A song from <source> shows on the music page
    Given <source> is playing <title> and nothing else is playing
    When the visionary rests the pointer on the notch
    Then the visionary sees <title> on the music page with back, pause and skip

    Examples:
      | source                         | title                                 |
      | Apple Music                    | "Wonderwall"                          |
      | a youtube.com tab in Chrome    | the video "Lecture 4: Fourier Series" |
      | a soundcloud.com tab in Chrome | the track "late night mix"            |
      | IINA                           | the file "rehearsal.mkv"              |
      | IINA                           | the file "holiday.mp4"                |
      | QuickTime Player               | the file "holiday.mov"                |
      | Music                          | the file "demo-take-3.mp3"            |
      | Music                          | the file "voice-memo.wav"             |

  @D24
  Scenario: Music playing out through a Bluetooth speaker still counts
    Given Apple Music is playing "Wonderwall" out through the Bluetooth speaker "JBL Flip 5"
    When the visionary rests the pointer on the notch
    Then the visionary sees "Wonderwall" on the music page
    And the visionary sees "JBL Flip 5" on its source line

  @D119
  Scenario Outline: The source line reads <line>
    Given <source> is playing <title> out through <speaker> and nothing else is playing
    When the visionary rests the pointer on the notch
    Then the visionary sees the source line read "<line>"

    Examples:
      | source                         | title                                 | speaker                            | line                   |
      | Apple Music                    | "Wonderwall"                          | the MacBook speakers               | Apple Music            |
      | Apple Music                    | "Wonderwall"                          | the Bluetooth speaker "JBL Flip 5" | Apple Music · JBL Flip 5 |
      | a youtube.com tab in Chrome    | the video "Lecture 4: Fourier Series" | the MacBook speakers               | YouTube                |
      | a youtube.com tab in Chrome    | the video "Lecture 4: Fourier Series" | the Bluetooth speaker "JBL Flip 5" | YouTube · JBL Flip 5   |
      | a soundcloud.com tab in Chrome | the track "late night mix"            | the MacBook speakers               | SoundCloud             |
      | IINA                           | the file "rehearsal.mkv"              | the MacBook speakers               | IINA                   |
      | QuickTime Player               | the file "holiday.mov"                | the MacBook speakers               | QuickTime Player       |
      | Music                          | the file "demo-take-3.mp3"            | the MacBook speakers               | Music                  |

  @D120
  Scenario: A Bluetooth speaker dropping mid-song pops nothing out
    Given "Wonderwall" is playing out through "JBL Flip 5" and the island is closed to the plain notch
    When the speaker disconnects mid-song
    Then the visionary sees the notch stay plain, with no wing and no notice

  @D120
  Scenario: After the speaker drops, the source line names the app alone
    Given the island is open over "Wonderwall" playing in Apple Music out through "JBL Flip 5", the source line reading "Apple Music · JBL Flip 5"
    When the speaker disconnects mid-song
    Then the visionary sees the source line read "Apple Music", the speaker part gone
    And the visionary sees the pause or play button match whether Apple Music kept playing

  @D88
  Scenario: A YouTube lecture playing with sound counts as a song
    Given a youtube.com tab in Chrome is playing "Lecture 4: Fourier Series" with sound
    When the visionary rests the pointer on the notch
    Then the visionary sees "Lecture 4: Fourier Series" on the music page

  @D88
  Scenario: A muted YouTube preview counts from the moment it is unmuted
    Given a muted hover preview of "Lecture 5: Laplace Transforms" is playing on the YouTube home feed in Chrome, and nothing else is playing
    And the visionary has just unmuted it
    When the visionary rests the pointer on the notch
    Then the visionary sees "Lecture 5: Laplace Transforms" on the music page

  @D122
  Scenario: Unmuting a muted YouTube preview adds it to the card without popping the wing
    Given the island is closed and Apple Music is playing "Wonderwall"
    And a muted hover preview of "Lecture 5: Laplace Transforms" is playing on the YouTube home feed in Chrome
    When the visionary unmutes the preview
    Then the visionary sees the plain notch, with no wing popping out
    And the visionary, resting the pointer on the notch, sees a flip control on the card between "Wonderwall" and "Lecture 5: Laplace Transforms"

  @D88 @D107
  Scenario Outline: In Chrome, <clip> stays off the island
    Given "Wonderwall" was the last song played, now paused, and nothing else is playing
    When <clip> starts playing in Chrome
    Then the visionary sees no wings beside the notch
    And the visionary, resting the pointer on the notch, sees "Wonderwall" still paused and ready on the music page

    Examples:
      | clip                                                  |
      | a muted hover preview on the YouTube home feed, left muted |
      | a muted autoplay clip on a news site                  |
      | an autoplay clip with sound on a news site            |

  @D48
  Scenario: A YouTube video started while Wonderwall plays takes the card, with a flip control
    Given Apple Music is playing "Wonderwall"
    And the visionary then started "Lecture 4: Fourier Series" in a youtube.com tab in Chrome
    When the visionary rests the pointer on the notch
    Then the visionary sees "Lecture 4: Fourier Series" on the music page
    And the visionary sees a small flip control on the card

  @D48 @D121
  Scenario: Flipping the card turns it like a mirror to the other source
    Given the music page shows "Lecture 4: Fourier Series" while "Wonderwall" also plays in Apple Music
    When the visionary clicks the flip control
    Then the visionary sees the card flip over like a mirror to show "Wonderwall"
    And the visionary sees the count "2 of 2"

  @D121
  Scenario Outline: With <sources> playing, the newest shows the count <count>
    Given <sources> are playing, the youtube.com tab in Chrome started last
    When the visionary rests the pointer on the notch
    Then the visionary sees "Lecture 4: Fourier Series" on the card
    And the visionary sees the count "<count>" beside the flip control

    Examples:
      | sources                                                         | count  |
      | Apple Music and a youtube.com tab in Chrome                     | 1 of 2 |
      | Apple Music, QuickTime Player and a youtube.com tab in Chrome   | 1 of 3 |

  @D48
  Scenario: The flipped card's buttons control the other source
    Given the card has been flipped to "Wonderwall" while "Lecture 4: Fourier Series" also plays
    When the visionary clicks pause
    Then the visionary hears "Wonderwall" stop in Apple Music while the lecture keeps playing

  @D111
  Scenario Outline: Flipping <flips> times through three sources shows <face> as <count>
    Given Apple Music, IINA and a youtube.com tab in Chrome are all playing, the YouTube tab started last
    And the island can see IINA separately
    When the visionary opens the island and clicks the flip control <flips> times
    Then the visionary sees <face> on the card
    And the visionary sees the count "<count>"

    Examples:
      | flips | face                 | count  |
      | 1     | the IINA file        | 2 of 3 |
      | 2     | the Apple Music song | 3 of 3 |
      | 3     | the YouTube video    | 1 of 3 |
      | 4     | the IINA file        | 2 of 3 |

  @D111
  Scenario Outline: Flipping <flips> times while IINA has no face shows <face> as <count>
    Given Apple Music, IINA and a youtube.com tab in Chrome are all playing, the YouTube tab started last
    And the shared now-playing channel shows another app than IINA, so the island cannot see IINA separately
    When the visionary opens the island and clicks the flip control <flips> times
    Then the visionary sees <face> on the card
    And the visionary sees the count "<count>"

    Examples:
      | flips | face                 | count  |
      | 1     | the Apple Music song | 2 of 2 |
      | 2     | the YouTube video    | 1 of 2 |
      | 3     | the Apple Music song | 2 of 2 |

  @D117
  Scenario Outline: When the visionary <gone>, the newest remaining source shows
    Given Apple Music started "Wonderwall" first, then IINA started "rehearsal.mkv", then a youtube.com tab started "Lecture 4: Fourier Series"
    When the visionary <gone>
    Then the visionary sees <shown> on the card
    And the visionary never sees <left> again when flipping the card

    Examples:
      | gone                  | shown                        | left                         |
      | quits Apple Music     | "Lecture 4: Fourier Series"  | "Wonderwall"                 |
      | closes the YouTube tab | "rehearsal.mkv"             | "Lecture 4: Fourier Series"  |
      | quits IINA            | "Lecture 4: Fourier Series"  | "rehearsal.mkv"              |

  @D117
  Scenario: Quitting the only source leaves its last song paused and ready
    Given Apple Music is playing "Wonderwall" and nothing else is playing
    When the visionary quits Apple Music
    Then the visionary, resting the pointer on the notch, sees "Wonderwall" paused and ready on the music page

  @D117
  Scenario Outline: Play after the visionary <closed> resumes <title> at <spot>
    Given the visionary <closed> while it played <title> at <spot>, and nothing else is playing
    When the visionary opens the island and clicks play
    Then the visionary sees <app> open <title> again
    And the visionary hears <title> playing from <spot>, not from the start

    Examples:
      | closed                     | title                       | spot    | app         |
      | quit Apple Music           | "Wonderwall"                | 2:10    | Apple Music |
      | closed the youtube.com tab | "Lecture 4: Fourier Series" | 12:34   | Chrome      |
      | quit IINA                  | the file "rehearsal.mkv"    | 0:42:10 | IINA        |
      | closed the soundcloud.com tab | the track "late night mix" | 8:20    | Chrome      |
      | quit QuickTime Player      | the file "holiday.mov"      | 1:05    | QuickTime Player |
      | quit Music                 | the file "demo-take-3.mp3"  | 1:20    | Music       |

  @D46 @D47
  Scenario Outline: With nothing <where> it, <button> on the island goes to <app>
    Given <app> is playing <what> with nothing <where> it
    When the visionary clicks <button> on the island
    Then the visionary sees <app> handle it as a press of its own <control> control
    And the visionary sees the island show what <app> then shows

    Examples:
      | app              | what                                        | where      | button                                 | control |
      | QuickTime Player | the lone file "holiday.mov"                 | next after | skip                                   | skip    |
      | Apple Music      | "Wonderwall" as the first song in the queue | before     | back twice within the first 3 seconds  | back    |

  @D68
  Scenario Outline: The visionary <action> from Control Center and the island follows
    Given the island is running and Apple Music is playing "Wonderwall" with "Champagne Supernova" next
    When the visionary <action> from the Now Playing tile in Control Center
    Then the visionary hears <heard>
    And the visionary, resting the pointer on the notch, sees <shown>

    Examples:
      | action | heard                       | shown                                   |
      | pauses | "Wonderwall" stop           | "Wonderwall" with a play button         |
      | skips  | "Champagne Supernova" start | "Champagne Supernova" on the music page |

  @D69
  Scenario Outline: The keyboard's <key> key still works and the island follows
    Given the island is running and Apple Music is playing "Wonderwall" with "Champagne Supernova" next
    When the visionary presses the keyboard's <key> key
    Then the visionary hears <heard>
    And the visionary, resting the pointer on the notch, sees <shown>

    Examples:
      | key           | heard                       | shown                                   |
      | play or pause | "Wonderwall" stop           | "Wonderwall" with a play button         |
      | skip          | "Champagne Supernova" start | "Champagne Supernova" on the music page |

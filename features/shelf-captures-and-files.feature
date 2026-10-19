Feature: Shelf captures and files
  A two-finger scroll down on the open island turns from the music page to
  the shelf page, the same size; scrolling up turns back. New screenshots
  and screen recordings land on the shelf by themselves and still save
  where they always did; captures taken within a minute of each other
  stack. Dragging a file, several files, a folder or a link onto the notch
  parks it; dropped text is refused. The shelf only points at files: they
  stay in their folders, follow a move, and leave when trashed. Dragging an
  item out attaches it wherever it is dropped, and it leaves the shelf only
  if the drop was accepted, the Desktop included. A stack has no maximum. A parked file or capture leaves on its own after
  a full 24 hours; links stay until removed; everything survives a restart.

  @D29 @D30
  Scenario: Scrolling down on the music page brings up the shelf page
    Given the island is open on the music page over "Wonderwall"
    When the visionary scrolls down with two fingers
    Then the visionary sees the music page slide up and out and the shelf page come up from below
    And the visionary sees the shelf page at the same size as the music page
    And the visionary sees the small bar at the side mark the shelf page as showing

  @D30
  Scenario: Scrolling up on the shelf page brings the music page back
    Given the island is open on the shelf page
    When the visionary scrolls up with two fingers
    Then the visionary sees the music page come back over "Wonderwall"
    And the visionary sees the small bar at the side mark the music page as showing

  @D64 @D32
  Scenario Outline: A new <capture> lands on the shelf by itself
    Given the shelf is empty and screenshots save to the Desktop
    When the visionary <makes>
    Then the visionary sees <file> on the Desktop as before
    And the visionary sees <file> on the shelf page, ready to drag

    Examples:
      | capture          | makes                                                | file                                          |
      | screenshot       | takes a screenshot that saves as a file              | "Screenshot 2026-10-18 at 10.15.02.png"       |
      | screen recording | makes a screen recording that saves as a ".mov" file | "Screen Recording 2026-10-18 at 10.16.40.mov" |

  @D64 @D105
  Scenario Outline: A screenshot <how> stays off the shelf
    Given the shelf is empty
    When the visionary takes a screenshot <how>
    Then the visionary sees the shelf page still empty

    Examples:
      | how                             |
      | copied only to the clipboard    |
      | saved by another screenshot tool |

  @D118
  Scenario Outline: A capture <gap> after the previous one <result>
    Given the shelf holds one screenshot, taken at 10:15:00
    When the visionary <makes> <gap> after the first
    Then the visionary sees <shelf>

    Examples:
      | makes                    | gap        | result            | shelf                                              |
      | takes another screenshot | 10 seconds | joins it          | one stack reading "2 screenshots"                  |
      | takes another screenshot | 59 seconds | joins it          | one stack reading "2 screenshots"                  |
      | takes another screenshot | 60 seconds | joins it          | one stack reading "2 screenshots"                  |
      | takes another screenshot | 61 seconds | starts a new item | two separate screenshots                           |
      | makes a screen recording | 30 seconds | joins it          | one stack reading "1 screenshot, 1 recording"      |
      | makes a screen recording | 61 seconds | starts a new item | a screenshot and a separate recording              |

  @D118
  Scenario: Thirty screenshots in a row while documenting a bug make one stack
    Given the shelf holds no screenshots
    When the visionary takes 30 screenshots in a row, each within a few seconds of the last
    Then the visionary sees one stack on the shelf reading "30 screenshots"

  @D118
  Scenario: A thirty-first screenshot joins the stack of thirty
    Given the shelf holds a stack reading "30 screenshots", the last taken a few seconds ago
    When the visionary takes a 31st screenshot
    Then the visionary sees one stack on the shelf reading "31 screenshots"
    And the visionary sees no new item started beside it

  @D118
  Scenario: A stack drags out as one group
    Given the shelf holds a stack reading "3 screenshots, 1 recording"
    When the visionary drags the stack into a Gmail draft in Chrome
    Then the visionary sees all 3 screenshots and the recording attached to the draft

  @D118
  Scenario: A stack expands into its captures
    Given the shelf holds a stack reading "3 screenshots, 1 recording"
    When the visionary expands the stack
    Then the visionary sees the 3 screenshots and the recording as separate items on the shelf page

  @D33
  Scenario: Dragging a file onto the closed notch opens the shelf as a drop target
    Given the island is closed and "tax-return.pdf" is in the Documents folder
    When the visionary drags "tax-return.pdf" from Finder onto the notch, still holding it
    Then the visionary sees the island open straight to the shelf page, ready for the drop

  @D33
  Scenario: Letting go over the open shelf parks the file
    Given the visionary is dragging "tax-return.pdf" and the island has opened to the shelf page
    When the visionary lets go over the shelf page
    Then the visionary sees "tax-return.pdf" parked on the shelf

  @D65
  Scenario Outline: Dropping <dropped> onto the notch parks <parked>
    Given the shelf is empty
    When the visionary drags <dropped> onto the notch and lets go
    Then the visionary sees <parked> on the shelf page

    Examples:
      | dropped                                                          | parked                                       |
      | the file "tax-return.pdf" from Finder                            | "tax-return.pdf" as one item                 |
      | the file "boarding-pass.pdf" from the Desktop                    | "boarding-pass.pdf" as one item              |
      | three files selected together in Finder                          | one stack holding the three files            |
      | the folder "Taxes 2026"                                          | the folder "Taxes 2026" as one item          |
      | a link from Chrome's address bar to "gov.uk/renew-adult-passport" | a link to "gov.uk/renew-adult-passport"     |

  @D65 @D102
  Scenario: Dropped highlighted text is refused
    Given the shelf holds only "tax-return.pdf"
    When the visionary drags the highlighted text "renew passport before May" from Chrome onto the notch and lets go
    Then the visionary sees the shelf still holding only "tax-return.pdf", with no note made from the text

  @D65
  Scenario: A parked stack of files drags out as a group
    Given the shelf holds one stack of three files dropped together from Finder
    When the visionary drags the stack into a Gmail draft in Chrome
    Then the visionary sees all three files attached to the draft

  @D65
  Scenario: A parked folder drags out whole
    Given the folder "Taxes 2026", holding 4 files, is parked on the shelf from the Documents folder
    When the visionary drags it from the shelf into a Finder window of the drive "Backup"
    Then the visionary sees the folder "Taxes 2026" on "Backup" with all 4 files inside it

  @D58 @D65
  Scenario Outline: Moving <item> in Finder keeps it on the shelf at its new place
    Given <item> is parked on the shelf from the Documents folder
    When the visionary moves <item> to the folder "Archive" in Finder
    And the visionary then drags it from the shelf onto the Desktop
    Then the visionary sees <item> on the Desktop and no longer in "Archive"

    Examples:
      | item                      |
      | the file "tax-return.pdf" |
      | the folder "Taxes 2026"   |

  @D58 @D106
  Scenario: A parked file moved to the Trash leaves the shelf
    Given "tax-return.pdf" is parked on the shelf from the Documents folder
    When the visionary moves "tax-return.pdf" to the Trash in Finder
    Then the visionary sees "tax-return.pdf" gone from the shelf page

  @D116
  Scenario: A parked file dropped on the Desktop leaves the shelf
    Given "tax-return.pdf" is parked on the shelf from the Documents folder
    When the visionary drags it out of the shelf onto the Desktop and Finder moves it there
    Then the visionary sees "tax-return.pdf" on the Desktop, no longer in Documents
    And the visionary sees "tax-return.pdf" gone from the shelf page

  @D36
  Scenario: Parking a file leaves it in its folder
    Given "tax-return.pdf" sits in the Documents folder
    When the visionary parks it on the shelf by dragging it onto the notch
    Then the visionary sees "tax-return.pdf" still in the Documents folder in Finder
    And the visionary sees "tax-return.pdf" on the shelf page

  @D36
  Scenario: Dragging a parked file out behaves as if dragged from its folder
    Given "tax-return.pdf" is parked on the shelf from the Documents folder
    When the visionary drags it from the shelf into a Gmail draft in Chrome
    Then the visionary sees the "tax-return.pdf" from Documents attached to the draft

  @D34
  Scenario Outline: Dragging a parked screenshot into <target> attaches it
    Given "Screenshot 2026-10-18 at 10.15.02.png" is parked on the shelf and its original is on the Desktop
    When the visionary opens the island, scrolls down to the shelf and drags the screenshot into <target>
    Then the visionary sees the screenshot attached in <target>, as if dragged from the Desktop

    Examples:
      | target                  |
      | a Messages chat         |
      | a Gmail draft in Chrome |

  @D92
  Scenario: An accepted drop takes the screenshot off the shelf
    Given "Screenshot 2026-10-18 at 10.15.02.png" is parked on the shelf and its original is on the Desktop
    When the visionary drags it out of the shelf into a Messages chat that accepts it
    Then the visionary sees the screenshot gone from the shelf page
    And the visionary sees its original still on the Desktop

  @D92 @D103
  Scenario Outline: A refused drop leaves <item> on the shelf
    Given <item> is parked on the shelf and its original is on the Desktop
    When the visionary drags it out of the shelf and lets go <where>
    Then the visionary sees <item> on the shelf page as it was
    And the visionary sees its original still on the Desktop

    Examples:
      | item                                                   | where                                            |
      | the 2 GB screen recording "bug-repro.mov"              | in a Messages chat that refuses it as too large  |
      | the screenshot "Screenshot 2026-10-18 at 10.15.02.png" | over the menu bar, where nothing accepts it      |

  @D66
  Scenario Outline: Removing <item> from the shelf by <how>
    Given <item> is parked on the shelf from <home>
    When the visionary removes it by <how>
    Then the visionary sees <item> gone from the shelf page
    And the visionary sees <item> still in <home>

    Examples:
      | item                                    | home                 | how                                                 |
      | "tax-return.pdf"                        | the Documents folder | clicking the small x that appears on hovering it    |
      | "Screenshot 2026-10-18 at 10.15.02.png" | the Desktop          | dropping it on the remove area at the panel's edge  |
      | the folder "Taxes 2026"                 | the Documents folder | dropping it on the remove area at the panel's edge  |

  @D66
  Scenario: Removing a stack leaves its captures where they are
    Given the shelf holds a stack reading "3 screenshots, 1 recording" whose captures are on the Desktop
    When the visionary hovers the stack and clicks the small x that appears
    Then the visionary sees the stack gone from the shelf page
    And the visionary sees the 3 screenshots and the recording still on the Desktop

  @D66
  Scenario: Removing a link by the remove area
    Given a link to "gov.uk/renew-adult-passport" is parked on the shelf
    When the visionary drags the link onto the remove area at the panel's edge and lets go
    Then the visionary sees the link gone from the shelf page

  @D66
  Scenario: The remove area shows only while a shelf item is being dragged
    Given the island is open on the shelf page holding "tax-return.pdf", with no remove area showing
    When the visionary starts dragging "tax-return.pdf" out of the shelf
    Then the visionary sees a small remove area appear at the panel's edge

  @D66
  Scenario Outline: Dropping a parked file on <where> is a real drop
    Given "tax-return.pdf" is parked on the shelf from the Documents folder
    When the visionary drags it out of the shelf and drops it on <where>
    Then the visionary sees <result>

    Examples:
      | where           | result                                                                   |
      | the Desktop     | "tax-return.pdf" moved to the Desktop as in Finder, no longer in Documents |
      | a Chrome window | Chrome open "tax-return.pdf"                                             |

  @D57
  Scenario Outline: A screenshot parked at 11:58 pm, checked at <when>
    Given "Screenshot 2026-10-18 at 23.58.00.png" was parked on the shelf at 11:58 pm and has not been dragged out or removed
    When the visionary opens the shelf page at <when>
    Then the visionary sees <state>
    And the visionary sees its original still on the Desktop

    Examples:
      | when                      | state                              |
      | 12:01 am the next morning | the screenshot still on the shelf  |
      | 11:57 pm the next night   | the screenshot still on the shelf  |
      | 11:59 pm the next night   | the screenshot gone from the shelf |

  @D65
  Scenario: A parked link never ages off the shelf
    Given a link to "gov.uk/renew-adult-passport" was parked on the shelf 7 days ago and never removed
    When the visionary opens the shelf page
    Then the visionary sees the link to "gov.uk/renew-adult-passport" still there

  @D59
  Scenario Outline: After a restart <how>, the whole shelf comes back
    Given the shelf holds 3 notes, 1 reminder and 2 parked files, one of them "tax-return.pdf" parked at 9:00 am
    When the Mac restarts <how> at 2:00 pm and the visionary logs back in
    Then the visionary sees the 3 notes, the reminder and both files on the shelf page
    And the visionary sees "tax-return.pdf" leave the shelf at 9:00 am the next day, 24 hours after it was parked

    Examples:
      | how           |
      | for an update |
      | after a crash |

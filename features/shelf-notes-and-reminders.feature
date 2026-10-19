Feature: Shelf notes and reminders
  The shelf page holds super short notes, written with + note and capped at
  140 characters, when written and when edited. A note can be edited in
  place, and emptying it removes it. The small box beside a note turns it into a reminder, and the pencil
  beside a reminder turns it back. Checking a reminder off removes it at
  once. Notes and reminders stay until the visionary removes them, and a
  reminder never pops the island out or draws attention on its own. Dragged
  into a chat, a note or reminder drops in as text and stays on the shelf.

  @D37
  Scenario: + note puts a short note on the shelf
    Given the island is open on the shelf page
    When the visionary clicks "+ note", types "idea: notch app shows lyrics" and presses Return
    Then the visionary sees "✎ idea: notch app shows lyrics" on the shelf

  @D61 @D98
  Scenario: Return on an empty note makes no note
    Given the island is open on the shelf page holding only "✎ idea: notch app shows lyrics"
    When the visionary clicks "+ note" and presses Return on the empty line
    Then the visionary sees the shelf unchanged, holding only "✎ idea: notch app shows lyrics"

  @D62 @D104
  Scenario Outline: A new note of <length> keeps <kept>
    Given the island is open on the shelf page with a new note being typed
    When the visionary <enters> a text of <length> and presses Return
    Then the visionary sees a note on the shelf holding <kept>

    Examples:
      | length          | enters | kept                          |
      | 1 character     | types  | that 1 character              |
      | 139 characters  | types  | all 139 characters            |
      | 140 characters  | types  | all 140 characters            |
      | 141 characters  | types  | only the first 140 characters |
      | 2000 characters | pastes | only the first 140 characters |

  @D63
  Scenario: Editing a note's text saves the correction in place
    Given the note "✎ idea: notch app shwos lyrics" is on the shelf
    When the visionary clicks its text, corrects it to "idea: notch app shows lyrics" and presses Return
    Then the visionary sees "✎ idea: notch app shows lyrics" in the same place on the shelf

  @D123
  Scenario Outline: Typing <added> more into a note of 130 characters leaves <kept>
    Given a note of 130 characters is on the shelf
    When the visionary clicks its text, types <added> more characters at its end and presses Return
    Then the visionary sees the note holding <kept>

    Examples:
      | added | kept                                                     |
      | 1     | all 131 characters                                       |
      | 10    | all 140 characters                                       |
      | 11    | 140 characters, the typing stopped at the cap            |
      | 500   | 140 characters, the typing stopped at the cap            |

  @D63
  Scenario: Emptying a note's text removes the note
    Given the note "✎ idea: notch app shows lyrics" is on the shelf
    When the visionary clicks its text, deletes all of it and presses Return
    Then the visionary sees the note gone from the shelf

  @D39
  Scenario: The box beside a note makes it a reminder
    Given the plain note "✎ idea: notch app shows lyrics" is on the shelf
    When the visionary clicks the small box beside it
    Then the visionary sees "idea: notch app shows lyrics" as a reminder with an empty box

  @D39
  Scenario: The pencil beside a reminder turns it back into a plain note
    Given the reminder "renew passport" is on the shelf with an empty box
    When the visionary clicks the pencil beside it
    Then the visionary sees "✎ renew passport" as a plain note with no box

  @D40
  Scenario: Checking off a reminder removes it at once
    Given the reminder "renew passport" is on the shelf with an empty box
    When the visionary clicks its box
    Then the visionary sees "renew passport" gone from the shelf at once, with no struck-through step

  @D66
  Scenario: Clicking the small x on a note removes it
    Given the note "✎ idea: notch app shows lyrics" is on the shelf
    When the visionary hovers the note and clicks the small x that appears
    Then the visionary sees the note gone from the shelf

  @D93
  Scenario Outline: Dragging the <kind> <text> into a Messages chat drops its text and keeps it
    Given the note "idea: notch app shows lyrics" and the reminder "renew passport" are on the shelf
    When the visionary drags the <kind> <text> into a Messages chat
    Then the visionary sees <text> in the chat's message field, as if typed
    And the visionary sees the <kind> still on the shelf, <state>

    Examples:
      | kind     | text                           | state                          |
      | note     | "idea: notch app shows lyrics" | unchanged                      |
      | reminder | "renew passport"               | unchanged, its box still empty |

  @D57
  Scenario: A note and an open reminder stay on the shelf, quietly, for a week
    Given the note "idea: notch app shows lyrics" and the reminder "renew passport", its box empty, were put on the shelf 7 days ago
    And the island has stayed closed since
    When the visionary opens the shelf page
    Then the visionary sees the note and the reminder still on the shelf, the reminder's box still empty
    And the visionary saw no wings and no pop-out for the reminder in those 7 days

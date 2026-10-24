Feature: The new-song notice
  Test-only fixture (P3 fix M1): a wing already out when its app goes
  fullscreen folds at once (D125). Not a contract file.

  Scenario: A wing out in front of a windowed movie folds when the movie goes fullscreen
    Given IINA is in front playing a movie in a window
    And the island is closed and "Wonderwall" is near its end with "Champagne Supernova" next
    When "Champagne Supernova" starts
    Then the wing comes out
    When IINA goes fullscreen
    Then the wing is gone once IINA is fullscreen

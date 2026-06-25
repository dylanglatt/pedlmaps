import Foundation

// App Group shared between the Pedl app and this widget extension. The RN side
// (modules/widget-bridge) writes the favorites JSON under `favoritesKey`; we read
// it here so the widget + its config picker know the user's stations and their
// names without launching the app. Keep these constants in sync with
// modules/widget-bridge/ios/WidgetBridgeModule.swift.
let appGroupId = "group.com.dylanglatt.citibike"
let favoritesKey = "pedl.favorites"

// One favorite station, as written by the app. `id` is the GBFS station_id (UUID)
// and matches station_status.station_id directly — no remapping needed.
struct Favorite: Codable, Hashable {
  let id: String
  let name: String
  let shortName: String?
}

// Read the favorites the app last wrote to the App Group. Empty if nothing has
// been written yet (fresh install, or user has starred nothing).
func loadFavorites() -> [Favorite] {
  guard
    let defaults = UserDefaults(suiteName: appGroupId),
    let raw = defaults.string(forKey: favoritesKey),
    let data = raw.data(using: .utf8),
    let favs = try? JSONDecoder().decode([Favorite].self, from: data)
  else { return [] }
  return favs
}

// Availability level, mirroring lib/gbfs.js `availabilityLevel`: >=3 good,
// >=1 low, 0 none. Drives the number color so the widget matches the app badge.
enum Level {
  case good, low, none

  static func from(_ n: Int) -> Level {
    if n >= 3 { return .good }
    if n >= 1 { return .low }
    return .none
  }
}

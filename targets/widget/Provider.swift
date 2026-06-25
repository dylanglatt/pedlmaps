import WidgetKit
import SwiftUI

// One station's resolved state for a timeline entry. `value == nil` means we
// couldn't determine a current number (stale/failed fetch) → render an em dash,
// never a wrong-but-confident number.
struct StationRow: Identifiable {
  let id: String
  let name: String
  let shortName: String?
  let value: Int?
}

struct PedlEntry: TimelineEntry {
  let date: Date
  let metric: Metric
  let rows: [StationRow]   // small: 1 (the chosen favorite); medium: up to 4
  let stale: Bool          // GBFS fetch failed → numbers are em dashes
  let empty: Bool          // no favorites starred at all
}

extension PedlEntry {
  static func placeholder(_ family: WidgetFamily) -> PedlEntry {
    let demo = (0..<(family == .systemMedium ? 4 : 1)).map {
      StationRow(id: "\($0)", name: "Station", shortName: nil, value: [8, 3, 1, 5][$0 % 4])
    }
    return PedlEntry(date: Date(), metric: .ebikes, rows: demo, stale: false, empty: false)
  }
}

struct Provider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> PedlEntry {
    .placeholder(context.family)
  }

  func snapshot(for configuration: SelectStationIntent, in context: Context) async -> PedlEntry {
    await makeEntry(for: configuration, context: context)
  }

  func timeline(for configuration: SelectStationIntent, in context: Context) async -> Timeline<PedlEntry> {
    let entry = await makeEntry(for: configuration, context: context)
    // Refresh roughly every 20 min; the app also nudges via reloadAllTimelines()
    // when favorites change, so the station set stays current between refreshes.
    let next = Date().addingTimeInterval(20 * 60)
    return Timeline(entries: [entry], policy: .after(next))
  }

  private func makeEntry(for configuration: SelectStationIntent, context: Context) async -> PedlEntry {
    let metric = configuration.metric
    let favorites = loadFavorites()

    if favorites.isEmpty {
      return PedlEntry(date: Date(), metric: metric, rows: [], stale: false, empty: true)
    }

    let status = await fetchStatus()
    let stale = (status == nil)

    func row(for fav: Favorite) -> StationRow {
      let value = status?[fav.id].map { count($0, metric) }
      return StationRow(id: fav.id, name: fav.name, shortName: fav.shortName, value: value)
    }

    let rows: [StationRow]
    if context.family == .systemSmall {
      // Use the configured station, else the first favorite.
      let chosen = configuration.station
        .flatMap { sel in favorites.first { $0.id == sel.id } } ?? favorites[0]
      rows = [row(for: chosen)]
    } else {
      rows = favorites.prefix(4).map(row)
    }

    return PedlEntry(date: Date(), metric: metric, rows: rows, stale: stale, empty: false)
  }
}

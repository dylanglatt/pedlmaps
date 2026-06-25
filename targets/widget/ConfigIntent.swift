import AppIntents
import WidgetKit

// MARK: - Metric (the configurable "which number" parameter)

enum Metric: String, AppEnum {
  case ebikes
  case classic
  case anyBikes
  case docks

  static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Metric")

  static var caseDisplayRepresentations: [Metric: DisplayRepresentation] = [
    .ebikes:   "E-bikes",
    .classic:  "Classic",
    .anyBikes: "Any bikes",
    .docks:    "Open docks",
  ]

  // Short lowercase label shown under the big number ("e-bikes", "docks", …).
  var label: String {
    switch self {
    case .ebikes:   return "e-bikes"
    case .classic:  return "classic"
    case .anyBikes: return "bikes"
    case .docks:    return "docks"
    }
  }
}

// MARK: - Station (the configurable "which favorite" parameter)

// A favorite station offered in the widget config picker. Options are sourced
// live from the App Group favorites the app writes, so the picker stays in sync
// with what the user has starred — no app launch required.
struct StationEntity: AppEntity, Identifiable {
  let id: String
  let name: String
  let shortName: String?

  static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Station")
  static var defaultQuery = StationQuery()

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)")
  }
}

struct StationQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [StationEntity] {
    loadFavorites()
      .filter { identifiers.contains($0.id) }
      .map { StationEntity(id: $0.id, name: $0.name, shortName: $0.shortName) }
  }

  func suggestedEntities() async throws -> [StationEntity] {
    loadFavorites().map { StationEntity(id: $0.id, name: $0.name, shortName: $0.shortName) }
  }

  func defaultResult() async -> StationEntity? {
    try? await suggestedEntities().first
  }
}

// MARK: - Widget configuration intent

struct SelectStationIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Select Station"
  static var description = IntentDescription("Pick a favorite station and which number to show.")

  // Optional: the small widget uses this to choose one favorite. When unset we
  // fall back to the first favorite. The medium widget ignores it (shows several).
  @Parameter(title: "Station")
  var station: StationEntity?

  @Parameter(title: "Show", default: .ebikes)
  var metric: Metric
}

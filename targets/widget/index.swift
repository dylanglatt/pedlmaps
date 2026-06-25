import WidgetKit
import SwiftUI

// Pedl favorite-stations widget. Configurable per instance (which favorite +
// which metric) via AppIntentConfiguration (iOS 17+). See:
//   ConfigIntent.swift — the station + metric parameters
//   Provider.swift      — reads App Group favorites + fetches GBFS each refresh
//   Views.swift         — small/medium SwiftUI
//   Shared.swift / GBFS.swift — App Group store + station_status client

struct PedlWidget: Widget {
  let kind = "PedlWidget"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: kind,
      intent: SelectStationIntent.self,
      provider: Provider()
    ) { entry in
      PedlWidgetView(entry: entry)
    }
    .configurationDisplayName("Pedl Stations")
    .description("Live availability for your favorite Citi Bike stations.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct PedlWidgetBundle: WidgetBundle {
  var body: some Widget {
    PedlWidget()
  }
}

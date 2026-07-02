// Widget registry + built-in templates for the customizable /net dashboard.
// A dashboard's `layout` is an array of Widget; the grid (grid-layout-plus)
// positions them by {x,y,w,h} on a 12-column grid. `type` selects the widget
// component (see app/components/net/widgets + DashboardWidget.vue).

export const DASHBOARD_COLS = 12
export const DASHBOARD_ROW_HEIGHT = 60

export type WidgetType =
  | 'status-summary'
  | 'status-doughnut'
  | 'latency-graph'
  | 'availability-graph'
  | 'alerts'
  | 'top-talkers'
  | 'device-grid'
  | 'sensors'
  | 'syslog'
  | 'host-status-summary'
  | 'problems-by-severity'
  | 'top-problems'

export interface Widget {
  i: string
  x: number
  y: number
  w: number
  h: number
  type: WidgetType
  config?: Record<string, any>
}

export interface WidgetMeta {
  type: WidgetType
  title: string
  icon: string
  defaultSize: { w: number; h: number }
  minSize: { w: number; h: number }
  /** whether the widget pulls time-series history (offers a range selector). */
  timeseries?: boolean
}

export const WIDGET_TYPES: WidgetMeta[] = [
  { type: 'status-summary', title: 'Status Summary', icon: 'i-lucide-layout-grid', defaultSize: { w: 12, h: 2 }, minSize: { w: 4, h: 2 } },
  { type: 'status-doughnut', title: 'Device Status', icon: 'i-lucide-pie-chart', defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 3 } },
  { type: 'latency-graph', title: 'Latency Trend', icon: 'i-lucide-activity', defaultSize: { w: 8, h: 4 }, minSize: { w: 4, h: 3 }, timeseries: true },
  { type: 'availability-graph', title: 'Availability Trend', icon: 'i-lucide-trending-up', defaultSize: { w: 6, h: 4 }, minSize: { w: 4, h: 3 }, timeseries: true },
  { type: 'alerts', title: 'Recent Alerts', icon: 'i-lucide-bell-ring', defaultSize: { w: 6, h: 5 }, minSize: { w: 3, h: 3 } },
  { type: 'top-talkers', title: 'Top Talkers', icon: 'i-lucide-arrow-left-right', defaultSize: { w: 6, h: 5 }, minSize: { w: 3, h: 3 } },
  { type: 'device-grid', title: 'Device Availability', icon: 'i-lucide-server', defaultSize: { w: 12, h: 4 }, minSize: { w: 4, h: 3 } },
  { type: 'sensors', title: 'Sensors', icon: 'i-lucide-gauge', defaultSize: { w: 6, h: 5 }, minSize: { w: 3, h: 3 } },
  { type: 'syslog', title: 'Syslog Feed', icon: 'i-lucide-scroll-text', defaultSize: { w: 6, h: 5 }, minSize: { w: 3, h: 3 } },
  { type: 'host-status-summary', title: 'Host Status Summary', icon: 'i-lucide-server-cog', defaultSize: { w: 12, h: 2 }, minSize: { w: 4, h: 2 } },
  { type: 'problems-by-severity', title: 'Problems by Severity', icon: 'i-lucide-bar-chart-3', defaultSize: { w: 6, h: 5 }, minSize: { w: 3, h: 3 } },
  { type: 'top-problems', title: 'Top Problems', icon: 'i-lucide-siren', defaultSize: { w: 6, h: 5 }, minSize: { w: 3, h: 3 } }
]

export function widgetMeta(type: WidgetType): WidgetMeta {
  return WIDGET_TYPES.find((w) => w.type === type) || WIDGET_TYPES[0]!
}

export interface DashboardTemplate {
  key: string
  name: string
  description: string
  icon: string
  layout: Omit<Widget, 'i'>[]
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    key: 'noc',
    name: 'NOC Overview',
    description: 'At-a-glance health across network and server: status tiles, up/down split, device map, alerts, and problems.',
    icon: 'i-lucide-monitor-dot',
    layout: [
      { type: 'status-summary', x: 0, y: 0, w: 12, h: 2 },
      { type: 'host-status-summary', x: 0, y: 2, w: 12, h: 2 },
      { type: 'status-doughnut', x: 0, y: 4, w: 4, h: 4 },
      { type: 'device-grid', x: 4, y: 4, w: 8, h: 4 },
      { type: 'alerts', x: 0, y: 8, w: 4, h: 5 },
      { type: 'top-problems', x: 4, y: 8, w: 4, h: 5 },
      { type: 'top-talkers', x: 8, y: 8, w: 4, h: 5 }
    ]
  },
  {
    key: 'latency',
    name: 'Latency & Availability',
    description: 'Performance focus: latency and availability trends with sensor health.',
    icon: 'i-lucide-line-chart',
    layout: [
      { type: 'status-summary', x: 0, y: 0, w: 12, h: 2 },
      { type: 'latency-graph', x: 0, y: 2, w: 8, h: 4, config: { range: '6h' } },
      { type: 'availability-graph', x: 8, y: 2, w: 4, h: 4, config: { range: '24h' } },
      { type: 'sensors', x: 0, y: 6, w: 6, h: 5 },
      { type: 'alerts', x: 6, y: 6, w: 6, h: 5 }
    ]
  },
  {
    key: 'traffic',
    name: 'Traffic & Logs',
    description: 'Flow and log centric: top talkers, syslog feed, and the device map.',
    icon: 'i-lucide-arrow-left-right',
    layout: [
      { type: 'status-summary', x: 0, y: 0, w: 12, h: 2 },
      { type: 'top-talkers', x: 0, y: 2, w: 6, h: 5 },
      { type: 'syslog', x: 6, y: 2, w: 6, h: 5 },
      { type: 'device-grid', x: 0, y: 7, w: 12, h: 4 }
    ]
  }
]

let _widCounter = 0
/** Unique key for a grid widget (stable within a session). */
export function newWidgetId(): string {
  _widCounter += 1
  return `w-${Date.now().toString(36)}-${_widCounter}`
}

/** Materialize a template (or a single widget) into Widget[] with fresh ids. */
export function instantiateLayout(layout: Omit<Widget, 'i'>[]): Widget[] {
  return layout.map((w) => ({ ...w, i: newWidgetId() }))
}

/** A new widget of `type`, placed at the bottom of the grid. */
export function makeWidget(type: WidgetType, y: number): Widget {
  const meta = widgetMeta(type)
  return { i: newWidgetId(), x: 0, y, w: meta.defaultSize.w, h: meta.defaultSize.h, type }
}

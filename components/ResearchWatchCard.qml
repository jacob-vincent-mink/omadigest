import QtQuick
import qs.Commons
import qs.Ui

Rectangle {
  id: root

  required property var watch
  property var latestRun: null
  property var activity: ({ state: "idle", message: "" })
  property color foreground: Color.foreground
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property bool confirmingDelete: false

  signal runRequested(string watchId)
  signal watchEnabledRequested(string watchId, bool enabled)
  signal deleteRequested(string watchId)

  readonly property bool running: String(activity.watchId || "") === String(watch.id || "")
    && ["searching", "reading", "synthesizing"].indexOf(String(activity.state || "")) >= 0
  readonly property bool failed: latestRun !== null && String(latestRun.status || "") === "error"
  readonly property color statusColor: running ? accent : failed ? Color.urgent
    : watch.enabled === true ? "#62b879" : Qt.darker(foreground, 1.45)

  width: parent ? parent.width : Style.space(420)
  height: content.implicitHeight + Style.space(20)
  radius: Style.cornerRadius
  color: running ? Style.selectedFillFor(foreground, accent) : Style.normalFillFor(foreground, accent)
  border.width: Style.spacing.hairline
  border.color: running ? accent : Style.normalBorderFor(foreground, accent)

  Behavior on border.color { ColorAnimation { duration: 120 } }
  SequentialAnimation on opacity {
    running: root.running
    loops: Animation.Infinite
    NumberAnimation { from: 0.82; to: 1; duration: 700; easing.type: Easing.InOutSine }
    NumberAnimation { from: 1; to: 0.82; duration: 700; easing.type: Easing.InOutSine }
  }

  Column {
    id: content
    anchors.fill: parent
    anchors.margins: Style.space(10)
    spacing: Style.space(7)

    Row {
      width: parent.width
      height: Style.space(40)
      spacing: Style.space(9)

      Rectangle {
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(8)
        height: width
        radius: width / 2
        color: root.statusColor
      }

      Column {
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width - Style.space(17) - watchToggle.width - parent.spacing * 2
        spacing: Style.space(1)
        Text {
          textFormat: Text.PlainText
          width: parent.width
          text: String(root.watch.name || "Research watch")
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          font.bold: true
          elide: Text.ElideRight
        }
        Text {
          textFormat: Text.PlainText
          width: parent.width
          text: root.scheduleText()
          color: Qt.darker(root.foreground, 1.4)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }

      ToggleSwitch {
        id: watchToggle
        anchors.verticalCenter: parent.verticalCenter
        checked: root.watch.enabled === true
        foreground: root.foreground
        accent: root.accent
        onToggled: root.watchEnabledRequested(String(root.watch.id || ""), !checked)
      }
    }

    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: String(root.watch.question || "")
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
      maximumLineCount: 2
      elide: Text.ElideRight
    }

    Text {
      textFormat: Text.PlainText
      visible: text !== ""
      width: parent.width
      text: root.resultText()
      color: root.running ? root.accent : Qt.darker(root.foreground, 1.3)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      wrapMode: Text.WordWrap
      maximumLineCount: 2
      elide: Text.ElideRight
    }

    Row {
      width: parent.width
      height: Style.space(40)
      spacing: Style.space(8)

      Button {
        width: parent.width - deleteButton.width - parent.spacing
        height: parent.height
        text: root.running ? "Researching…" : "Run now"
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        bordered: true
        focusable: true
        enabled: !root.running
        opacity: enabled ? 1 : 0.6
        onClicked: root.runRequested(String(root.watch.id || ""))
      }

      Button {
        id: deleteButton
        width: root.confirmingDelete ? Style.space(96) : Style.space(44)
        height: parent.height
        text: root.confirmingDelete ? "Delete?" : "󰆴"
        foreground: Color.urgent
        accent: Color.urgent
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        bordered: true
        focusable: true
        onClicked: {
          if (root.confirmingDelete) {
            root.confirmingDelete = false
            root.deleteRequested(String(root.watch.id || ""))
          } else root.confirmingDelete = true
        }
      }
    }
  }

  function scheduleText() {
    var cadence = String(root.watch.cadence || "daily")
    var label = cadence === "hourly" ? "Every hour" : cadence === "six-hourly" ? "Every 6 hours"
      : cadence === "weekly" ? "Weekly" : "Daily"
    if (root.watch.enabled !== true) return label + " · Paused"
    var next = new Date(String(root.watch.nextRunAt || ""))
    if (isNaN(next.getTime())) return label
    return label + " · Next " + next.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  }

  function resultText() {
    if (root.running) return String(root.activity.message || "Researching public sources")
    if (!root.latestRun) return "No brief yet"
    if (String(root.latestRun.status || "") === "error") return String(root.latestRun.error || "Last run failed")
    if (root.latestRun.baseline === true) return "Baseline ready · " + Number((root.latestRun.claims || []).length) + " tracked claims"
    if (root.latestRun.meaningfulChange === true)
      return Number((root.latestRun.changes || []).length) + " meaningful changes · " + String(root.latestRun.summary || "")
    return "No meaningful change · " + String(root.latestRun.summary || "")
  }
}

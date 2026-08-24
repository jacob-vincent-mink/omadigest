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
  property bool configuring: false

  signal runRequested(string watchId)
  signal watchEnabledRequested(string watchId, bool enabled)
  signal configurationRequested(string watchId, string depth, string recency)
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

    Column {
      width: parent.width
      visible: root.configuring
      spacing: Style.space(6)

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: "DEPTH"
        color: Qt.darker(root.foreground, 1.35)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        font.letterSpacing: 1
      }
      Row {
        width: parent.width
        height: Style.space(40)
        spacing: Style.space(6)
        Repeater {
          model: [{ id: "focused", label: "Focused" }, { id: "broad", label: "Broad" }, { id: "deep", label: "Deep" }]
          Button {
            required property var modelData
            width: (parent.width - parent.spacing * 2) / 3
            height: parent.height
            text: String(modelData.label)
            selected: String(root.watch.depth || "broad") === String(modelData.id)
            bordered: selected
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            fontSize: Style.font.caption
            focusable: true
            onClicked: root.configurationRequested(String(root.watch.id || ""), String(modelData.id), String(root.watch.recency || "month"))
          }
        }
      }

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: "FRESHNESS"
        color: Qt.darker(root.foreground, 1.35)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        font.letterSpacing: 1
      }
      Row {
        width: parent.width
        height: Style.space(40)
        spacing: Style.space(6)
        Repeater {
          model: [{ id: "day", label: "24h" }, { id: "week", label: "7d" }, { id: "month", label: "30d" }, { id: "anytime", label: "Any time" }]
          Button {
            required property var modelData
            width: (parent.width - parent.spacing * 3) / 4
            height: parent.height
            text: String(modelData.label)
            selected: String(root.watch.recency || "month") === String(modelData.id)
            bordered: selected
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            fontSize: Style.font.caption
            focusable: true
            onClicked: root.configurationRequested(String(root.watch.id || ""), String(root.watch.depth || "broad"), String(modelData.id))
          }
        }
      }
    }

    Row {
      width: parent.width
      height: Style.space(40)
      spacing: Style.space(8)

      Button {
        width: parent.width - configureButton.width - deleteButton.width - parent.spacing * 2
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
        id: configureButton
        width: Style.space(44)
        height: parent.height
        text: root.configuring ? "󰅖" : "󰒓"
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        bordered: root.configuring
        focusable: true
        onClicked: root.configuring = !root.configuring
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
    return label + " · " + root.depthLabel() + " · " + root.recencyLabel() + " · Next "
      + next.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  }

  function resultText() {
    if (root.running) return String(root.activity.message || "Researching public sources")
    if (!root.latestRun) return "No brief yet"
    if (String(root.latestRun.status || "") === "error") return String(root.latestRun.error || "Last run failed")
    var usage = Number(root.latestRun.readCount || 0) > 0 ? " · " + Number(root.latestRun.readCount) + " pages" : ""
    if (root.latestRun.baseline === true) return "Baseline ready · " + Number((root.latestRun.claims || []).length) + " tracked claims" + usage
    if (root.latestRun.meaningfulChange === true)
      return Number((root.latestRun.changes || []).length) + " meaningful changes" + usage + " · " + String(root.latestRun.summary || "")
    return "No meaningful change" + usage + " · " + String(root.latestRun.summary || "")
  }

  function depthLabel() {
    var depth = String(root.watch.depth || "broad")
    return depth === "focused" ? "Focused" : depth === "deep" ? "Deep" : "Broad"
  }

  function recencyLabel() {
    var recency = String(root.watch.recency || "month")
    return recency === "day" ? "24h" : recency === "week" ? "7d" : recency === "anytime" ? "Any time" : "30d"
  }
}

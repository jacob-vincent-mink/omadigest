import QtQuick
import QtQuick.Controls as QQC
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "components" as OmaDigest

Panel {
  id: root
  moduleName: "io.github.jacob-vincent-mink.omadigest"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property var hostShell: bar && bar.shell ? bar.shell : null
  readonly property var notificationService: hostShell && hostShell.firstPartyServiceFor
    ? hostShell.firstPartyServiceFor("omarchy.notifications") : null
  readonly property int liveCount: notificationService && notificationService.popupModel
    ? notificationService.popupModel.count : 0
  readonly property string notificationHistoryDir: notificationService && notificationService.historyDir
    ? String(notificationService.historyDir) : ""
  readonly property int attentionAvailableCount: root.currentAttentionItems().length

  property string page: "list"
  property string settingsPage: "integrations"
  property var selectedTemplate: null
  property string authPromptValue: ""
  property string ttsProvider: "openai-compatible"
  property var historyItems: []
  property double dndStartedAt: 0
  property string lastScheduledDay: ""
  property var pendingAutomaticGeneration: null

  function open() {
    refreshNotificationHistory()
    OmaDigest.OmaDigestStore.requestDigestHistory()
    root.controller.show()
  }
  function close() { root.controller.hide() }
  function toggle() { root.opened ? close() : open() }
  function closeForPopoutSwitch() { root.controller.hide() }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function refreshNotificationHistory() {
    if (!root.notificationHistoryDir || historyReader.running) return
    historyReader.command = ["bash", "-c", "awk 1 \"$1\"/*.json 2>/dev/null || true", "--", root.notificationHistoryDir]
    historyReader.running = true
  }

  function parseNotificationHistory(raw) {
    var parsed = []
    var lines = String(raw || "").split("\n")
    for (var index = 0; index < lines.length && parsed.length < 50; index++) {
      var line = lines[index].trim()
      if (!line) continue
      try {
        var row = JSON.parse(line)
        var timestamp = Number(row.timestamp || Date.now())
        var app = String(row.app || row.appName || "unknown").slice(0, 120)
        var title = String(row.summary || "").slice(0, 2000)
        var stable = String(row.id || row.originalId || (app + "-" + timestamp + "-" + title))
        parsed.push({
          id: "notification:" + stable.slice(0, 180), source: "notifications", app: app,
          title: title, body: String(row.body || "").slice(0, 8000),
          urgency: Number(row.urgency || 1) >= 2 ? "critical" : (Number(row.urgency || 1) <= 0 ? "low" : "normal"),
          occurredAt: new Date(timestamp).toISOString()
        })
      } catch (error) { /* Skip malformed history rows. */ }
    }
    root.historyItems = parsed
    if (root.pendingAutomaticGeneration) Qt.callLater(root.completeAutomaticGeneration)
  }

  function currentAttentionItems() {
    var result = root.historyItems.slice()
    var model = notificationService ? notificationService.popupModel : null
    if (model) {
      for (var index = 0; index < model.count && index < 200; index++) {
        var row = model.get(index)
        var timestamp = Number(row.timestamp || Date.now())
        var rawUrgency = Number(row.urgency || 1)
        var app = String(row.app || row.appName || "unknown").slice(0, 120)
        var title = String(row.summary || "").slice(0, 2000)
        var stable = String(row.id || row.originalId || (app + "-" + timestamp + "-" + title))
        result.push({
          id: "notification:" + stable.slice(0, 180), source: "notifications", app: app,
          title: title, body: String(row.body || "").slice(0, 8000),
          urgency: rawUrgency >= 2 ? "critical" : (rawUrgency <= 0 ? "low" : "normal"),
          occurredAt: new Date(timestamp).toISOString()
        })
      }
    }
    var byId = {}
    var order = []
    for (var position = 0; position < result.length; position++) {
      var id = String(result[position].id || "")
      if (!id) continue
      if (byId[id] === undefined) order.push(id)
      byId[id] = result[position]
    }
    var deduplicated = []
    for (var item = 0; item < order.length; item++) deduplicated.push(byId[order[item]])
    return deduplicated
  }

  function currentAppCounts() {
    var counts = {}
    var items = currentAttentionItems()
    for (var index = 0; index < items.length; index++) {
      var app = String(items[index].app || "unknown")
      counts[app] = Number(counts[app] || 0) + 1
    }
    return counts
  }

  function availableConnectors() {
    var result = ["notifications"]
    var integrations = OmaDigest.OmaDigestStore.integrations || []
    for (var index = 0; index < integrations.length; index++)
      if (integrations[index].enabled === true) result.push(String(integrations[index].id))
    return result
  }

  function generationContext(trigger, focusMinutes) {
    return {
      trigger: trigger || "manual",
      itemCount: root.attentionAvailableCount,
      focusMinutes: Math.max(0, Number(focusMinutes) || 0),
      appCounts: root.currentAppCounts(),
      availableConnectors: root.availableConnectors(),
      now: new Date().toISOString()
    }
  }

  function generateDigest(trigger, focusMinutes) {
    var items = root.currentAttentionItems()
    if (items.length === 0 || OmaDigest.OmaDigestStore.digestState === "working") return
    OmaDigest.OmaDigestStore.ingest(items)
    OmaDigest.OmaDigestStore.generateDigest(root.generationContext(trigger || "manual", focusMinutes || 0), "")
  }

  function requestAutomaticGeneration(trigger, focusMinutes) {
    root.pendingAutomaticGeneration = { trigger: trigger, focusMinutes: focusMinutes }
    if (root.notificationHistoryDir) root.refreshNotificationHistory()
    else root.completeAutomaticGeneration()
  }

  function completeAutomaticGeneration() {
    var pending = root.pendingAutomaticGeneration
    root.pendingAutomaticGeneration = null
    if (!pending || root.attentionAvailableCount < Number(root.setting("minimumItems", 3))) return
    root.generateDigest(pending.trigger, pending.focusMinutes)
  }

  Connections {
    target: root.notificationService
    function onDoNotDisturbChanged() {
      if (!root.notificationService) return
      if (root.notificationService.doNotDisturb) {
        root.dndStartedAt = Date.now()
        return
      }
      if (root.dndStartedAt <= 0) return
      var focusMinutes = Math.round((Date.now() - root.dndStartedAt) / 60000)
      root.dndStartedAt = 0
      root.requestAutomaticGeneration("dnd-ended", focusMinutes)
    }
  }

  Connections {
    target: OmaDigest.OmaDigestStore
    function onDigestChanged() {
      if (OmaDigest.OmaDigestStore.digest) root.page = "detail"
    }
  }

  Process {
    id: historyReader
    running: false
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.parseNotificationHistory(text)
    }
  }

  Timer {
    interval: 30000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: {
      var configured = String(root.setting("scheduleTime", "")).trim()
      if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(configured)) return
      var now = new Date()
      var current = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0")
      var day = now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate()
      if (current !== configured || root.lastScheduledDay === day) return
      root.lastScheduledDay = day
      root.requestAutomaticGeneration("scheduled", 0)
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(500))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Flickable {
        anchors.fill: parent
        contentWidth: width
        contentHeight: content.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: content
          width: parent.width
          spacing: Style.space(14)

          Row {
            width: parent.width
            spacing: Style.space(10)

            OmaDigest.OmaDigestMark {
              width: Style.space(34)
              height: width
              size: width
              accent: Color.accent
              active: OmaDigest.OmaDigestStore.digestState === "working" || OmaDigest.OmaDigestStore.draftState === "working"
            }

            Column {
              width: parent.width - headerActions.width - Style.space(54)
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(1)

              Text {
                text: root.page === "settings" ? "OMADIGEST SETTINGS"
                  : root.page === "detail" ? "DIGEST" : "OMADIGEST"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.subtitle
                font.bold: true
                font.letterSpacing: 1
              }

              Text {
                width: parent.width
                text: root.page === "list"
                  ? (OmaDigest.OmaDigestStore.digestState === "working"
                    ? "Generating a digest…" : root.attentionAvailableCount + " attention items")
                  : root.page === "settings" ? "Templates, integrations, and connections" : ""
                visible: text !== ""
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }
            }

            Row {
              id: headerActions
              spacing: Style.space(2)
              anchors.verticalCenter: parent.verticalCenter

              PanelActionButton {
                visible: root.page === "detail" || root.page === "settings"
                iconText: "󰅁"
                tooltipText: "Back to digests"
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: root.page = "list"
              }

              PanelActionButton {
                visible: root.page === "list"
                iconText: OmaDigest.OmaDigestStore.digestState === "working" ? "…" : "+"
                tooltipText: root.attentionAvailableCount > 0 ? "Generate a new digest" : "No attention items"
                foreground: root.foreground
                fontFamily: root.fontFamily
                enabled: root.attentionAvailableCount > 0 && OmaDigest.OmaDigestStore.digestState !== "working"
                onClicked: root.generateDigest("manual", 0)
              }

              PanelActionButton {
                visible: root.page === "list"
                iconText: "󰒓"
                tooltipText: "Settings"
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: root.page = "settings"
              }
            }
          }

          Rectangle {
            visible: root.page === "list" && OmaDigest.OmaDigestStore.errorMessage !== ""
            width: parent.width
            height: visible ? errorContent.implicitHeight + Style.space(20) : 0
            radius: Style.cornerRadius
            color: Style.normalFillFor(root.foreground, Color.error)
            border.width: Style.spacing.hairline
            border.color: Color.error

            Column {
              id: errorContent
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.margins: Style.space(10)
              spacing: Style.space(5)

              Row {
                width: parent.width
                Text {
                  width: parent.width - dismissError.width
                  text: OmaDigest.OmaDigestStore.errorCode === "model_not_connected"
                    ? "Connect an AI model" : "OmaDigest couldn't complete that action"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  font.bold: true
                  wrapMode: Text.WordWrap
                }
                Text {
                  id: dismissError
                  text: "×"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  MouseArea {
                    anchors.fill: parent
                    anchors.margins: -Style.space(6)
                    cursorShape: Qt.PointingHandCursor
                    onClicked: OmaDigest.OmaDigestStore.clearError()
                  }
                }
              }

              Text {
                width: parent.width
                text: OmaDigest.OmaDigestStore.errorCode === "model_not_connected"
                  ? "Digest generation needs an authenticated Pi model. Open Connections for the current status."
                  : OmaDigest.OmaDigestStore.errorMessage
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              Text {
                visible: OmaDigest.OmaDigestStore.errorCode === "model_not_connected"
                text: "Open Connections →"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                MouseArea {
                  anchors.fill: parent
                  anchors.margins: -Style.space(5)
                  cursorShape: Qt.PointingHandCursor
                  onClicked: {
                    root.settingsPage = "connections"
                    root.page = "settings"
                  }
                }
              }
            }
          }

          // Main screen: only the digest list.
          Column {
            width: parent.width
            visible: root.page === "list"
            spacing: Style.space(8)

            Text {
              visible: OmaDigest.OmaDigestStore.digestHistory.length === 0
              width: parent.width
              horizontalAlignment: Text.AlignHCenter
              text: OmaDigest.OmaDigestStore.digestState === "working"
                ? "Building your first digest…"
                : "No digests yet. Use + to generate one when you're ready."
              color: Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
              topPadding: Style.space(34)
              bottomPadding: Style.space(34)
            }

            Repeater {
              model: OmaDigest.OmaDigestStore.digestHistory

              Rectangle {
                required property var modelData
                width: parent.width
                height: digestRow.implicitHeight + Style.space(22)
                radius: Style.cornerRadius
                color: digestMouse.containsMouse
                  ? Style.hoverFillFor(root.foreground, Color.accent)
                  : Style.normalFillFor(root.foreground, Color.accent)
                border.width: Style.spacing.hairline
                border.color: Style.normalBorderFor(root.foreground, Color.accent)

                Row {
                  id: digestRow
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.margins: Style.space(11)
                  spacing: Style.space(10)

                  Column {
                    width: parent.width - digestChevron.width - Style.space(12)
                    spacing: Style.space(2)
                    Text {
                      width: parent.width
                      text: String(modelData.title)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                      font.bold: true
                      elide: Text.ElideRight
                    }
                    Text {
                      width: parent.width
                      text: new Date(modelData.generatedAt).toLocaleString(Qt.locale(), "MMM d · hh:mm")
                        + " · " + String(modelData.templateId)
                      color: Qt.darker(root.foreground, 1.4)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }
                  }

                  Text {
                    id: digestChevron
                    anchors.verticalCenter: parent.verticalCenter
                    text: "󰅂"
                    color: Color.accent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                  }
                }

                MouseArea {
                  id: digestMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: OmaDigest.OmaDigestStore.openDigestFromHistory(modelData)
                }
              }
            }
          }

          // Clicking a list item opens this focused reader.
          Column {
            width: parent.width
            visible: root.page === "detail" && OmaDigest.OmaDigestStore.digest !== null
            spacing: Style.space(12)

            Row {
              width: parent.width
              spacing: Style.space(8)

              Column {
                width: parent.width - detailActions.width - Style.space(8)
                spacing: Style.space(2)
                Text {
                  width: parent.width
                  text: OmaDigest.OmaDigestStore.digest ? String(OmaDigest.OmaDigestStore.digest.title) : ""
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.displaySmall
                  font.bold: true
                  wrapMode: Text.WordWrap
                }
                Text {
                  text: OmaDigest.OmaDigestStore.digest
                    ? new Date(OmaDigest.OmaDigestStore.digest.generatedAt).toLocaleString(Qt.locale(), "MMM d · hh:mm") : ""
                  color: Qt.darker(root.foreground, 1.4)
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
              }

              Row {
                id: detailActions
                spacing: Style.space(2)
                PanelActionButton {
                  iconText: OmaDigest.OmaDigestStore.tts.state === "playing" ? "󰏤" : "󰋋"
                  tooltipText: OmaDigest.OmaDigestStore.tts.configured ? "Read digest" : "Configure read mode"
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  enabled: OmaDigest.OmaDigestStore.tts.configured
                  onClicked: {
                    if (OmaDigest.OmaDigestStore.tts.state === "playing" || OmaDigest.OmaDigestStore.tts.state === "paused")
                      OmaDigest.OmaDigestStore.pauseReadMode()
                    else OmaDigest.OmaDigestStore.readDigest()
                  }
                }
                PanelActionButton {
                  visible: OmaDigest.OmaDigestStore.tts.state !== "idle"
                  iconText: "󰓛"
                  tooltipText: "Stop reading"
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: OmaDigest.OmaDigestStore.stopReadMode()
                }
              }
            }

            Repeater {
              model: OmaDigest.OmaDigestStore.digest ? OmaDigest.OmaDigestStore.digest.sections : []

              Column {
                required property var modelData
                width: parent.width
                spacing: Style.space(6)

                Text {
                  text: String(modelData.title).toUpperCase()
                  color: Color.accent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: true
                  font.letterSpacing: 1
                }

                Repeater {
                  model: modelData.entries || []
                  Rectangle {
                    required property var modelData
                    width: parent.width
                    height: entryText.implicitHeight + Style.space(18)
                    radius: Style.cornerRadius
                    color: Style.normalFillFor(root.foreground, Color.accent)
                    Text {
                      id: entryText
                      anchors.fill: parent
                      anchors.margins: Style.space(9)
                      text: String(modelData.headline) + "\n" + String(modelData.explanation)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      wrapMode: Text.WordWrap
                    }
                  }
                }
              }
            }
          }

          // Management lives behind one corner icon.
          Column {
            width: parent.width
            visible: root.page === "settings"
            spacing: Style.space(12)

            Row {
              width: parent.width
              spacing: Style.space(6)

              Repeater {
                model: [
                  { id: "integrations", label: "Integrations" },
                  { id: "templates", label: "Templates" },
                  { id: "connections", label: "Connections" }
                ]
                Rectangle {
                  required property var modelData
                  width: (content.width - Style.space(12)) / 3
                  height: Style.space(34)
                  radius: Style.cornerRadius
                  color: root.settingsPage === modelData.id
                    ? Style.selectedFillFor(root.foreground, Color.accent)
                    : (settingsTabMouse.containsMouse ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent")
                  Text {
                    anchors.centerIn: parent
                    text: String(modelData.label)
                    color: root.settingsPage === modelData.id ? Color.accent : root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: root.settingsPage === modelData.id
                  }
                  MouseArea {
                    id: settingsTabMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      root.settingsPage = String(modelData.id)
                      if (root.settingsPage === "templates") root.selectedTemplate = null
                    }
                  }
                }
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "integrations"
              spacing: Style.space(12)

              Text {
                visible: OmaDigest.OmaDigestStore.integrations.length === 0
                width: parent.width
                text: "No integrations installed."
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
              }

              Repeater {
                model: OmaDigest.OmaDigestStore.integrations
                OmaDigest.IntegrationCard {
                  required property var modelData
                  integration: modelData
                  width: parent.width
                  foreground: root.foreground
                  accent: Color.accent
                  fontFamily: root.fontFamily
                }
              }

              Text {
                text: "CREATE AN INTEGRATION"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }
              OmaDigest.DraftEditor {
                kind: "integration"
                width: parent.width
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "templates" && root.selectedTemplate === null
              spacing: Style.space(10)

              Repeater {
                model: OmaDigest.OmaDigestStore.templates
                Rectangle {
                  required property var modelData
                  width: parent.width
                  height: templateRow.implicitHeight + Style.space(18)
                  radius: Style.cornerRadius
                  color: templateMouse.containsMouse
                    ? Style.hoverFillFor(root.foreground, Color.accent)
                    : Style.normalFillFor(root.foreground, Color.accent)

                  Row {
                    id: templateRow
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.margins: Style.space(9)
                    spacing: Style.space(8)

                    Text {
                      width: parent.width - templateChevron.width - Style.space(10)
                      text: String(modelData.name) + "\n" + String(modelData.description)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      wrapMode: Text.WordWrap
                    }
                    Text {
                      id: templateChevron
                      anchors.verticalCenter: parent.verticalCenter
                      text: "󰅂"
                      color: Color.accent
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                    }
                  }

                  MouseArea {
                    id: templateMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.selectedTemplate = modelData
                  }
                }
              }

              Text {
                text: "CREATE A TEMPLATE"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }
              OmaDigest.DraftEditor {
                kind: "template"
                width: parent.width
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "templates" && root.selectedTemplate !== null
              spacing: Style.space(12)

              Text {
                text: "‹ All templates"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                MouseArea {
                  anchors.fill: parent
                  anchors.margins: -Style.space(6)
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.selectedTemplate = null
                }
              }

              Text {
                width: parent.width
                text: root.selectedTemplate ? String(root.selectedTemplate.name) : ""
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.displaySmall
                font.bold: true
                wrapMode: Text.WordWrap
              }
              Text {
                width: parent.width
                text: root.selectedTemplate ? String(root.selectedTemplate.description) : ""
                color: Qt.darker(root.foreground, 1.25)
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                wrapMode: Text.WordWrap
              }

              Rectangle {
                width: parent.width
                height: templateDetails.implicitHeight + Style.space(20)
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)

                Column {
                  id: templateDetails
                  anchors.fill: parent
                  anchors.margins: Style.space(10)
                  spacing: Style.space(8)

                  Text {
                    width: parent.width
                    text: root.selectedTemplate
                      ? "SECTIONS\n" + (root.selectedTemplate.output.sections || []).join("  ·  ") : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                  Text {
                    width: parent.width
                    text: root.selectedTemplate
                      ? "SOURCES\n" + (root.selectedTemplate.context.connectors || []).join("  ·  ") : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                  Text {
                    width: parent.width
                    text: {
                      if (!root.selectedTemplate) return ""
                      var match = root.selectedTemplate.match || {}
                      var pieces = []
                      if ((match.triggers || []).length) pieces.push("triggers: " + match.triggers.join(", "))
                      if (match.minimumItems !== undefined) pieces.push("at least " + match.minimumItems + " items")
                      if (match.minimumFocusMinutes !== undefined) pieces.push("after " + match.minimumFocusMinutes + "+ focus minutes")
                      return "MATCHING\n" + (pieces.length ? pieces.join("  ·  ") : "Manual or fallback")
                    }
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                  Text {
                    width: parent.width
                    text: root.selectedTemplate
                      ? "LIMITS\n" + root.selectedTemplate.output.maximumEntries + " entries  ·  "
                        + root.selectedTemplate.context.maximumItems + " context items" : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                }
              }

              Text {
                text: "INSTRUCTIONS"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }
              Text {
                width: parent.width
                text: root.selectedTemplate ? String(root.selectedTemplate.instructions) : ""
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "connections"
              spacing: Style.space(10)

              Rectangle {
                width: parent.width
                height: agentConnection.implicitHeight + Style.space(20)
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)
                Column {
                  id: agentConnection
                  anchors.fill: parent
                  anchors.margins: Style.space(10)
                  spacing: Style.space(3)
                  Text {
                    text: "PI AGENT"
                    color: Color.accent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    font.letterSpacing: 1
                  }
                  Text {
                    width: parent.width
                    text: OmaDigest.OmaDigestStore.agentConnection.connected
                      ? OmaDigest.OmaDigestStore.agentConnection.provider + " · " + OmaDigest.OmaDigestStore.agentConnection.model
                      : "Not connected. Authenticate a model with Pi."
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                }
              }

              Text {
                text: "SIGN IN"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }
              Text {
                width: parent.width
                text: "Choose a provider. Browser-based sign-in opens automatically; API keys stay in OmaDigest's private configuration."
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              Repeater {
                model: OmaDigest.OmaDigestStore.authMethods
                Rectangle {
                  required property var modelData
                  width: parent.width
                  height: authMethodText.implicitHeight + Style.space(18)
                  radius: Style.cornerRadius
                  color: authMethodMouse.containsMouse
                    ? Style.hoverFillFor(root.foreground, Color.accent)
                    : Style.normalFillFor(root.foreground, Color.accent)
                  opacity: ["starting", "browser", "device_code", "prompt", "info"].indexOf(OmaDigest.OmaDigestStore.auth.phase) >= 0 ? 0.5 : 1

                  Row {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.margins: Style.space(9)
                    spacing: Style.space(8)
                    Text {
                      id: authMethodText
                      width: parent.width - authMethodAction.width - Style.space(10)
                      text: String(modelData.label) + "\n" + String(modelData.description)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      wrapMode: Text.WordWrap
                    }
                    Text {
                      id: authMethodAction
                      anchors.verticalCenter: parent.verticalCenter
                      text: "Sign in"
                      color: Color.accent
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      font.bold: true
                    }
                  }
                  MouseArea {
                    id: authMethodMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    enabled: ["starting", "browser", "device_code", "prompt", "info"].indexOf(OmaDigest.OmaDigestStore.auth.phase) < 0
                    cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onClicked: {
                      root.authPromptValue = ""
                      OmaDigest.OmaDigestStore.beginAuth(modelData.id)
                    }
                  }
                }
              }

              Rectangle {
                visible: OmaDigest.OmaDigestStore.auth.phase !== "idle"
                width: parent.width
                height: visible ? authFlowContent.implicitHeight + Style.space(20) : 0
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground,
                  OmaDigest.OmaDigestStore.auth.phase === "error" ? Color.error : Color.accent)
                border.width: Style.spacing.hairline
                border.color: OmaDigest.OmaDigestStore.auth.phase === "error" ? Color.error : Color.accent

                Column {
                  id: authFlowContent
                  anchors.fill: parent
                  anchors.margins: Style.space(10)
                  spacing: Style.space(8)

                  Text {
                    width: parent.width
                    text: OmaDigest.OmaDigestStore.auth.phase === "complete" ? "Connected"
                      : OmaDigest.OmaDigestStore.auth.phase === "error" ? "Sign-in failed" : "Sign-in in progress"
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    wrapMode: Text.WordWrap
                  }
                  Text {
                    visible: text !== ""
                    width: parent.width
                    text: String(OmaDigest.OmaDigestStore.auth.message || "")
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                  Text {
                    visible: OmaDigest.OmaDigestStore.auth.userCode !== ""
                    text: visible ? "Code: " + OmaDigest.OmaDigestStore.auth.userCode : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.subtitle
                    font.bold: true
                  }

                  Rectangle {
                    visible: OmaDigest.OmaDigestStore.auth.url !== "" || OmaDigest.OmaDigestStore.auth.verificationUri !== ""
                    width: Style.space(190)
                    height: visible ? Style.space(34) : 0
                    radius: Style.cornerRadius
                    color: Color.accent
                    Text {
                      anchors.centerIn: parent
                      text: "Open sign-in page"
                      color: Color.background
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.bold: true
                    }
                    MouseArea {
                      anchors.fill: parent
                      cursorShape: Qt.PointingHandCursor
                      onClicked: OmaDigest.OmaDigestStore.openAuthUrl()
                    }
                  }

                  Repeater {
                    model: OmaDigest.OmaDigestStore.auth.prompt
                      && OmaDigest.OmaDigestStore.auth.prompt.kind === "select"
                      ? (OmaDigest.OmaDigestStore.auth.prompt.options || []) : []
                    Rectangle {
                      required property var modelData
                      width: parent.width
                      height: Style.space(34)
                      radius: Style.cornerRadius
                      color: root.authPromptValue === modelData.id
                        ? Style.selectedFillFor(root.foreground, Color.accent)
                        : Style.normalFillFor(root.foreground, Color.accent)
                      Text {
                        anchors.centerIn: parent
                        text: String(modelData.label)
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                      }
                      MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.authPromptValue = String(modelData.id)
                      }
                    }
                  }

                  QQC.TextField {
                    id: authPromptInput
                    visible: OmaDigest.OmaDigestStore.auth.prompt
                      && OmaDigest.OmaDigestStore.auth.prompt.kind !== "select"
                    width: parent.width
                    placeholderText: visible ? String(OmaDigest.OmaDigestStore.auth.prompt.placeholder
                      || OmaDigest.OmaDigestStore.auth.prompt.message || "") : ""
                    echoMode: visible && OmaDigest.OmaDigestStore.auth.prompt.kind === "secret"
                      ? TextInput.Password : TextInput.Normal
                    color: root.foreground
                    font.family: root.fontFamily
                    onVisibleChanged: if (visible) text = ""
                  }

                  Row {
                    visible: OmaDigest.OmaDigestStore.auth.prompt !== null
                      || ["starting", "browser", "device_code", "info"].indexOf(OmaDigest.OmaDigestStore.auth.phase) >= 0
                    height: visible ? Style.space(34) : 0
                    spacing: Style.space(8)

                    Rectangle {
                      visible: OmaDigest.OmaDigestStore.auth.prompt !== null
                      width: Style.space(120)
                      height: parent.height
                      radius: Style.cornerRadius
                      color: Color.accent
                      Text {
                        anchors.centerIn: parent
                        text: "Continue"
                        color: Color.background
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                      }
                      MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: OmaDigest.OmaDigestStore.respondAuth(
                          OmaDigest.OmaDigestStore.auth.prompt.kind === "select" ? root.authPromptValue : authPromptInput.text)
                      }
                    }
                    Rectangle {
                      width: Style.space(100)
                      height: parent.height
                      radius: Style.cornerRadius
                      color: Style.normalFillFor(root.foreground, Color.accent)
                      Text {
                        anchors.centerIn: parent
                        text: "Cancel"
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                      }
                      MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: OmaDigest.OmaDigestStore.cancelAuth()
                      }
                    }
                  }
                }
              }

              Rectangle {
                width: parent.width
                height: voiceConnection.implicitHeight + Style.space(20)
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)
                Column {
                  id: voiceConnection
                  anchors.fill: parent
                  anchors.margins: Style.space(10)
                  spacing: Style.space(3)
                  Text {
                    text: "VOICE INPUT"
                    color: Color.accent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    font.letterSpacing: 1
                  }
                  Text {
                    text: OmaDigest.OmaDigestStore.dictationAvailable ? "Voxtype ready" : "Voxtype unavailable"
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                  }
                }
              }

              Text {
                text: "READ MODE"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }
              Text {
                width: parent.width
                text: OmaDigest.OmaDigestStore.tts.configured
                  ? "Configured for " + String(OmaDigest.OmaDigestStore.tts.config.provider)
                  : "Configure an OpenAI-compatible speech endpoint or ElevenLabs. Keys are stored in Secret Service."
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              Row {
                spacing: Style.space(6)
                Repeater {
                  model: ["openai-compatible", "elevenlabs"]
                  Rectangle {
                    required property string modelData
                    width: Style.space(150)
                    height: Style.space(30)
                    radius: Style.cornerRadius
                    color: root.ttsProvider === modelData
                      ? Style.selectedFillFor(root.foreground, Color.accent)
                      : Style.normalFillFor(root.foreground, Color.accent)
                    Text {
                      anchors.centerIn: parent
                      text: modelData === "elevenlabs" ? "ElevenLabs" : "OpenAI-compatible"
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                    }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.ttsProvider = modelData }
                  }
                }
              }

              QQC.TextField {
                id: ttsEndpoint
                width: parent.width
                placeholderText: root.ttsProvider === "elevenlabs" ? "https://api.elevenlabs.io" : "https://api.openai.com/v1"
                color: root.foreground
                font.family: root.fontFamily
              }
              QQC.TextField {
                id: ttsModel
                width: parent.width
                placeholderText: root.ttsProvider === "elevenlabs" ? "eleven_multilingual_v2" : "gpt-4o-mini-tts"
                color: root.foreground
                font.family: root.fontFamily
              }
              QQC.TextField {
                id: ttsVoice
                width: parent.width
                placeholderText: root.ttsProvider === "elevenlabs" ? "Voice ID" : "alloy"
                color: root.foreground
                font.family: root.fontFamily
              }
              QQC.TextField {
                id: ttsApiKey
                width: parent.width
                placeholderText: "API key"
                echoMode: TextInput.Password
                color: root.foreground
                font.family: root.fontFamily
              }

              Rectangle {
                width: Style.space(150)
                height: Style.space(36)
                radius: Style.cornerRadius
                color: Color.accent
                opacity: ttsEndpoint.text.trim() && ttsModel.text.trim() && ttsVoice.text.trim() && ttsApiKey.text.trim() ? 1 : 0.5
                Text {
                  anchors.centerIn: parent
                  text: "Save read mode"
                  color: Color.background
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: true
                }
                MouseArea {
                  anchors.fill: parent
                  enabled: ttsEndpoint.text.trim() && ttsModel.text.trim() && ttsVoice.text.trim() && ttsApiKey.text.trim()
                  cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                  onClicked: {
                    OmaDigest.OmaDigestStore.configureTts(root.ttsProvider, ttsEndpoint.text, ttsModel.text, ttsVoice.text, 1, ttsApiKey.text)
                    ttsApiKey.text = ""
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

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
  property var historyItems: []
  property string ttsProvider: "openai-compatible"
  property double dndStartedAt: 0
  property string lastScheduledDay: ""
  property var pendingAutomaticGeneration: null

  function open() {
    root.refreshNotificationHistory()
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

  function currentAppCounts() {
    var result = {}
    var items = root.currentAttentionItems()
    for (var index = 0; index < items.length; index++) {
      var app = String(items[index].app || "unknown")
      result[app] = Number(result[app] || 0) + 1
    }
    return result
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

  function requestAutomaticGeneration(trigger, focusMinutes) {
    root.pendingAutomaticGeneration = { trigger: trigger, focusMinutes: focusMinutes }
    if (root.notificationHistoryDir) root.refreshNotificationHistory()
    else root.completeAutomaticGeneration()
  }

  function completeAutomaticGeneration() {
    var pending = root.pendingAutomaticGeneration
    root.pendingAutomaticGeneration = null
    if (!pending || root.attentionAvailableCount < Number(root.setting("minimumItems", 3))) return
    OmaDigest.OmaDigestStore.ingest(root.currentAttentionItems())
    OmaDigest.OmaDigestStore.generateDigest(root.generationContext(pending.trigger, pending.focusMinutes), "")
  }

  function currentAttentionItems() {
    var result = root.historyItems.slice()
    var model = notificationService ? notificationService.popupModel : null
    if (!model) return root.deduplicateAttentionItems(result)
    for (var index = 0; index < model.count && index < 200; index++) {
      var row = model.get(index)
      var timestamp = Number(row.timestamp || Date.now())
      var rawUrgency = Number(row.urgency || 1)
      var app = String(row.app || row.appName || "unknown").slice(0, 120)
      var title = String(row.summary || "").slice(0, 2000)
      var stable = String(row.id || row.originalId || (app + "-" + timestamp + "-" + title))
      result.push({
        id: "notification:" + stable.slice(0, 180),
        source: "notifications",
        app: app,
        title: title,
        body: String(row.body || "").slice(0, 8000),
        urgency: rawUrgency >= 2 ? "critical" : (rawUrgency <= 0 ? "low" : "normal"),
        occurredAt: new Date(timestamp).toISOString()
      })
    }
    return root.deduplicateAttentionItems(result)
  }

  function deduplicateAttentionItems(items) {
    var byId = {}
    var order = []
    for (var index = 0; index < items.length; index++) {
      var id = String(items[index].id || "")
      if (!id) continue
      if (byId[id] === undefined) order.push(id)
      byId[id] = items[index]
    }
    var result = []
    for (var position = 0; position < order.length; position++) result.push(byId[order[position]])
    return result
  }

  function availableConnectors() {
    var result = ["notifications"]
    var integrations = OmaDigest.OmaDigestStore.integrations || []
    for (var i = 0; i < integrations.length; i++)
      if (integrations[i].enabled === true) result.push(String(integrations[i].id))
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

  function routeCurrentInbox() {
    OmaDigest.OmaDigestStore.ingest(root.currentAttentionItems())
    OmaDigest.OmaDigestStore.selectTemplate(
      "manual", root.attentionAvailableCount, 0, root.currentAppCounts(), root.availableConnectors())
  }

  function generateCurrentDigest() {
    OmaDigest.OmaDigestStore.ingest(root.currentAttentionItems())
    OmaDigest.OmaDigestStore.generateDigest(root.generationContext("manual", 0),
      OmaDigest.OmaDigestStore.selection ? OmaDigest.OmaDigestStore.selection.templateId : "")
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

  Connections {
    target: OmaDigest.OmaDigestStore
    function onTranscriptChanged() {
      var text = String(OmaDigest.OmaDigestStore.transcript || "").trim()
      if (text) draftInput.text = draftInput.text.trim() ? draftInput.text.trim() + " " + text : text
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
              width: parent.width - Style.space(48)
              spacing: Style.space(2)

              Text {
                text: "OMADIGEST"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.subtitle
                font.bold: true
                font.letterSpacing: 1
              }

              Text {
                width: parent.width
                text: "Turn interruptions into a cited briefing shaped by your skills."
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                wrapMode: Text.WordWrap
              }
            }
          }

          Rectangle {
            width: parent.width
            height: inboxColumn.implicitHeight + Style.space(24)
            radius: Style.cornerRadius
            color: Style.normalFillFor(root.foreground, Color.accent)
            border.width: Style.spacing.hairline
            border.color: Style.normalBorderFor(root.foreground, Color.accent)

            Column {
              id: inboxColumn
              anchors.fill: parent
              anchors.margins: Style.space(12)
              spacing: Style.space(8)

              Text {
                text: root.attentionAvailableCount === 1 ? "1 attention item" : root.attentionAvailableCount + " attention items"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                font.bold: true
              }

              Text {
                width: parent.width
                text: OmaDigest.OmaDigestStore.status
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              Rectangle {
                width: parent.width
                height: Style.space(38)
                radius: Style.cornerRadius
                color: routeMouse.containsMouse
                  ? Style.hoverFillFor(root.foreground, Color.accent)
                  : Color.accent
                opacity: OmaDigest.OmaDigestStore.ready ? 1 : 0.5

                Text {
                  anchors.centerIn: parent
                  text: "Choose a template for this inbox"
                  color: Color.background
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  font.bold: true
                }

                MouseArea {
                  id: routeMouse
                  anchors.fill: parent
                  enabled: OmaDigest.OmaDigestStore.ready
                  hoverEnabled: true
                  cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                  onClicked: root.routeCurrentInbox()
                }
              }
            }
          }

          Column {
            width: parent.width
            visible: OmaDigest.OmaDigestStore.selection !== null
            spacing: Style.space(6)

            Text {
              text: OmaDigest.OmaDigestStore.selection
                ? "SELECTED · " + String(OmaDigest.OmaDigestStore.selection.name).toUpperCase() : ""
              color: Color.accent
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1
            }

            Repeater {
              model: OmaDigest.OmaDigestStore.selection ? OmaDigest.OmaDigestStore.selection.reasons : []

              Text {
                required property var modelData
                width: parent.width
                text: "• " + String(modelData)
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                wrapMode: Text.WordWrap
              }
            }
          }

          Rectangle {
            width: parent.width
            height: Style.space(40)
            radius: Style.cornerRadius
            color: generateMouse.containsMouse ? Style.hoverFillFor(root.foreground, Color.accent) : Color.accent
            opacity: root.attentionAvailableCount > 0 && OmaDigest.OmaDigestStore.digestState !== "working" ? 1 : 0.5

            Text {
              anchors.centerIn: parent
              text: OmaDigest.OmaDigestStore.digestState === "working" ? "Building digest…" : "Generate digest"
              color: Color.background
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              font.bold: true
            }

            MouseArea {
              id: generateMouse
              anchors.fill: parent
              enabled: root.attentionAvailableCount > 0 && OmaDigest.OmaDigestStore.digestState !== "working"
              hoverEnabled: true
              cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
              onClicked: root.generateCurrentDigest()
            }
          }

          Column {
            width: parent.width
            visible: OmaDigest.OmaDigestStore.digest !== null
            spacing: Style.space(8)

            Row {
              width: parent.width
              spacing: Style.space(8)

              Text {
                width: parent.width - readButton.width - Style.space(8)
                text: OmaDigest.OmaDigestStore.digest ? String(OmaDigest.OmaDigestStore.digest.title) : ""
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.subtitle
                font.bold: true
                wrapMode: Text.WordWrap
              }

              PanelActionButton {
                id: readButton
                iconText: OmaDigest.OmaDigestStore.tts.state === "playing" ? "󰏤" : "󰋋"
                tooltipText: OmaDigest.OmaDigestStore.tts.configured ? "Read digest" : "Configure read mode in settings"
                foreground: root.foreground
                fontFamily: root.fontFamily
                enabled: OmaDigest.OmaDigestStore.tts.configured
                onClicked: {
                  if (OmaDigest.OmaDigestStore.tts.state === "playing") OmaDigest.OmaDigestStore.pauseReadMode()
                  else if (OmaDigest.OmaDigestStore.tts.state === "paused") OmaDigest.OmaDigestStore.pauseReadMode()
                  else OmaDigest.OmaDigestStore.readDigest()
                }
              }
            }

            Repeater {
              model: OmaDigest.OmaDigestStore.digest ? OmaDigest.OmaDigestStore.digest.sections : []

              Column {
                required property var modelData
                width: parent.width
                spacing: Style.space(4)

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
                  Text {
                    required property var modelData
                    width: parent.width
                    text: "• " + String(modelData.headline) + " — " + String(modelData.explanation)
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                }
              }
            }
          }

          Column {
            width: parent.width
            visible: OmaDigest.OmaDigestStore.digestHistory.length > 0
            spacing: Style.space(6)

            Text {
              text: "RECENT DIGESTS"
              color: Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1
            }

            Repeater {
              model: OmaDigest.OmaDigestStore.digestHistory.slice(0, 5)
              Rectangle {
                required property var modelData
                width: parent.width
                height: historyTitle.implicitHeight + Style.space(16)
                radius: Style.cornerRadius
                color: historyMouse.containsMouse
                  ? Style.hoverFillFor(root.foreground, Color.accent)
                  : Style.normalFillFor(root.foreground, Color.accent)

                Text {
                  id: historyTitle
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.margins: Style.space(8)
                  text: String(modelData.title) + " · " + new Date(modelData.generatedAt).toLocaleString(Qt.locale(), "MMM d hh:mm")
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  elide: Text.ElideRight
                }

                MouseArea {
                  id: historyMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: OmaDigest.OmaDigestStore.openDigestFromHistory(modelData)
                }
              }
            }
          }

          Column {
            width: parent.width
            spacing: Style.space(6)

            Text {
              text: "AVAILABLE SKILLS"
              color: Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1
            }

            Repeater {
              model: OmaDigest.OmaDigestStore.templates

              Row {
                required property var modelData
                width: parent.width
                spacing: Style.space(8)

                Text {
                  text: "›"
                  color: Color.accent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                }

                Text {
                  width: parent.width - Style.space(24)
                  text: String(modelData.name) + " — " + String(modelData.description)
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: Text.WordWrap
                }
              }
            }
          }

          Column {
            width: parent.width
            spacing: Style.space(8)

            Text {
              text: "DRAFT WITH THE AGENT"
              color: Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1
            }

            Row {
              spacing: Style.space(8)
              Repeater {
                model: ["template", "integration"]
                Rectangle {
                  required property string modelData
                  width: Style.space(110)
                  height: Style.space(32)
                  radius: Style.cornerRadius
                  color: OmaDigest.OmaDigestStore.draftKind === modelData
                    ? Style.selectedFillFor(root.foreground, Color.accent)
                    : Style.normalFillFor(root.foreground, Color.accent)
                  Text {
                    anchors.centerIn: parent
                    text: modelData.charAt(0).toUpperCase() + modelData.slice(1)
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                  }
                  MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: OmaDigest.OmaDigestStore.draftKind = modelData
                  }
                }
              }
            }

            QQC.TextArea {
              id: draftInput
              width: parent.width
              height: Style.space(96)
              color: root.foreground
              placeholderText: OmaDigest.OmaDigestStore.draftKind === "template"
                ? "Describe the briefing you want…"
                : "Describe the source you want to connect…"
              placeholderTextColor: Qt.darker(root.foreground, 1.6)
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              wrapMode: TextEdit.Wrap
              background: Rectangle {
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)
                border.width: Style.spacing.hairline
                border.color: Style.normalBorderFor(root.foreground, Color.accent)
              }
            }

            Row {
              spacing: Style.space(8)

              PanelActionButton {
                iconText: OmaDigest.OmaDigestStore.dictationState === "recording" ? "󰍬" : "󰍭"
                tooltipText: OmaDigest.OmaDigestStore.dictationAvailable ? "Dictate" : "Voxtype is unavailable"
                foreground: root.foreground
                fontFamily: root.fontFamily
                enabled: OmaDigest.OmaDigestStore.dictationAvailable
                onClicked: OmaDigest.OmaDigestStore.toggleDictation()
              }

              Rectangle {
                width: Style.space(170)
                height: Style.space(36)
                radius: Style.cornerRadius
                color: draftMouse.containsMouse ? Style.hoverFillFor(root.foreground, Color.accent) : Color.accent
                opacity: draftInput.text.trim() && OmaDigest.OmaDigestStore.draftState !== "working" ? 1 : 0.5
                Text {
                  anchors.centerIn: parent
                  text: OmaDigest.OmaDigestStore.draftState === "working" ? "Drafting…" : "Draft " + OmaDigest.OmaDigestStore.draftKind
                  color: Color.background
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: true
                }
                MouseArea {
                  id: draftMouse
                  anchors.fill: parent
                  enabled: draftInput.text.trim() && OmaDigest.OmaDigestStore.draftState !== "working"
                  hoverEnabled: true
                  cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                  onClicked: OmaDigest.OmaDigestStore.startDraft(OmaDigest.OmaDigestStore.draftKind, draftInput.text)
                }
              }
            }

            Text {
              visible: OmaDigest.OmaDigestStore.draft !== null
              width: parent.width
              text: {
                var draft = OmaDigest.OmaDigestStore.draft
                if (!draft) return ""
                if (draft.kind === "out-of-scope") return String(draft.message)
                if (draft.kind === "clarification") return String(draft.question)
                if (draft.kind === "template") return "Template draft: " + String(draft.compiled.name)
                return "Integration draft contains " + String((draft.files || []).length) + " reviewed files."
              }
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              wrapMode: Text.WordWrap
            }

            QQC.TextArea {
              visible: OmaDigest.OmaDigestStore.draft !== null
                && (OmaDigest.OmaDigestStore.draft.kind === "template" || OmaDigest.OmaDigestStore.draft.kind === "integration")
              width: parent.width
              height: visible ? Style.space(150) : 0
              readOnly: true
              text: visible ? JSON.stringify(OmaDigest.OmaDigestStore.draft, null, 2).slice(0, 12000) : ""
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              wrapMode: TextEdit.NoWrap
              background: Rectangle {
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)
                border.width: Style.spacing.hairline
                border.color: Style.normalBorderFor(root.foreground, Color.accent)
              }
            }

            Row {
              visible: OmaDigest.OmaDigestStore.draft !== null
                && (OmaDigest.OmaDigestStore.draft.kind === "template" || OmaDigest.OmaDigestStore.draft.kind === "integration")
              height: visible ? Style.space(36) : 0
              spacing: Style.space(8)

              Rectangle {
                width: Style.space(120)
                height: parent.height
                radius: Style.cornerRadius
                color: Color.accent
                Text {
                  anchors.centerIn: parent
                  text: "Accept"
                  color: Color.background
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: true
                }
                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: OmaDigest.OmaDigestStore.acceptDraft() }
              }

              Rectangle {
                width: Style.space(120)
                height: parent.height
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)
                Text {
                  anchors.centerIn: parent
                  text: "Discard"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }
                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: OmaDigest.OmaDigestStore.rejectDraft() }
              }
            }

            Rectangle {
              visible: OmaDigest.OmaDigestStore.draft && OmaDigest.OmaDigestStore.draft.kind === "out-of-scope"
              width: parent.width
              height: visible ? Style.space(36) : 0
              radius: Style.cornerRadius
              color: Style.normalFillFor(root.foreground, Color.accent)
              Text {
                anchors.centerIn: parent
                text: "Open in default agent"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }
              MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: OmaDigest.OmaDigestStore.handoffDefaultAgent(OmaDigest.OmaDigestStore.draft.suggestedPrompt)
              }
            }
          }

          Column {
            width: parent.width
            spacing: Style.space(6)

            Text {
              text: "INTEGRATIONS"
              color: Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1
            }

            Text {
              visible: OmaDigest.OmaDigestStore.integrations.length === 0
              width: parent.width
              text: "No integrations installed. Draft one above; generated packages remain disabled until reviewed and accepted."
              color: Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              wrapMode: Text.WordWrap
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
          }

          Column {
            width: parent.width
            spacing: Style.space(8)

            Text {
              text: "READ MODE"
              color: Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1
            }

            Text {
              width: parent.width
              text: OmaDigest.OmaDigestStore.tts.configured
                ? "Configured for " + String(OmaDigest.OmaDigestStore.tts.config.provider)
                : "Use an OpenAI-compatible speech endpoint or ElevenLabs. The API key is stored in Secret Service."
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              wrapMode: Text.WordWrap
            }

            Row {
              spacing: Style.space(8)
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

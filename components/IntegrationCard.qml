import QtQuick
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

Rectangle {
  id: root

  required property var integration
  property bool detail: false
  property color foreground: Color.foreground
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property var values: ({})
  property bool detailsExpanded: false

  signal openRequested(var integration)

  readonly property string sourceId: String(root.integration.id || "")
  readonly property string sourceKind: String(root.integration.kind || root.integration.sourceKind
    || (root.integration.source === "core" ? "core" : "connector"))
  readonly property bool isCore: sourceKind === "core"
  readonly property bool configurable: root.integration.configurable !== false
  readonly property var setup: root.integration.setup || ({})
  readonly property var categories: root.integration.categories || []
  readonly property var liveStatus: OmaDigestStore.integrationStatus[root.sourceId]
    || OmaDigestStore.integrationSetup[root.sourceId] || null
  readonly property var status: root.liveStatus || root.integration.status || null
  readonly property string statusState: root.normalizedStatusState()
  readonly property string statusLabel: root.normalizedStatusLabel()
  readonly property color statusColor: statusState === "green" ? "#62b879"
    : statusState === "red" ? Color.urgent : "#d6a84b"
  readonly property bool needsAuthentication: ["authentication-required", "authentication_required", "auth-required", "unauthenticated"].indexOf(
      String(root.status && root.status.state || "").toLowerCase()) >= 0
    && ((root.setup.fields || []).length > 0 || (root.status && root.status.action))
  readonly property bool needsSetup: !root.needsAuthentication && !root.isCore
    && !(root.liveStatus && root.liveStatus.ready === true)
    && ((root.setup.fields || []).length > 0
      || (root.status && root.status.action)
      || ["setup-required", "setup_required"].indexOf(
        String(root.status && root.status.state || "").toLowerCase()) >= 0)
  readonly property string contextActionLabel: root.needsAuthentication
    ? "Authenticate"
    : root.needsSetup ? "Set up" : ""
  readonly property bool sourceEnabled: root.integration.enabled !== false
  readonly property string categorySummary: root.categorySummaryText()
  readonly property bool checking: root.status !== null && root.status !== undefined
    && (root.status.checking === true || String(root.status.state || "") === "checking")

  width: parent ? parent.width : Style.space(420)
  height: detail ? detailContent.implicitHeight + Style.space(22) : Style.space(58)
  radius: Style.cornerRadius
  color: root.detail ? Style.normalFillFor(root.foreground, root.accent)
    : (rowMouse.containsMouse || root.activeFocus
      ? Style.hoverFillFor(root.foreground, root.accent) : "transparent")
  border.width: root.detail || rowMouse.containsMouse || root.activeFocus ? Style.spacing.hairline : 0
  border.color: root.activeFocus ? root.accent : Style.normalBorderFor(root.foreground, root.accent)
  activeFocusOnTab: !root.detail
  Keys.onReturnPressed: if (!root.detail) root.openRequested(root.integration)
  Keys.onEnterPressed: if (!root.detail) root.openRequested(root.integration)
  Keys.onSpacePressed: if (!root.detail) root.openRequested(root.integration)

  function normalizedStatusState() {
    if (root.status && root.status.checking === true) return "yellow"
    var state = String(root.status && root.status.state || "").toLowerCase()
    if (["green", "ready", "connected", "healthy", "ok"].indexOf(state) >= 0) return "green"
    if (["red", "error", "failed", "authentication-required", "authentication_required", "auth-required", "unauthenticated"].indexOf(state) >= 0)
      return "red"
    if (["yellow", "warning", "degraded", "setup_required", "setup-required", "checking", "unknown"].indexOf(state) >= 0)
      return "yellow"
    if (root.status && root.status.ready === true) return "green"
    if (root.status && root.status.ready === false) return "red"
    if ((root.setup.fields || []).length > 0) return "red"
    return "yellow"
  }

  function normalizedStatusLabel() {
    if (root.status && root.status.checking === true) return "Checking status"
    var message = String(root.status && root.status.message || "").trim()
    if (message) return message
    if (root.statusState === "green") return root.sourceEnabled ? "Connected" : "Available, turned off"
    if (root.needsAuthentication) return "Authentication required"
    if (root.statusState === "red" && (root.setup.fields || []).length > 0) return "Setup required"
    return "Status not checked"
  }

  function categorySummaryText() {
    if (root.needsAuthentication) return "Authentication required"
    if (root.needsSetup) return "Setup required"
    if (root.categories.length > 0) {
      var enabledCount = 0
      for (var index = 0; index < root.categories.length; index++) {
        var category = root.categories[index]
        if (category.enabled === true || (category.enabled === undefined && category.defaultEnabled === true)) enabledCount++
      }
      var summary = enabledCount + " of " + root.categories.length + " categories"
      return root.sourceEnabled ? summary : "Off · " + summary
    }
    return root.statusLabel
  }

  function activateContextAction() {
    if ((root.needsAuthentication || root.needsSetup) && (root.setup.fields || []).length === 0)
      OmaDigestStore.setupIntegration(root.sourceId, ({}))
  }

  function setValue(key, value) {
    var next = Object.assign({}, root.values)
    next[String(key)] = value
    root.values = next
  }

  Row {
    id: compactRow
    visible: !root.detail
    anchors.fill: parent
    anchors.leftMargin: Style.space(10)
    anchors.rightMargin: Style.space(8)
    spacing: Style.space(9)

    Rectangle {
      width: Style.space(8)
      height: width
      radius: width / 2
      anchors.verticalCenter: parent.verticalCenter
      color: root.statusColor
    }

    Column {
      width: parent.width - Style.space(17) - compactAction.width - compactChevron.width - parent.spacing * 3
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(1)

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: String(root.integration.name || "Source")
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        font.bold: true
        elide: Text.ElideRight
      }
      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: root.categorySummary
        color: Qt.darker(root.foreground, 1.4)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }
    }

    Item {
      id: compactAction
      width: root.contextActionLabel ? Style.space(92) : Style.space(48)
      height: parent.height
      anchors.verticalCenter: parent.verticalCenter
      z: 2

      Button {
        visible: root.contextActionLabel !== ""
        anchors.centerIn: parent
        width: parent.width
        height: Style.space(30)
        text: root.contextActionLabel
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        bordered: true
        focusable: true
        onClicked: root.detail || (root.setup.fields || []).length > 0
          ? root.openRequested(root.integration) : root.activateContextAction()
      }

      ToggleSwitch {
        visible: root.contextActionLabel === ""
        anchors.centerIn: parent
        checked: root.sourceEnabled
        interactive: root.configurable
        opacity: root.configurable ? 1 : 0.55
        foreground: root.foreground
        accent: root.accent
        onToggled: OmaDigestStore.setIntegrationEnabled(root.sourceId, !root.sourceEnabled)
      }
    }

    Text {
      textFormat: Text.PlainText
      id: compactChevron
      width: Style.space(16)
      anchors.verticalCenter: parent.verticalCenter
      horizontalAlignment: Text.AlignHCenter
      text: "󰅂"
      color: Qt.darker(root.foreground, 1.25)
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }
  }

  MouseArea {
    id: rowMouse
    visible: !root.detail
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: {
      root.forceActiveFocus()
      root.openRequested(root.integration)
    }
  }

  Column {
    id: detailContent
    visible: root.detail
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.margins: Style.space(11)
    spacing: Style.space(10)

    Row {
      width: parent.width
      spacing: Style.space(8)

      Rectangle {
        width: Style.space(9)
        height: width
        radius: width / 2
        anchors.verticalCenter: parent.verticalCenter
        color: root.statusColor
      }
      Column {
        width: parent.width - refreshButton.width - Style.space(17) - parent.spacing * 2
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.space(1)
        Text {
          textFormat: Text.PlainText
          width: parent.width
          text: root.statusState === "green" ? "Ready" : root.statusState === "red" ? "Needs attention" : "Check recommended"
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          font.bold: true
          elide: Text.ElideRight
        }
        Text {
          textFormat: Text.PlainText
          width: parent.width
          text: root.statusLabel
          color: Qt.darker(root.foreground, 1.35)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }
      Button {
        id: refreshButton
        width: Style.space(84)
        height: Style.space(30)
        text: root.checking ? "Checking…" : "Refresh"
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        bordered: true
        focusable: true
        enabled: !root.checking
        onClicked: OmaDigestStore.checkIntegrationStatus(root.sourceId)
      }
    }

    Text {
      textFormat: Text.PlainText
      visible: root.status !== null && root.status !== undefined && !!root.status.checkedAt
      width: parent.width
      text: visible ? "Checked " + new Date(root.status.checkedAt).toLocaleString(Qt.locale(), "MMM d · hh:mm") : ""
      color: Qt.darker(root.foreground, 1.5)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
    }

    Button {
      visible: root.contextActionLabel !== "" && (!root.needsSetup || (root.setup.fields || []).length === 0)
      width: parent.width
      height: visible ? Style.space(34) : 0
      text: root.contextActionLabel
      foreground: Color.background
      background: root.accent
      accent: root.accent
      fontFamily: root.fontFamily
      fontSize: Style.font.bodySmall
      focusable: true
      enabled: !root.needsSetup || (root.setup.fields || []).length === 0
      onClicked: root.activateContextAction()
    }

    Repeater {
      id: setupFields
      model: root.needsSetup ? (root.setup.fields || []) : []

      Column {
        required property var modelData
        width: parent.width
        spacing: Style.space(3)

        function clearSecret() {
          if (String(modelData.type) === "secret") fieldInput.text = ""
        }

        Text {
          textFormat: Text.PlainText
          width: parent.width
          text: String(modelData.label || "Setting")
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          elide: Text.ElideRight
        }
        QQC.TextField {
          id: fieldInput
          visible: String(modelData.type) !== "boolean"
          width: parent.width
          placeholderText: String(modelData.placeholder || modelData.description || "")
          echoMode: String(modelData.type) === "secret" ? TextInput.Password : TextInput.Normal
          color: root.foreground
          font.family: root.fontFamily
          onTextChanged: root.setValue(modelData.key, text)
        }
        PlainToggle {
          visible: String(modelData.type) === "boolean"
          width: parent.width
          label: String(modelData.label || "Setting")
          description: String(modelData.description || "")
          foreground: root.foreground
          accent: root.accent
          fontFamily: root.fontFamily
          checked: root.values[modelData.key] === true
          onClicked: root.setValue(modelData.key, !checked)
        }
      }
    }

    Button {
      visible: root.needsSetup && (root.setup.fields || []).length > 0
      width: parent.width
      height: visible ? Style.space(34) : 0
      text: "Save settings"
      foreground: Color.background
      background: root.accent
      accent: root.accent
      fontFamily: root.fontFamily
      fontSize: Style.font.bodySmall
      focusable: true
      onClicked: OmaDigestStore.setupIntegration(root.sourceId, root.values)
    }

    PlainToggle {
      width: parent.width
      label: "Use in digests"
      description: root.isCore ? "Allow templates to request this built-in source" : "Allow templates to request this source"
      foreground: root.foreground
      accent: root.accent
      fontFamily: root.fontFamily
      checked: root.sourceEnabled
      enabled: root.configurable
      opacity: root.configurable ? 1 : 0.65
      onClicked: OmaDigestStore.setIntegrationEnabled(root.sourceId, !root.sourceEnabled)
    }

    Column {
      visible: root.categories.length > 0
      width: parent.width
      spacing: Style.space(6)

      Text {
        textFormat: Text.PlainText
        text: "CATEGORIES"
        color: Qt.darker(root.foreground, 1.35)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        font.letterSpacing: 1
      }
      Repeater {
        model: root.categories
        PlainToggle {
          required property var modelData
          width: parent.width
          label: String(modelData.label || modelData.id || "Category")
          description: String(modelData.description || "")
          foreground: root.foreground
          accent: root.accent
          fontFamily: root.fontFamily
          checked: modelData.enabled === true || (modelData.enabled === undefined && modelData.defaultEnabled === true)
          enabled: root.configurable
          opacity: root.configurable ? 1 : 0.65
          onClicked: OmaDigestStore.setIntegrationCategoryEnabled(
            root.sourceId, String(modelData.id || ""), !checked)
        }
      }
    }

    Button {
      width: parent.width
      height: Style.space(32)
      text: (root.detailsExpanded ? "Hide " : "Show ") + (root.isCore ? "connection details" : "permissions")
      iconText: root.detailsExpanded ? "󰅀" : "󰅂"
      leftAlign: true
      foreground: Qt.darker(root.foreground, 1.2)
      accent: root.accent
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      focusable: true
      onClicked: root.detailsExpanded = !root.detailsExpanded
    }

    Column {
      visible: root.detailsExpanded
      width: parent.width
      spacing: Style.space(5)

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: String(root.setup.summary || root.integration.description || "No additional connection details.")
        color: Qt.darker(root.foreground, 1.3)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.WordWrap
      }
      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: {
          var permissions = root.integration.permissions || ({})
          var pieces = []
          if ((permissions.networkHosts || []).length) pieces.push("Network: " + permissions.networkHosts.join(", "))
          if ((permissions.networkSetupFields || []).length) pieces.push("Network: configured " + permissions.networkSetupFields.join(", "))
          if ((permissions.commands || []).length) pieces.push("Commands: " + permissions.commands.join(", "))
          if ((permissions.readPaths || []).length) pieces.push("Reads: " + permissions.readPaths.join(", "))
          if ((permissions.writePaths || []).length) pieces.push("Writes: " + permissions.writePaths.join(", "))
          return pieces.length ? pieces.join("\n") : "No additional permissions declared."
        }
        color: Qt.darker(root.foreground, 1.4)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.WordWrap
      }
    }
  }

  Connections {
    target: OmaDigestStore
    function onIntegrationSetupChanged() {
      var setupResult = OmaDigestStore.integrationSetup[root.sourceId]
      if (!setupResult || setupResult.ready !== true) return
      root.values = ({})
      for (var index = 0; index < setupFields.count; index++) {
        var item = setupFields.itemAt(index)
        if (item && item.clearSecret) item.clearSecret()
      }
    }
  }
}

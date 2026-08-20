import QtQuick
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

Column {
  id: root

  required property var integration
  property color foreground: Color.foreground
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property var values: ({})
  readonly property var connectorStatus: OmaDigestStore.integrationStatus[String(root.integration.id)]
    || OmaDigestStore.integrationSetup[String(root.integration.id)]

  width: parent ? parent.width : Style.space(420)
  spacing: Style.space(7)

  function setValue(key, value) {
    var next = Object.assign({}, values)
    next[String(key)] = value
    values = next
  }

  Toggle {
    width: parent.width
    label: String(root.integration.name)
    description: String(root.integration.description)
    foreground: root.foreground
    accent: root.accent
    fontFamily: root.fontFamily
    checked: root.integration.enabled === true
    onClicked: OmaDigestStore.setIntegrationEnabled(root.integration.id, !root.integration.enabled)
  }

  Text {
    width: parent.width
    text: String(root.integration.setup.summary || "")
    color: Qt.darker(root.foreground, 1.35)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }

  Rectangle {
    width: parent.width
    height: integrationStatusRow.implicitHeight + Style.space(16)
    radius: Style.cornerRadius
    color: Style.normalFillFor(root.foreground, root.accent)
    border.width: Style.spacing.hairline
    border.color: Style.normalBorderFor(root.foreground, root.accent)

    Row {
      id: integrationStatusRow
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.margins: Style.space(8)
      spacing: Style.space(8)

      Text {
        anchors.verticalCenter: parent.verticalCenter
        text: "●"
        color: root.connectorStatus && root.connectorStatus.ready === true
          ? root.accent : Qt.darker(root.foreground, 1.45)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
      Text {
        width: parent.width - statusAction.width - Style.space(24)
        anchors.verticalCenter: parent.verticalCenter
        text: root.connectorStatus
          ? String(root.connectorStatus.message || (root.connectorStatus.ready ? "Ready" : "Needs attention"))
          : "Status not checked"
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }
      Rectangle {
        id: statusAction
        width: Style.space(116)
        height: Style.space(30)
        anchors.verticalCenter: parent.verticalCenter
        radius: Style.cornerRadius
        color: statusMouse.containsMouse
          ? Style.hoverFillFor(root.foreground, root.accent)
          : Style.normalFillFor(root.foreground, root.accent)
        Text {
          anchors.centerIn: parent
          text: root.connectorStatus && root.connectorStatus.checking === true ? "Checking…" : "Check status"
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.bold: true
        }
        MouseArea {
          id: statusMouse
          anchors.fill: parent
          enabled: !(root.connectorStatus && root.connectorStatus.checking === true)
          hoverEnabled: true
          cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
          onClicked: OmaDigestStore.checkIntegrationStatus(root.integration.id)
        }
      }
    }
  }

  Connections {
    target: OmaDigestStore
    function onIntegrationSetupChanged() {
      var status = OmaDigestStore.integrationSetup[String(root.integration.id)]
      if (!status || status.ready !== true) return
      root.values = ({})
      for (var index = 0; index < setupFields.count; index++) {
        var item = setupFields.itemAt(index)
        if (item && item.clearSecret) item.clearSecret()
      }
    }
  }

  Repeater {
    id: setupFields
    model: root.integration.setup.fields || []

    Column {
      required property var modelData
      width: parent.width
      spacing: Style.space(3)

      function clearSecret() {
        if (String(modelData.type) === "secret") fieldInput.text = ""
      }

      Text {
        width: parent.width
        text: String(modelData.label)
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
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

      Toggle {
        visible: String(modelData.type) === "boolean"
        width: parent.width
        label: String(modelData.label)
        description: String(modelData.description)
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        checked: root.values[modelData.key] === true
        onClicked: root.setValue(modelData.key, !checked)
      }
    }
  }

  Rectangle {
    visible: (root.integration.setup.fields || []).length > 0
    width: Style.space(170)
    height: visible ? Style.space(34) : 0
    radius: Style.cornerRadius
    color: root.accent

    Text {
      anchors.centerIn: parent
      text: String(root.integration.setup.actionLabel || "Set up")
      color: Color.background
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      font.bold: true
    }

    MouseArea {
      anchors.fill: parent
      cursorShape: Qt.PointingHandCursor
      onClicked: OmaDigestStore.setupIntegration(root.integration.id, root.values)
    }
  }

  Text {
    visible: OmaDigestStore.integrationSetup[String(root.integration.id)] !== undefined
    width: parent.width
    text: visible ? String(OmaDigestStore.integrationSetup[String(root.integration.id)].message || "") : ""
    color: visible && OmaDigestStore.integrationSetup[String(root.integration.id)].ready ? root.accent : root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }
}

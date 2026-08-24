import QtQuick
import qs.Commons

Column {
  id: root

  required property string digestId
  required property int sectionIndex
  required property int entryIndex
  required property color foreground
  required property string fontFamily
  property bool opened: false

  readonly property string entryKey: OmaDigestStore.digestEntryKey(digestId, sectionIndex, entryIndex)
  readonly property bool ownsResult: OmaDigestStore.digestSourcesKey === entryKey

  width: parent ? parent.width : 0
  visible: opened
  spacing: Style.space(6)

  Text {
    textFormat: Text.PlainText
    width: parent.width
    text: "SOURCES"
    color: Color.accent
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
    font.letterSpacing: 1
  }

  Text {
    textFormat: Text.PlainText
    visible: root.opened && (!root.ownsResult || OmaDigestStore.digestSourcesState === "loading")
    width: parent.width
    text: "Recovering retained source details…"
    color: Qt.darker(root.foreground, 1.35)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }

  Repeater {
    model: root.opened && root.ownsResult && OmaDigestStore.digestSourcesState === "ready"
      ? OmaDigestStore.digestSources : []

    Rectangle {
      id: sourceCard
      required property var modelData
      readonly property bool actionable: String(modelData.kind || "") === "web"
        || String(modelData.kind || "") === "application"
      readonly property var result: OmaDigestStore.digestSourceResult(
        root.digestId, String(modelData.sourceId || ""), String(modelData.targetId || ""))
      readonly property bool opening: result !== null && String(result.state || "") === "opening"
      readonly property string resultMessage: result !== null ? String(result.message || "") : ""

      width: parent.width
      height: sourceContent.implicitHeight + Style.space(16)
      radius: Style.cornerRadius
      color: sourceMouse.containsMouse && actionable
        ? Style.hoverFillFor(root.foreground, Color.accent)
        : Style.normalFillFor(root.foreground, Color.accent)
      border.width: Style.spacing.hairline
      border.color: result !== null && String(result.state || "") === "unavailable"
        ? Color.urgent : Style.normalBorderFor(root.foreground, Color.accent)

      Row {
        id: sourceContent
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.margins: Style.space(8)
        spacing: Style.space(8)

        Column {
          width: parent.width - sourceAction.width - parent.spacing
          spacing: Style.space(2)

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: String(modelData.label || "Source")
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            font.weight: Font.DemiBold
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: String(modelData.detail || "")
            color: Qt.darker(root.foreground, 1.2)
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
            maximumLineCount: 2
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            visible: text !== ""
            width: parent.width
            text: {
              var parts = []
              if (String(modelData.destination || "") !== "") parts.push(String(modelData.destination))
              var occurred = new Date(String(modelData.occurredAt || ""))
              if (!isNaN(occurred.getTime())) parts.push(occurred.toLocaleString(Qt.locale(), "MMM d · hh:mm"))
              return parts.join(" · ")
            }
            color: Qt.darker(root.foreground, 1.4)
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            visible: text !== ""
            width: parent.width
            text: sourceCard.resultMessage || String(modelData.message || "")
            color: sourceCard.result !== null && String(sourceCard.result.state || "") === "unavailable"
              ? Color.urgent : Qt.darker(root.foreground, 1.35)
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }
        }

        Text {
          textFormat: Text.PlainText
          id: sourceAction
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(72)
          horizontalAlignment: Text.AlignRight
          text: sourceCard.actionable
            ? (sourceCard.opening ? "Opening…" : sourceCard.result !== null && String(sourceCard.result.state || "") === "opened" ? "Opened" : "Open  →")
            : "Info"
          color: sourceCard.actionable ? Color.accent : Qt.darker(root.foreground, 1.4)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.bold: sourceCard.actionable
        }
      }

      MouseArea {
        id: sourceMouse
        anchors.fill: parent
        enabled: sourceCard.actionable && !sourceCard.opening
        hoverEnabled: enabled
        cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: OmaDigestStore.openDigestSource(
          root.digestId, root.sectionIndex, root.entryIndex,
          String(modelData.sourceId || ""), String(modelData.targetId || ""))
      }
    }
  }
}

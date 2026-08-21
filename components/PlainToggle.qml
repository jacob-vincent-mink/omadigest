import QtQuick
import qs.Commons
import qs.Ui

// Local counterpart to the Omarchy Toggle for untrusted integration metadata.
// The host control currently leaves its labels in Text.AutoText, so this copy
// makes the rendering boundary explicit without modifying /usr/share/omarchy.
BorderSurface {
  id: root

  property string label: ""
  property string description: ""
  property bool checked: false
  property bool hasCursor: false
  property bool rounded: Style.cornerRadius > 0
  property color foreground: Color.foreground
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property real titleSize: Style.font.subtitle
  property real descriptionSize: Style.font.caption

  signal clicked()
  signal hovered(bool isHovered)

  activeFocusOnTab: true
  Keys.onReturnPressed: root.clicked()
  Keys.onEnterPressed: root.clicked()
  Keys.onSpacePressed: root.clicked()

  implicitHeight: Math.max(54, content.implicitHeight + Style.spacing.huge)
  implicitWidth: Style.space(240)
  radius: Style.cornerRadius

  readonly property bool hot: hasCursor || mouse.containsMouse
  readonly property var activeBorderSpec: Border.controlSpec(
    activeFocus ? "focus" : (hot ? "hover-cursor" : "normal"), foreground, accent)

  color: Style.controlFill(activeFocus, hot, foreground, accent)
  borderSpec: activeBorderSpec

  Behavior on color { ColorAnimation { duration: 100 } }

  Row {
    id: content
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    anchors.leftMargin: root.borderLeft + Style.spacing.rowPaddingX
    anchors.rightMargin: root.borderRight + Style.spacing.rowPaddingX
    spacing: Style.spacing.rowPaddingX

    Column {
      width: parent.width - track.width - parent.spacing
      spacing: Style.spacing.xs
      anchors.verticalCenter: parent.verticalCenter

      Text {
        textFormat: Text.PlainText
        text: root.label
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: root.titleSize
        font.bold: true
        elide: Text.ElideRight
        width: parent.width
      }

      Text {
        textFormat: Text.PlainText
        visible: root.description !== ""
        text: root.description
        color: Qt.darker(root.foreground, 1.5)
        font.family: root.fontFamily
        font.pixelSize: root.descriptionSize
        wrapMode: Text.WordWrap
        width: parent.width
      }
    }

    ToggleSwitch {
      id: track
      checked: root.checked
      rounded: root.rounded
      foreground: root.foreground
      accent: root.accent
      interactive: false
      anchors.verticalCenter: parent.verticalCenter
    }
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
  }

  HoverHandler { onHoveredChanged: root.hovered(hovered) }
}

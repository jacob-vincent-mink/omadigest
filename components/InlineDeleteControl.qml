import QtQuick
import qs.Commons
import qs.Ui

Item {
  id: root

  property bool confirming: false
  property color foreground: Color.foreground
  property color accent: Color.urgent
  property string fontFamily: Style.font.family

  signal confirmationRequested()
  signal confirmed()
  signal cancelled()

  implicitWidth: confirming ? Style.space(106) : Style.space(32)
  implicitHeight: Style.space(32)
  width: implicitWidth
  height: implicitHeight

  Row {
    anchors.fill: parent
    spacing: Style.space(5)

    Button {
      visible: !root.confirming
      width: root.width
      height: root.height
      text: "󰆴"
      foreground: root.accent
      accent: root.accent
      fontFamily: root.fontFamily
      fontSize: Style.font.bodySmall
      bordered: true
      focusable: true
      onClicked: root.confirmationRequested()
    }

    Button {
      visible: root.confirming
      width: Style.space(69)
      height: root.height
      text: "Delete"
      foreground: root.accent
      accent: root.accent
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      bordered: true
      focusable: true
      onClicked: root.confirmed()
    }

    Button {
      visible: root.confirming
      width: Style.space(32)
      height: root.height
      text: "󰅖"
      foreground: root.foreground
      accent: root.accent
      fontFamily: root.fontFamily
      fontSize: Style.font.bodySmall
      focusable: true
      onClicked: root.cancelled()
    }
  }
}

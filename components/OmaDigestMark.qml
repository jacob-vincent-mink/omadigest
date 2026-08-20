import QtQuick
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

Item {
  id: root

  property real size: Style.space(42)
  property color accent: Color.accent
  property bool active: false

  implicitWidth: size
  implicitHeight: size

  Rectangle {
    anchors.centerIn: parent
    width: root.size
    height: root.size
    radius: Style.cornerRadius
    color: root.accent
    opacity: root.active ? 0.11 : 0

    Behavior on opacity { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }
  }

  QQC.Button {
    anchors.fill: parent
    enabled: false
    padding: 0
    display: QQC.AbstractButton.IconOnly
    background: null
    icon.source: Qt.resolvedUrl("../assets/omadigest-mark.png")
    icon.width: Math.round(root.size)
    icon.height: Math.round(root.size)
    icon.color: root.accent
  }
}

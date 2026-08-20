import QtQuick
import QtQuick.Shapes
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

  Shape {
    id: mark

    readonly property real scaleFactor: width / 256

    anchors.centerIn: parent
    width: Math.max(1, Math.round(root.size))
    height: width
    preferredRendererType: Shape.CurveRenderer

    // Render the mark as geometry at its final size. The optical minimums keep
    // the quill outline intact in the bar instead of downsampling it below 1 px.
    ShapePath {
      fillColor: "transparent"
      strokeColor: root.accent
      strokeWidth: Math.max(1.75, 18 * mark.scaleFactor)
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin

      PathMove { x: 105 * mark.scaleFactor; y: 28 * mark.scaleFactor }
      PathLine { x: 49 * mark.scaleFactor; y: 28 * mark.scaleFactor }
      PathCubic {
        x: 28 * mark.scaleFactor; y: 49 * mark.scaleFactor
        control1X: 37 * mark.scaleFactor; control1Y: 28 * mark.scaleFactor
        control2X: 28 * mark.scaleFactor; control2Y: 37 * mark.scaleFactor
      }
      PathLine { x: 28 * mark.scaleFactor; y: 105 * mark.scaleFactor }

      PathMove { x: 151 * mark.scaleFactor; y: 228 * mark.scaleFactor }
      PathLine { x: 207 * mark.scaleFactor; y: 228 * mark.scaleFactor }
      PathCubic {
        x: 228 * mark.scaleFactor; y: 207 * mark.scaleFactor
        control1X: 219 * mark.scaleFactor; control1Y: 228 * mark.scaleFactor
        control2X: 228 * mark.scaleFactor; control2Y: 219 * mark.scaleFactor
      }
      PathLine { x: 228 * mark.scaleFactor; y: 151 * mark.scaleFactor }
    }

    ShapePath {
      fillColor: "transparent"
      strokeColor: root.accent
      strokeWidth: Math.max(1.35, 10 * mark.scaleFactor)
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin

      PathMove { x: 48 * mark.scaleFactor; y: 220 * mark.scaleFactor }
      PathLine { x: 211 * mark.scaleFactor; y: 40 * mark.scaleFactor }
    }

    ShapePath {
      fillColor: "transparent"
      strokeColor: root.accent
      strokeWidth: Math.max(1.2, 9 * mark.scaleFactor)
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin

      PathMove { x: 67 * mark.scaleFactor; y: 199 * mark.scaleFactor }
      PathCubic {
        x: 211 * mark.scaleFactor; y: 40 * mark.scaleFactor
        control1X: 79 * mark.scaleFactor; control1Y: 139 * mark.scaleFactor
        control2X: 124 * mark.scaleFactor; control2Y: 77 * mark.scaleFactor
      }
      PathCubic {
        x: 67 * mark.scaleFactor; y: 199 * mark.scaleFactor
        control1X: 187 * mark.scaleFactor; control1Y: 119 * mark.scaleFactor
        control2X: 132 * mark.scaleFactor; control2Y: 174 * mark.scaleFactor
      }
    }
  }
}

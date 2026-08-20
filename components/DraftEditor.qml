import QtQuick
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

Column {
  id: root

  required property string kind
  property color foreground: Color.foreground
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  width: parent ? parent.width : Style.space(420)
  spacing: Style.space(8)

  readonly property bool ownsDraft: OmaDigestStore.draftKind === root.kind
  readonly property var currentDraft: ownsDraft ? OmaDigestStore.draft : null

  Connections {
    target: OmaDigestStore
    function onTranscriptChanged() {
      if (!root.visible || OmaDigestStore.draftKind !== root.kind) return
      var transcript = String(OmaDigestStore.transcript || "").trim()
      if (transcript) request.text = request.text.trim() ? request.text.trim() + " " + transcript : transcript
    }
  }

  QQC.TextArea {
    id: request
    width: parent.width
    height: Style.space(100)
    color: root.foreground
    placeholderText: root.kind === "template"
      ? "Describe the digest template you want…"
      : "Describe the source you want to connect…"
    placeholderTextColor: Qt.darker(root.foreground, 1.6)
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    wrapMode: TextEdit.Wrap
    background: Rectangle {
      radius: Style.cornerRadius
      color: Style.normalFillFor(root.foreground, root.accent)
      border.width: Style.spacing.hairline
      border.color: Style.normalBorderFor(root.foreground, root.accent)
    }
  }

  Row {
    x: Math.max(0, (parent.width - implicitWidth) / 2)
    spacing: Style.space(8)

    PanelActionButton {
      anchors.verticalCenter: parent.verticalCenter
      iconText: OmaDigestStore.dictationState === "recording" ? "󰍬" : "󰍭"
      tooltipText: OmaDigestStore.dictationAvailable ? "Dictate" : "Voxtype is unavailable"
      foreground: root.foreground
      fontFamily: root.fontFamily
      enabled: OmaDigestStore.dictationAvailable
      onClicked: {
        OmaDigestStore.draftKind = root.kind
        OmaDigestStore.toggleDictation()
      }
    }

    Rectangle {
      width: Style.space(170)
      height: Style.space(36)
      radius: Style.cornerRadius
      color: submitMouse.containsMouse ? Style.hoverFillFor(root.foreground, root.accent) : root.accent
      opacity: request.text.trim() && OmaDigestStore.draftState !== "working" ? 1 : 0.5

      Text {
        anchors.centerIn: parent
        text: root.ownsDraft && OmaDigestStore.draftState === "working"
          ? "Drafting…" : "Draft " + root.kind
        color: Color.background
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        font.bold: true
      }

      MouseArea {
        id: submitMouse
        anchors.fill: parent
        enabled: request.text.trim() && OmaDigestStore.draftState !== "working"
        hoverEnabled: true
        cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: OmaDigestStore.startDraft(root.kind, request.text)
      }
    }
  }

  Text {
    visible: root.currentDraft !== null
    width: parent.width
    text: {
      var draft = root.currentDraft
      if (!draft) return ""
      if (draft.kind === "out-of-scope") return String(draft.message)
      if (draft.kind === "clarification") return String(draft.question)
      if (draft.kind === "template") return "Template draft: " + String(draft.compiled.name)
      return "Integration draft: " + String((draft.files || []).length) + " files"
    }
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.bodySmall
    wrapMode: Text.WordWrap
  }

  QQC.TextArea {
    visible: root.currentDraft !== null
      && (root.currentDraft.kind === "template" || root.currentDraft.kind === "integration")
    width: parent.width
    height: visible ? Style.space(180) : 0
    readOnly: true
    text: visible ? JSON.stringify(root.currentDraft, null, 2).slice(0, 16000) : ""
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: TextEdit.NoWrap
    background: Rectangle {
      radius: Style.cornerRadius
      color: Style.normalFillFor(root.foreground, root.accent)
      border.width: Style.spacing.hairline
      border.color: Style.normalBorderFor(root.foreground, root.accent)
    }
  }

  Row {
    visible: root.currentDraft !== null
      && (root.currentDraft.kind === "template" || root.currentDraft.kind === "integration")
    height: visible ? Style.space(36) : 0
    spacing: Style.space(8)

    Repeater {
      model: [{ label: "Accept", accept: true }, { label: "Discard", accept: false }]
      Rectangle {
        required property var modelData
        width: Style.space(120)
        height: parent.height
        radius: Style.cornerRadius
        color: modelData.accept ? root.accent : Style.normalFillFor(root.foreground, root.accent)
        Text {
          anchors.centerIn: parent
          text: String(modelData.label)
          color: modelData.accept ? Color.background : root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          font.bold: modelData.accept
        }
        MouseArea {
          anchors.fill: parent
          cursorShape: Qt.PointingHandCursor
          onClicked: modelData.accept ? OmaDigestStore.acceptDraft() : OmaDigestStore.rejectDraft()
        }
      }
    }
  }

  Rectangle {
    visible: root.currentDraft !== null
    x: Math.max(0, (parent.width - width) / 2)
    width: Style.space(170)
    height: visible ? Style.space(36) : 0
    radius: Style.cornerRadius
    color: herdrMouse.containsMouse
      ? Style.hoverFillFor(root.foreground, root.accent)
      : Style.normalFillFor(root.foreground, root.accent)
    Text {
      anchors.centerIn: parent
      text: "Continue in Herdr"
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      font.bold: true
    }
    MouseArea {
      id: herdrMouse
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: OmaDigestStore.handoffHerdr(root.kind, request.text, root.currentDraft)
    }
  }

  Rectangle {
    visible: root.currentDraft && root.currentDraft.kind === "out-of-scope"
    width: parent.width
    height: visible ? Style.space(36) : 0
    radius: Style.cornerRadius
    color: Style.normalFillFor(root.foreground, root.accent)
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
      onClicked: OmaDigestStore.handoffDefaultAgent(root.currentDraft.suggestedPrompt)
    }
  }
}

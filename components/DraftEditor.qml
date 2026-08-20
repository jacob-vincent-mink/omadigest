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
  property string revisionTemplateId: ""

  width: parent ? parent.width : Style.space(420)
  spacing: Style.space(8)

  readonly property bool ownsDraft: OmaDigestStore.draftKind === root.kind
  readonly property var currentDraft: ownsDraft ? OmaDigestStore.draft : null
  readonly property bool isWorking: ownsDraft && OmaDigestStore.draftState === "working"
  readonly property bool isLaunching: root.kind === "integration" && OmaDigestStore.authoringState === "launching"
  readonly property bool canHandoff: currentDraft !== null
    || (ownsDraft && OmaDigestStore.draftState === "error")
  property int draftElapsedSeconds: 0

  onIsWorkingChanged: if (isWorking) draftElapsedSeconds = 0

  function elapsedText() {
    var minutes = Math.floor(draftElapsedSeconds / 60)
    var seconds = draftElapsedSeconds % 60
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds
  }

  Timer {
    interval: 1000
    running: root.isWorking
    repeat: true
    onTriggered: root.draftElapsedSeconds += 1
  }

  function setRequest(text) { request.text = String(text || "").slice(0, 20000) }
  function submit() {
    if (!request.text.trim() || root.isWorking || root.isLaunching) return
    if (root.kind === "integration") OmaDigestStore.startIntegrationAuthoring(request.text)
    else if (root.revisionTemplateId) OmaDigestStore.startTemplateRevision(root.revisionTemplateId, request.text)
    else OmaDigestStore.startDraft(root.kind, request.text)
  }

  Text {
    visible: root.kind === "integration"
    width: parent.width
    text: "Builds in your default coding agent with full tests, then installs disabled through OmaDigest validation."
    color: Qt.darker(root.foreground, 1.35)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }

  Rectangle {
    visible: root.kind === "integration"
    x: Math.max(0, (parent.width - width) / 2)
    width: Style.space(190)
    height: visible ? Style.space(30) : 0
    radius: Style.cornerRadius
    color: skillMouse.containsMouse
      ? Style.hoverFillFor(root.foreground, root.accent)
      : Style.normalFillFor(root.foreground, root.accent)
    border.width: Style.spacing.hairline
    border.color: Style.normalBorderFor(root.foreground, root.accent)
    opacity: OmaDigestStore.authoringSkillState === "installing" ? 0.55 : 1

    Text {
      anchors.centerIn: parent
      text: OmaDigestStore.authoringSkillState === "installed" ? "Agent skill installed"
        : OmaDigestStore.authoringSkillState === "installing" ? "Installing skill…" : "Install agent skill"
      color: OmaDigestStore.authoringSkillState === "installed" ? root.accent : root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
    MouseArea {
      id: skillMouse
      anchors.fill: parent
      enabled: OmaDigestStore.authoringSkillState !== "installing" && OmaDigestStore.authoringSkillState !== "installed"
      hoverEnabled: true
      cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
      onClicked: OmaDigestStore.installAuthoringSkill()
    }
  }

  Text {
    visible: root.kind === "integration" && OmaDigestStore.authoringSkillMessage !== ""
    width: parent.width
    horizontalAlignment: Text.AlignHCenter
    text: OmaDigestStore.authoringSkillMessage
    color: OmaDigestStore.authoringSkillState === "error" ? Color.error : Qt.darker(root.foreground, 1.35)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }

  Connections {
    target: OmaDigestStore
    function onTranscriptChanged() {
      if (!root.visible || OmaDigestStore.draftKind !== root.kind) return
      var transcript = String(OmaDigestStore.transcript || "").trim()
      if (transcript) request.text = request.text.trim() ? request.text.trim() + " " + transcript : transcript
    }
  }

  Item {
    width: parent.width
    height: Style.space(100)

    QQC.TextArea {
      id: request
      anchors.fill: parent
      color: root.foreground
      placeholderText: root.kind === "template"
        ? (root.revisionTemplateId ? "Describe what should change…" : "Describe the digest template you want…")
        : "Describe the source you want to connect…"
      placeholderTextColor: Qt.darker(root.foreground, 1.6)
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      wrapMode: TextEdit.Wrap
      background: Rectangle {
        radius: Style.cornerRadius
        color: Style.normalFillFor(root.foreground, root.accent)
        border.width: Style.spacing.hairline
        border.color: root.isWorking ? "transparent" : Style.normalBorderFor(root.foreground, root.accent)
      }
    }

    Canvas {
      id: workingChase
      anchors.fill: parent
      visible: root.isWorking
      z: 2
      property real offset: 0

      onOffsetChanged: requestPaint()
      onVisibleChanged: if (visible) requestPaint()
      onPaint: {
        var context = getContext("2d")
        var inset = Style.space(2)
        var right = width - inset
        var bottom = height - inset
        var corner = Math.min(Style.cornerRadius, (right - inset) / 2, (bottom - inset) / 2)
        context.clearRect(0, 0, width, height)
        context.beginPath()
        context.moveTo(inset + corner, inset)
        context.lineTo(right - corner, inset)
        context.quadraticCurveTo(right, inset, right, inset + corner)
        context.lineTo(right, bottom - corner)
        context.quadraticCurveTo(right, bottom, right - corner, bottom)
        context.lineTo(inset + corner, bottom)
        context.quadraticCurveTo(inset, bottom, inset, bottom - corner)
        context.lineTo(inset, inset + corner)
        context.quadraticCurveTo(inset, inset, inset + corner, inset)
        context.closePath()
        context.setLineDash([Style.space(9), Style.space(6)])
        context.lineDashOffset = -offset
        context.lineWidth = Style.space(2)
        context.strokeStyle = root.accent
        context.stroke()
      }

      NumberAnimation on offset {
        running: workingChase.visible
        from: 0
        to: Style.space(30)
        duration: 950
        loops: Animation.Infinite
      }
    }

  }

  Rectangle {
    visible: root.isWorking
    width: parent.width
    height: visible ? Style.space(52 + Math.max(2, Math.min(5, OmaDigestStore.draftPlan.length || 2)) * 17) : 0
    radius: Style.cornerRadius
    color: Style.normalFillFor(root.foreground, root.accent)
    border.width: Style.spacing.hairline
    border.color: root.accent

    Column {
      anchors.fill: parent
      anchors.margins: Style.space(12)
      spacing: Style.space(6)

      Item {
        width: parent.width
        height: Style.space(18)

        Text {
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          text: root.kind === "integration" ? "Building integration" : "Building template"
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          font.bold: true
        }

        Text {
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          text: root.elapsedText()
          color: Qt.darker(root.foreground, 1.35)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.features: { "tnum": 1 }
        }
      }

      Column {
        width: parent.width
        spacing: Style.space(3)

        Repeater {
          model: OmaDigestStore.draftPlan.length > 0 ? OmaDigestStore.draftPlan : OmaDigestStore.draftProgress.slice(-2)

          Item {
            required property var modelData
            required property int index
            width: parent.width
            height: Style.space(17)

            Text {
              anchors.left: parent.left
              anchors.verticalCenter: parent.verticalCenter
              text: OmaDigestStore.draftPlan.length > 0
                ? (OmaDigestStore.draftPlanStatus === "complete" || index < OmaDigestStore.draftPlanStep
                  ? "✓" : index === OmaDigestStore.draftPlanStep ? "●" : "○")
                : (index === Math.min(1, OmaDigestStore.draftProgress.slice(-2).length - 1) ? "●" : "✓")
              color: (OmaDigestStore.draftPlan.length > 0 && OmaDigestStore.draftPlanStatus !== "complete" && index === OmaDigestStore.draftPlanStep)
                || (OmaDigestStore.draftPlan.length === 0 && index === Math.min(1, OmaDigestStore.draftProgress.slice(-2).length - 1))
                ? root.accent : Qt.darker(root.foreground, 1.5)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            Text {
              anchors.left: parent.left
              anchors.leftMargin: Style.space(18)
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              text: String(OmaDigestStore.draftPlan.length > 0 ? modelData
                : (modelData.message || "Working within the constrained draft session"))
              color: (OmaDigestStore.draftPlan.length > 0 && OmaDigestStore.draftPlanStatus !== "complete" && index === OmaDigestStore.draftPlanStep)
                || (OmaDigestStore.draftPlan.length === 0 && index === Math.min(1, OmaDigestStore.draftProgress.slice(-2).length - 1))
                ? root.foreground : Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }
          }
        }

        Text {
          visible: OmaDigestStore.draftPlan.length === 0 && OmaDigestStore.draftProgress.length === 0
          width: parent.width
          text: "Starting constrained draft session…"
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }
    }
  }

  Row {
    visible: !root.isWorking
    height: visible ? Style.space(36) : 0
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
      width: root.kind === "integration" ? Style.space(210) : Style.space(170)
      height: Style.space(36)
      radius: Style.cornerRadius
      color: submitMouse.containsMouse ? Style.hoverFillFor(root.foreground, root.accent) : root.accent
      opacity: request.text.trim() && !root.isWorking && !root.isLaunching ? 1 : 0.5

      Text {
        anchors.centerIn: parent
        text: root.kind === "integration"
          ? (root.isLaunching ? "Opening agent…" : "Build in default agent")
          : (root.ownsDraft && OmaDigestStore.draftState === "working" ? "Drafting…" : "Draft template")
        color: Color.background
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        font.bold: true
      }

      MouseArea {
        id: submitMouse
        anchors.fill: parent
        enabled: request.text.trim() && !root.isWorking && !root.isLaunching
        hoverEnabled: true
        cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: root.submit()
      }
    }
  }

  Text {
    visible: root.kind === "integration" && OmaDigestStore.authoringMessage !== ""
    width: parent.width
    text: OmaDigestStore.authoringMessage
    color: OmaDigestStore.authoringState === "error" ? Color.error : root.accent
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
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
    visible: root.canHandoff
    x: Math.max(0, (parent.width - width) / 2)
    width: Style.space(170)
    height: visible ? Style.space(36) : 0
    radius: Style.cornerRadius
    color: herdrMouse.containsMouse
      ? Style.hoverFillFor(root.foreground, root.accent)
      : Style.normalFillFor(root.foreground, root.accent)
    Text {
      anchors.centerIn: parent
      text: root.currentDraft === null ? "Recover in Herdr" : "Continue in Herdr"
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
      onClicked: {
        var context = root.currentDraft
        if (context === null) context = {
          kind: root.kind,
          state: OmaDigestStore.draftState,
          plan: OmaDigestStore.draftPlan.slice(0, 5),
          currentStep: OmaDigestStore.draftPlanStep,
          progress: OmaDigestStore.draftProgress.slice(-4),
          errorCode: String(OmaDigestStore.errorCode || "draft_failed").slice(0, 100),
          errorMessage: String(OmaDigestStore.errorMessage || "The scoped draft did not complete.").slice(0, 1000)
        }
        OmaDigestStore.handoffHerdr(root.kind, request.text, context)
      }
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

import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "components" as OmaDigest

BarWidget {
  id: root
  moduleName: "io.github.jacob-vincent-mink.omadigest"

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false
  readonly property var hostShell: bar && bar.shell ? bar.shell : null
  readonly property var idleService: hostShell && hostShell.firstPartyServiceFor
    ? hostShell.firstPartyServiceFor("omarchy.idle") : null
  readonly property int unreadCount: (OmaDigest.OmaDigestStore.digestHistory || []).filter(function(digest) {
    return String(digest.readAt || "") === ""
  }).length
  property bool screensaverOwnsBarHide: false
  property bool barWasHiddenBeforeScreensaver: false

  function open() { if (panelLoader.item) panelLoader.item.open() }
  function close() { if (panelLoader.item) panelLoader.item.close() }
  function toggle() { if (panelLoader.item) panelLoader.item.toggle() }
  function closeForPopoutSwitch() { if (panelLoader.item) panelLoader.item.closeForPopoutSwitch() }

  function syncScreensaverBarVisibility() {
    var screensaverVisible = root.idleService && root.idleService.screensaverWindowCount > 0
    if (screensaverVisible && !root.screensaverOwnsBarHide && root.bar) {
      root.barWasHiddenBeforeScreensaver = root.bar.barHidden === true
      root.bar.barHidden = true
      root.screensaverOwnsBarHide = true
    } else if (!screensaverVisible && root.screensaverOwnsBarHide) {
      if (root.bar && !root.barWasHiddenBeforeScreensaver) root.bar.barHidden = false
      root.screensaverOwnsBarHide = false
      root.barWasHiddenBeforeScreensaver = false
    }
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    target.bar = root.bar
    target.anchorItem = button
    target.hostWidget = root
    target.settings = root.settings
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight
  onBarChanged: {
    injectPanel()
    syncScreensaverBarVisibility()
  }
  onSettingsChanged: injectPanel()

  Connections {
    target: root.idleService
    enabled: root.idleService !== null

    function onScreensaverWindowCountChanged() { root.syncScreensaverBarVisibility() }
  }

  Component.onDestruction: {
    if (root.screensaverOwnsBarHide && root.bar && !root.barWasHiddenBeforeScreensaver)
      root.bar.barHidden = false
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: ""
    iconComponent: Component {
      Item {
        anchors.fill: parent

        OmaDigest.OmaDigestMark {
          anchors.fill: parent
          size: Math.min(width, height)
          accent: button.active && button.useActiveColor ? button.activeColor : button.foreground
          active: root.opened || OmaDigest.OmaDigestStore.state === "routing"
            || OmaDigest.OmaDigestStore.attentionBusy || OmaDigest.OmaDigestStore.digestState === "working" || OmaDigest.OmaDigestStore.draftState === "working"
            || OmaDigest.OmaDigestStore.dictationState !== "idle" || OmaDigest.OmaDigestStore.tts.state !== "idle"
        }

        Rectangle {
          id: unreadBadge
          visible: root.unreadCount > 0
          anchors.top: parent.top
          anchors.right: parent.right
          anchors.topMargin: -Style.space(4)
          anchors.rightMargin: -Style.space(4)
          width: Math.max(height, unreadLabel.implicitWidth + Style.space(4))
          height: Style.space(11)
          radius: height / 2
          color: Color.accent

          Text {
            textFormat: Text.PlainText
            id: unreadLabel
            anchors.fill: parent
            anchors.leftMargin: Style.space(2)
            anchors.rightMargin: Style.space(2)
            text: root.unreadCount > 99 ? "99+" : String(root.unreadCount)
            color: Color.background
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.space(8)
            font.weight: Font.Bold
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
          }
        }
      }
    }
    active: root.opened || OmaDigest.OmaDigestStore.state === "routing"
      || OmaDigest.OmaDigestStore.attentionBusy || OmaDigest.OmaDigestStore.digestState === "working" || OmaDigest.OmaDigestStore.draftState === "working"
      || OmaDigest.OmaDigestStore.dictationState !== "idle" || OmaDigest.OmaDigestStore.tts.state !== "idle"
    tooltipText: root.unreadCount > 0
      ? root.unreadCount + (root.unreadCount === 1 ? " unread digest" : " unread digests")
      : OmaDigest.OmaDigestStore.status
    Accessible.name: root.unreadCount > 0
      ? "OmaDigest, " + root.unreadCount + (root.unreadCount === 1 ? " unread digest" : " unread digests")
      : "OmaDigest"
    onPressed: root.toggle()
  }
}

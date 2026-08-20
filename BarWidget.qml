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

  function open() { if (panelLoader.item) panelLoader.item.open() }
  function close() { if (panelLoader.item) panelLoader.item.close() }
  function toggle() { if (panelLoader.item) panelLoader.item.toggle() }
  function closeForPopoutSwitch() { if (panelLoader.item) panelLoader.item.closeForPopoutSwitch() }

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
  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

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
      OmaDigest.OmaDigestMark {
        anchors.fill: parent
        size: Math.min(width, height)
        accent: button.active && button.useActiveColor ? button.activeColor : button.foreground
        active: root.opened || OmaDigest.OmaDigestStore.state === "routing"
          || OmaDigest.OmaDigestStore.digestState === "working" || OmaDigest.OmaDigestStore.draftState === "working"
          || OmaDigest.OmaDigestStore.dictationState !== "idle" || OmaDigest.OmaDigestStore.tts.state !== "idle"
      }
    }
    active: root.opened || OmaDigest.OmaDigestStore.state === "routing"
      || OmaDigest.OmaDigestStore.digestState === "working" || OmaDigest.OmaDigestStore.draftState === "working"
      || OmaDigest.OmaDigestStore.dictationState !== "idle" || OmaDigest.OmaDigestStore.tts.state !== "idle"
    tooltipText: OmaDigest.OmaDigestStore.status
    Accessible.name: "OmaDigest"
    onPressed: root.toggle()
  }
}

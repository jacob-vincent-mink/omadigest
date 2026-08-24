import QtQuick
import QtQuick.Controls as QQC
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "components" as OmaDigest

Panel {
  id: root
  moduleName: "io.github.jacob-vincent-mink.omadigest"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property var hostShell: bar && bar.shell ? bar.shell : null
  readonly property var notificationService: hostShell && hostShell.firstPartyServiceFor
    ? hostShell.firstPartyServiceFor("omarchy.notifications") : null
  readonly property var idleService: hostShell && hostShell.firstPartyServiceFor
    ? hostShell.firstPartyServiceFor("omarchy.idle") : null
  readonly property int liveCount: notificationService && notificationService.popupModel
    ? notificationService.popupModel.count : 0
  readonly property int attentionAvailableCount: OmaDigest.OmaDigestStore.attentionCount
  readonly property var releaseUpdate: OmaDigest.OmaDigestStore.updateStatus || ({})
  readonly property bool updateAvailable: String(releaseUpdate.state || "") === "available"
    && releaseUpdate.dismissed !== true
  readonly property bool demoIpcEnabled: Quickshell.env("OMADIGEST_DEMO_IPC") === "1"
  readonly property bool attentionBusy: OmaDigest.OmaDigestStore.attentionBusy

  property string page: "list"
  property bool timelineThreadsOpen: false
  property string digestTab: "unread"
  property string preparedDraftKind: ""
  property string settingsPage: "integrations"
  property string sourcesView: "list"
  property var selectedSource: null
  property var selectedTemplate: null
  property string templateEditMode: "view"
  property string authPromptValue: ""
  property string selectedAuthMethod: ""
  property string connectionView: "overview"
  property string privacyRuleMode: "digest"
  property string researchCadence: "daily"
  property string researchDepth: "broad"
  property string researchRecency: "month"
  property bool researchCreateOpen: false
  property string ttsProvider: "openai-compatible"
  readonly property var privacyOptions: [
    { value: "ignore", label: "Ignore" },
    { value: "count-only", label: "Count only" },
    { value: "digest", label: "Digest" },
    { value: "digest-and-handoff", label: "Digest + agent" }
  ]
  readonly property var authOptions: (OmaDigest.OmaDigestStore.authMethods || []).map(function(method) {
    return { value: String(method.id), label: String(method.label), description: String(method.description || "") }
  })
  property double dndStartedAt: 0
  property string lastScheduledDay: ""
  property string pendingDataDeletion: ""

  onSelectedTemplateChanged: templateEditMode = "view"

  onLiveCountChanged: if (OmaDigest.OmaDigestStore.ready)
    Qt.callLater(function() { OmaDigest.OmaDigestStore.ingest(root.currentAttentionItems()) })

  Connections {
    target: root.idleService
    enabled: root.idleService !== null

    function onIdledThisCycleChanged() {
      if (root.idleService && root.idleService.idledThisCycle) root.close()
    }

    function onScreensaverWindowCountChanged() {
      if (root.idleService && root.idleService.screensaverWindowCount > 0) root.close()
    }
  }

  function open() {
    OmaDigest.OmaDigestStore.refreshNotificationHistory()
    OmaDigest.OmaDigestStore.requestDigestHistory()
    root.controller.show()
    root.markCurrentDigestRead()
  }
  function close() {
    if (dataDeleteConfirm.opened) root.cancelDataDeletion()
    root.controller.hide()
  }
  function toggle() { root.opened ? close() : open() }
  function closeForPopoutSwitch() { root.controller.hide() }
  function boundedIpc(value, maximum) { return String(value || "").slice(0, maximum) }
  function visibleAttentionWatches() {
    return (OmaDigest.OmaDigestStore.attentionWatches || []).filter(function(watch) {
      return String(watch && watch.hiddenAt || "") === ""
    })
  }
  function attentionNextCheckText() {
    var watches = root.visibleAttentionWatches().slice().sort(function(left, right) {
      return String(left.dueAt || "").localeCompare(String(right.dueAt || ""))
    })
    var raw = watches.length > 0 ? String(watches[0].dueAt || "") : ""
    if (!raw) return ""
    var due = new Date(raw)
    if (isNaN(due.getTime())) return ""
    var minutes = Math.max(1, Math.round((due.getTime() - Date.now()) / 60000))
    return minutes < 60 ? "Next review in " + minutes + "m" : "Next review around " + due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }

  function watchDetailText(watch) {
    var conditions = watch && watch.wakeOn ? watch.wakeOn : []
    var labels = []
    if (conditions.indexOf("new-evidence") >= 0) labels.push("related update")
    if (conditions.indexOf("source-change") >= 0) labels.push("status change")
    var due = new Date(String(watch && watch.dueAt || ""))
    if (!isNaN(due.getTime())) labels.push("by " + due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))
    return labels.join(" · ")
  }

  function latestResearchRun(watchId) {
    var runs = OmaDigest.OmaDigestStore.researchRuns || []
    for (var index = 0; index < runs.length; index++)
      if (String(runs[index].watchId || "") === String(watchId || "")) return runs[index]
    return null
  }

  function activeResearchCount() {
    return (OmaDigest.OmaDigestStore.researchWatches || []).filter(function(watch) { return watch.enabled === true }).length
  }

  function dataDeletionPrompt(target) {
    if (target === "digest-history") return "Delete every digest saved by OmaDigest? This cannot be undone."
    if (target === "notification-history") return "Delete notification evidence retained by OmaDigest? Omarchy's notification history will not be changed."
    if (target === "research") return "Delete every research watch and its retained claim history? Saved digest briefs are unchanged."
    if (target === "integrations") return "Delete custom integrations, integration setup, enablement, and known integration secrets? Bundled integrations will be reset, not removed."
    if (target === "templates") return "Delete every custom template and restore packaged defaults?"
    return "Delete all OmaDigest digest, notification, and research history, standing policies, custom integrations, integration setup, and custom templates? Omarchy data, model connections, and the privacy policy will remain."
  }

  function requestDataDeletion(target) {
    if (OmaDigest.OmaDigestStore.dataDeleteState === "working") return
    root.pendingDataDeletion = String(target)
    dataDeleteConfirm.message = root.dataDeletionPrompt(root.pendingDataDeletion)
    dataDeleteConfirm.selectedIndex = 0
    dataDeleteConfirm.opened = true
  }

  function cancelDataDeletion() {
    dataDeleteConfirm.opened = false
    root.pendingDataDeletion = ""
  }

  function compiledTemplateJson(template) {
    if (!template) return ""
    return JSON.stringify({
      version: template.version,
      id: template.id,
      name: template.name,
      description: template.description,
      priority: template.priority,
      match: template.match || {},
      context: template.context,
      output: template.output
    }, null, 2)
  }

  function beginManualTemplateEdit() {
    if (!root.selectedTemplate) return
    templateInstructionsEdit.text = String(root.selectedTemplate.instructions || "")
    templatePolicyEdit.text = root.compiledTemplateJson(root.selectedTemplate)
    OmaDigest.OmaDigestStore.templateEditState = "idle"
    OmaDigest.OmaDigestStore.templateEditMessage = ""
    root.templateEditMode = "manual"
  }

  function saveManualTemplateEdit() {
    if (!root.selectedTemplate || OmaDigest.OmaDigestStore.templateEditState === "saving") return
    OmaDigest.OmaDigestStore.updateTemplate(
      String(root.selectedTemplate.id), templateInstructionsEdit.text, templatePolicyEdit.text)
  }

  function confirmDataDeletion() {
    var target = root.pendingDataDeletion
    dataDeleteConfirm.opened = false
    root.pendingDataDeletion = ""
    if (target) OmaDigest.OmaDigestStore.deleteData(target)
  }

  function digestsForTab(tab) {
    var wantRead = String(tab) === "read"
    return (OmaDigest.OmaDigestStore.digestHistory || []).filter(function(digest) {
      return (String(digest.readAt || "") !== "") === wantRead
    })
  }

  function markCurrentDigestRead() {
    if (root.page !== "detail") return
    var current = OmaDigest.OmaDigestStore.digest
    if (!current || String(current.readAt || "") !== "") return
    OmaDigest.OmaDigestStore.markDigestRead(current.id)
    OmaDigest.OmaDigestStore.digest = Object.assign({}, current, { readAt: new Date().toISOString() })
  }

  function openAttentionTimeline(threadId, threadLabel) {
    root.timelineThreadsOpen = false
    root.page = "timeline"
    OmaDigest.OmaDigestStore.requestAttentionTimeline(
      "events", String(threadId || ""), String(threadLabel || "All attention"), false)
    root.scrollToTop()
  }

  function timelineKindLabel(entry) {
    var kind = String(entry && entry.kind || "evidence")
    var action = String(entry && entry.action || "")
    if (kind === "summary") return "MEMORY SPAN"
    if (kind === "evidence") return "RECEIVED"
    if (kind === "digest") return "DIGESTED"
    if (kind === "outcome") return action === "handoff" ? "SENT TO AGENT" : action.toUpperCase() || "OUTCOME"
    return action === "hold" ? "HELD FOR LATER" : action === "notify" ? "NOTIFIED" : action.toUpperCase() || "DECIDED"
  }

  function timelineWhen(entry) {
    var from = new Date(String(entry && entry.from || ""))
    var to = new Date(String(entry && entry.to || ""))
    if (isNaN(to.getTime())) return ""
    if (Number(entry && entry.episodeCount || 1) > 1 && !isNaN(from.getTime())) {
      var fromDay = from.toLocaleDateString(Qt.locale(), "MMM d")
      var toDay = to.toLocaleDateString(Qt.locale(), "MMM d")
      if (fromDay === toDay)
        return fromDay + " · " + from.toLocaleTimeString(Qt.locale(), "hh:mm") + "–" + to.toLocaleTimeString(Qt.locale(), "hh:mm")
      return fromDay + " – " + toDay
    }
    return to.toLocaleString(Qt.locale(), "MMM d · hh:mm")
  }

  function scrollToTop() { Qt.callLater(function() { panelScroll.contentY = 0 }) }
  function scrollToBottom() {
    Qt.callLater(function() { panelScroll.contentY = Math.max(0, panelScroll.contentHeight - panelScroll.height) })
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function notificationStableId(row, timestamp, app, title) {
    var nativeId = String(row.originalId || row.id || "").slice(0, 40)
    var occurred = Number(timestamp || 0)
    if (isFinite(occurred) && occurred > 0)
      return (String(Math.floor(occurred)) + ":" + nativeId).slice(0, 180)
    return (nativeId || (String(app) + ":" + String(title))).slice(0, 180)
  }

  function currentAttentionItems() {
    var result = []
    var model = notificationService ? notificationService.popupModel : null
    if (model) {
      for (var index = 0; index < model.count && index < 200; index++) {
        var row = model.get(index)
        var timestamp = Number(row.timestamp || Date.now())
        var rawUrgency = Number(row.urgency || 1)
        var app = String(row.app || row.appName || "unknown").slice(0, 120)
        var title = String(row.summary || "").slice(0, 2000)
        var stable = root.notificationStableId(row, timestamp, app, title)
        result.push({
          id: "notification:" + stable.slice(0, 180), source: "notifications", app: app,
          title: title, body: String(row.body || "").slice(0, 8000),
          urgency: rawUrgency >= 2 ? "critical" : (rawUrgency <= 0 ? "low" : "normal"),
          occurredAt: new Date(timestamp).toISOString()
        })
      }
    }
    var byId = {}
    var order = []
    for (var position = 0; position < result.length; position++) {
      var id = String(result[position].id || "")
      if (!id) continue
      if (byId[id] === undefined) order.push(id)
      byId[id] = result[position]
    }
    var deduplicated = []
    for (var item = 0; item < order.length; item++) {
      var candidateId = order[item]
      if (!OmaDigest.OmaDigestStore.acknowledgedAttention[candidateId]) deduplicated.push(byId[candidateId])
    }
    return deduplicated
  }

  function currentAppCounts() {
    var counts = {}
    var items = currentAttentionItems()
    for (var index = 0; index < items.length; index++) {
      var app = String(items[index].app || "unknown")
      counts[app] = Number(counts[app] || 0) + 1
    }
    return counts
  }

  function attentionSummaryText() {
    var available = root.attentionAvailableCount
    if (available > 0) return available + (available === 1 ? " attention item" : " attention items")
    var followUps = root.visibleAttentionWatches().length
    if (followUps > 0) return followUps + (followUps === 1 ? " follow-up" : " follow-ups")
    return "All quiet"
  }

  function availableConnectors() {
    var result = ["notifications"]
    var integrations = OmaDigest.OmaDigestStore.integrations || []
    for (var index = 0; index < integrations.length; index++)
      if (integrations[index].enabled === true) result.push(String(integrations[index].id))
    return result
  }

  function omarchySources() {
    var builtIn = [
      {
        id: "omarchy.notifications", name: "Notifications", kind: "core", enabled: true, configurable: false,
        description: "Privacy-filtered evidence from Omarchy notifications.",
        status: {
          state: root.notificationService ? "green" : "red",
          message: root.notificationService ? "Available through Omarchy" : "Notification service unavailable",
          checkedAt: ""
        },
        categories: [
          { id: "notification-evidence", label: "Notification evidence", description: "Privacy-filtered titles and bodies", enabled: true, defaultEnabled: true }
        ],
        setup: { summary: "Uses the first-party Omarchy notification service.", fields: [] },
        permissions: {}
      },
      {
        id: "omarchy.focus", name: "Focus / DND", kind: "core", enabled: true, configurable: false,
        description: "Focus re-entry timing and digest triggers.",
        status: {
          state: root.notificationService ? "green" : "yellow",
          message: root.notificationService ? "Focus timing available" : "Focus timing is limited",
          checkedAt: ""
        },
        categories: [
          { id: "focus-timing", label: "Focus timing", description: "DND exit timing and automatic triggers", enabled: true, defaultEnabled: true }
        ],
        setup: { summary: "Uses Omarchy idle and notification state for focus re-entry.", fields: [] },
        permissions: {}
      }
    ]
    var integrations = OmaDigest.OmaDigestStore.integrations || []
    for (var index = 0; index < integrations.length; index++)
      if (String(integrations[index].source || "") === "core") builtIn.push(integrations[index])
    return builtIn
  }

  function connectedServiceSources() {
    return (OmaDigest.OmaDigestStore.integrations || []).filter(function(source) {
      return String(source.kind || source.sourceKind || (source.source === "core" ? "core" : "connector")) !== "core"
    })
  }

  function openSource(source) {
    root.selectedSource = source
    root.sourcesView = "detail"
    root.scrollToTop()
  }

  function openSourceAuthoring() {
    root.selectedSource = null
    root.sourcesView = "authoring"
    root.scrollToTop()
  }

  function showSourceList() {
    root.selectedSource = null
    root.sourcesView = "list"
    root.scrollToTop()
  }

  function draftTemplateSuggestion(suggestion) {
    if (!suggestion) return
    OmaDigest.OmaDigestStore.dismissTemplateSuggestion(String(suggestion.id || ""))
    root.settingsPage = "templates"
    root.selectedTemplate = null
    root.page = "settings"
    templateDraftEditor.setRequest(String(suggestion.prompt || ""))
    root.scrollToBottom()
    OmaDigest.OmaDigestStore.startDraft("template", String(suggestion.prompt || ""))
  }

  function generationContext(trigger, focusMinutes) {
    return {
      trigger: trigger || "manual",
      itemCount: root.attentionAvailableCount,
      focusMinutes: Math.max(0, Number(focusMinutes) || 0),
      automaticMinimumItems: Math.max(1, Number(root.setting("minimumItems", 3)) || 3),
      // The broker derives application counts only after enforcing privacy policy.
      appCounts: {},
      availableConnectors: root.availableConnectors(),
      now: new Date().toISOString()
    }
  }

  function generateDigest(trigger, focusMinutes) {
    var items = root.currentAttentionItems()
    if (root.attentionBusy) return
    if (items.length > 0) OmaDigest.OmaDigestStore.ingest(items)
    OmaDigest.OmaDigestStore.wakeAttention(trigger || "manual", focusMinutes || 0,
      Math.max(1, Number(root.setting("minimumItems", 3)) || 3))
  }

  function requestAutomaticGeneration(trigger, focusMinutes) {
    OmaDigest.OmaDigestStore.wakeAttention(trigger, focusMinutes,
      Math.max(1, Number(root.setting("minimumItems", 3)) || 3))
  }

  Connections {
    target: root.notificationService
    function onDoNotDisturbChanged() {
      if (!root.notificationService) return
      if (root.notificationService.doNotDisturb) {
        root.dndStartedAt = Date.now()
        OmaDigest.OmaDigestStore.setAttentionFocus(true)
        return
      }
      OmaDigest.OmaDigestStore.setAttentionFocus(false)
      if (root.dndStartedAt <= 0) return
      var focusMinutes = Math.round((Date.now() - root.dndStartedAt) / 60000)
      root.dndStartedAt = 0
      root.requestAutomaticGeneration("dnd-ended", focusMinutes)
    }
  }

  Connections {
    target: OmaDigest.OmaDigestStore
    function onReadyChanged() {
      if (!OmaDigest.OmaDigestStore.ready) return
      var focusing = root.notificationService && root.notificationService.doNotDisturb === true
      if (focusing && root.dndStartedAt <= 0) root.dndStartedAt = Date.now()
      OmaDigest.OmaDigestStore.setAttentionFocus(focusing)
    }
    function onDigestReadyRevisionChanged() {
      if (!OmaDigest.OmaDigestStore.digest) return
      root.page = "detail"
      if (root.opened) root.markCurrentDigestRead()
    }

    function onTemplatesChanged() {
      if (!root.selectedTemplate) return
      var wanted = String(root.selectedTemplate.id || "")
      var available = OmaDigest.OmaDigestStore.templates || []
      for (var index = 0; index < available.length; index++) {
        if (String(available[index].id || "") !== wanted) continue
        root.selectedTemplate = available[index]
        return
      }
    }

    function onIntegrationsChanged() {
      if (!root.selectedSource) return
      var wanted = String(root.selectedSource.id || "")
      if (wanted === "omarchy.notifications" || wanted === "omarchy.focus") return
      var available = OmaDigest.OmaDigestStore.integrations || []
      for (var index = 0; index < available.length; index++) {
        if (String(available[index].id || "") !== wanted) continue
        root.selectedSource = available[index]
        return
      }
      if (root.sourcesView === "detail") root.showSourceList()
    }

    function onTemplateEditStateChanged() {
      if (OmaDigest.OmaDigestStore.templateEditState === "saved") root.templateEditMode = "view"
    }

    function onDataDeleteRevisionChanged() {
      var target = OmaDigest.OmaDigestStore.dataDeleteTarget
      if (target === "digest-history" || target === "all") root.page = "settings"
    }
  }

  // Navigation and content-free status remain public. Demo mutations are
  // available only when the shell was explicitly started in demo IPC mode.
  IpcHandler {
    target: "omadigest"

    function demoGuard(): string { return root.demoIpcEnabled ? "" : "disabled" }
    function open(): string { root.open(); return "ok" }
    function close(): string { root.close(); return "ok" }

    function showDigests(tab: string): string {
      root.digestTab = String(tab) === "read" ? "read" : "unread"
      root.page = "list"
      root.open()
      root.scrollToTop()
      return "ok"
    }

    function openNewest(tab: string): string {
      var requested = String(tab) === "read" ? "read" : "unread"
      var matches = root.digestsForTab(requested)
      if (matches.length === 0) return "empty"
      root.digestTab = requested
      OmaDigest.OmaDigestStore.openDigestFromHistory(matches[0])
      root.page = "detail"
      root.open()
      root.scrollToTop()
      return "ok"
    }

    function openCurrent(): string {
      if (!OmaDigest.OmaDigestStore.digest) return "empty"
      root.page = "detail"
      root.open()
      root.scrollToTop()
      return "ok"
    }

    function showSettings(section: string): string {
      var requested = String(section)
      root.settingsPage = ["integrations", "templates", "attention", "privacy", "connections", "data"].indexOf(requested) >= 0
        ? requested : "integrations"
      root.selectedTemplate = null
      root.selectedSource = null
      root.sourcesView = "list"
      root.page = "settings"
      root.open()
      root.scrollToTop()
      return "ok"
    }

    function showResearch(): string {
      root.settingsPage = "integrations"
      root.sourcesView = "research"
      root.selectedSource = null
      root.page = "settings"
      root.open()
      root.scrollToTop()
      return "ok"
    }

    function showTimeline(mode: string): string {
      root.page = "timeline"
      root.timelineThreadsOpen = false
      OmaDigest.OmaDigestStore.requestAttentionTimeline(
        String(mode) === "memory" ? "memory" : "events", "", "All attention", false)
      root.open()
      root.scrollToTop()
      return "ok"
    }

    function showSource(integrationId: string): string {
      var wanted = root.boundedIpc(integrationId, 128)
      var available = root.omarchySources().concat(root.connectedServiceSources())
      for (var index = 0; index < available.length; index++) {
        if (String(available[index].id || "") !== wanted) continue
        root.settingsPage = "integrations"
        root.page = "settings"
        root.openSource(available[index])
        root.open()
        return "ok"
      }
      return "missing"
    }

    function previewDataDeletion(target: string): string {
      if (demoGuard()) return demoGuard()
      var requested = root.boundedIpc(target, 32)
      if (["digest-history", "notification-history", "research", "integrations", "templates", "all"].indexOf(requested) < 0)
        return "invalid"
      root.settingsPage = "data"
      root.page = "settings"
      root.open()
      root.requestDataDeletion(requested)
      return "ok"
    }

    function startDraft(kind: string, request: string): string {
      if (demoGuard()) return demoGuard()
      var requestedKind = root.boundedIpc(kind, 20) === "integration" ? "integration" : "template"
      var boundedRequest = root.boundedIpc(request, 20000)
      root.settingsPage = requestedKind === "integration" ? "integrations" : "templates"
      root.page = "settings"
      root.open()
      if (requestedKind === "integration") {
        root.sourcesView = "authoring"
        integrationDraftEditor.setRequest(boundedRequest)
      }
      else {
        root.selectedTemplate = null
        root.templateEditMode = "view"
        templateDraftEditor.setRequest(boundedRequest)
      }
      root.scrollToBottom()
      OmaDigest.OmaDigestStore.startDraft(requestedKind, boundedRequest)
      return "ok"
    }

    function prepareDraft(kind: string, request: string): string {
      if (demoGuard()) return demoGuard()
      var requestedKind = root.boundedIpc(kind, 20) === "integration" ? "integration" : "template"
      var boundedRequest = root.boundedIpc(request, 20000)
      root.preparedDraftKind = requestedKind
      root.settingsPage = requestedKind === "integration" ? "integrations" : "templates"
      root.page = "settings"
      root.open()
      if (requestedKind === "integration") {
        root.sourcesView = "authoring"
        integrationDraftEditor.setRequest(boundedRequest)
      }
      else {
        root.selectedTemplate = null
        root.templateEditMode = "view"
        templateDraftEditor.setRequest(boundedRequest)
      }
      root.scrollToBottom()
      return "ok"
    }

    function submitDraft(kind: string): string {
      if (demoGuard()) return demoGuard()
      if (root.boundedIpc(kind, 20) === "integration") integrationDraftEditor.submit()
      else templateDraftEditor.submit()
      return "ok"
    }

    function submitPreparedDraft(): string {
      if (demoGuard()) return demoGuard()
      if (root.preparedDraftKind === "integration") integrationDraftEditor.submit()
      else if (root.preparedDraftKind === "template") templateDraftEditor.submit()
      else return "empty"
      return "ok"
    }

    function showDraft(kind: string): string {
      if (demoGuard()) return demoGuard()
      var requestedKind = root.boundedIpc(kind, 20) === "integration" ? "integration" : "template"
      root.settingsPage = requestedKind === "integration" ? "integrations" : "templates"
      if (requestedKind === "integration") root.sourcesView = "authoring"
      else {
        root.selectedTemplate = null
        root.templateEditMode = "view"
      }
      root.page = "settings"
      root.open()
      root.scrollToBottom()
      return "ok"
    }

    function acceptDraft(): string {
      if (demoGuard()) return demoGuard()
      if (!OmaDigest.OmaDigestStore.draftId) return "empty"
      OmaDigest.OmaDigestStore.acceptDraft()
      return "ok"
    }

    function showTemplate(templateId: string): string {
      var wanted = root.boundedIpc(templateId, 64)
      var available = OmaDigest.OmaDigestStore.templates || []
      for (var index = 0; index < available.length; index++) {
        if (String(available[index].id) !== wanted) continue
        root.selectedTemplate = available[index]
        root.templateEditMode = "view"
        root.settingsPage = "templates"
        root.page = "settings"
        root.open()
        root.scrollToTop()
        return "ok"
      }
      return "missing"
    }

    function editTemplate(templateId: string, mode: string): string {
      if (demoGuard()) return demoGuard()
      if (showTemplate(templateId) !== "ok") return "missing"
      if (String(mode) === "manual") root.beginManualTemplateEdit()
      else if (String(mode) === "agent") root.templateEditMode = "agent"
      else return "invalid-mode"
      root.scrollToTop()
      return "ok"
    }

    function setupIntegration(integrationId: string, valuesJson: string): string {
      if (demoGuard()) return demoGuard()
      try {
        var rawValues = root.boundedIpc(valuesJson || "{}", 65536)
        OmaDigest.OmaDigestStore.setupIntegration(root.boundedIpc(integrationId, 128), JSON.parse(rawValues))
        return "ok"
      } catch (error) { return "invalid-json" }
    }

    function setupIntegrationDefaults(integrationId: string): string {
      if (demoGuard()) return demoGuard()
      var wanted = root.boundedIpc(integrationId, 128)
      var available = OmaDigest.OmaDigestStore.integrations || []
      for (var index = 0; index < available.length; index++) {
        if (String(available[index].id) !== wanted) continue
        var values = {}
        var fields = available[index].setup.fields || []
        for (var fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
          var field = fields[fieldIndex]
          if (String(field.type) === "boolean") values[String(field.key)] = true
          else if (field.required === true) return "required-value"
          else values[String(field.key)] = ""
        }
        OmaDigest.OmaDigestStore.setupIntegration(wanted, values)
        return "ok"
      }
      return "missing"
    }

    function enableIntegration(integrationId: string): string {
      if (demoGuard()) return demoGuard()
      OmaDigest.OmaDigestStore.setIntegrationEnabled(root.boundedIpc(integrationId, 128), true)
      return "ok"
    }

    function checkIntegration(integrationId: string): string {
      if (demoGuard()) return demoGuard()
      OmaDigest.OmaDigestStore.checkIntegrationStatus(root.boundedIpc(integrationId, 128))
      return "ok"
    }

    function previewRoute(application: string): string {
      if (demoGuard()) return demoGuard()
      var app = root.boundedIpc(application, 120).trim()
      if (!app) return "invalid"
      var counts = {}
      counts[app] = 1
      OmaDigest.OmaDigestStore.selectTemplate("manual", 1, 0, counts, root.availableConnectors())
      return "ok"
    }

    function installAuthoringSkill(): string {
      if (demoGuard()) return demoGuard()
      OmaDigest.OmaDigestStore.installAuthoringSkill()
      return "ok"
    }

    function generate(): string {
      if (demoGuard()) return demoGuard()
      if (root.attentionAvailableCount <= 0 || OmaDigest.OmaDigestStore.digestState === "working") return "unavailable"
      root.generateDigest("manual", 0)
      return "ok"
    }

    function beginFocus(): string {
      if (demoGuard()) return demoGuard()
      root.dndStartedAt = Date.now()
      return "ok"
    }

    function triggerFocusReentry(focusMinutes: int): string {
      if (demoGuard()) return demoGuard()
      if (OmaDigest.OmaDigestStore.digestState === "working") return "working"
      root.requestAutomaticGeneration("dnd-ended", Math.max(0, Number(focusMinutes) || 0))
      return "ok"
    }

    function state(): string {
      if (!root.demoIpcEnabled) return JSON.stringify({
        ready: OmaDigest.OmaDigestStore.ready,
        opened: root.opened,
        page: root.page,
        digestState: OmaDigest.OmaDigestStore.digestState,
        draftState: OmaDigest.OmaDigestStore.draftState,
        attentionCount: root.attentionAvailableCount,
        unreadCount: root.digestsForTab("unread").length,
        readCount: root.digestsForTab("read").length
      })
      return JSON.stringify({
        ready: OmaDigest.OmaDigestStore.ready,
        opened: root.opened,
        page: root.page,
        digestTab: root.digestTab,
        digestState: OmaDigest.OmaDigestStore.digestState,
        digestTitle: OmaDigest.OmaDigestStore.digest ? String(OmaDigest.OmaDigestStore.digest.title || "") : "",
        digestTemplateId: OmaDigest.OmaDigestStore.digest ? String(OmaDigest.OmaDigestStore.digest.templateId || "") : "",
        draftState: OmaDigest.OmaDigestStore.draftState,
        draftKind: OmaDigest.OmaDigestStore.draftKind,
        draftId: OmaDigest.OmaDigestStore.draftId,
        draftProgress: OmaDigest.OmaDigestStore.draftProgress,
        draftPlan: OmaDigest.OmaDigestStore.draftPlan,
        draftPlanStep: OmaDigest.OmaDigestStore.draftPlanStep,
        authoringState: OmaDigest.OmaDigestStore.authoringState,
        authoringMessage: OmaDigest.OmaDigestStore.authoringMessage,
        authoringSkillState: OmaDigest.OmaDigestStore.authoringSkillState,
        authoringSkillMessage: OmaDigest.OmaDigestStore.authoringSkillMessage,
        preparedDraftKind: root.preparedDraftKind,
        selectedTemplateId: root.selectedTemplate ? String(root.selectedTemplate.id || "") : "",
        templateEditMode: root.templateEditMode,
        templateEditState: OmaDigest.OmaDigestStore.templateEditState,
        templateSuggestions: OmaDigest.OmaDigestStore.templateSuggestions,
        dataDeleteState: OmaDigest.OmaDigestStore.dataDeleteState,
        errorCode: OmaDigest.OmaDigestStore.errorCode,
        errorMessage: OmaDigest.OmaDigestStore.errorMessage,
        integrations: OmaDigest.OmaDigestStore.integrations,
        integrationSetup: OmaDigest.OmaDigestStore.integrationSetup,
        integrationStatus: OmaDigest.OmaDigestStore.integrationStatus,
        updateStatus: OmaDigest.OmaDigestStore.updateStatus,
        sourcesView: root.sourcesView,
        selectedSourceId: root.selectedSource ? String(root.selectedSource.id || "") : "",
        routeTemplateId: OmaDigest.OmaDigestStore.selection
          ? String(OmaDigest.OmaDigestStore.selection.templateId || "") : "",
        attentionCount: root.attentionAvailableCount,
        unreadCount: root.digestsForTab("unread").length,
        readCount: root.digestsForTab("read").length
      })
    }
  }

  Timer {
    interval: 30000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: {
      var configured = String(root.setting("scheduleTime", "")).trim()
      if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(configured)) return
      var now = new Date()
      var current = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0")
      var day = now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate()
      if (current !== configured || root.lastScheduledDay === day) return
      root.lastScheduledDay = day
      root.requestAutomaticGeneration("scheduled", 0)
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(500))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: {
        if (dataDeleteConfirm.opened) root.cancelDataDeletion()
        else root.close()
      }
      onTabRequested: function(direction) {
        if (dataDeleteConfirm.opened) dataDeleteConfirm.selectedIndex = dataDeleteConfirm.selectedIndex === 0 ? 1 : 0
        else root.switchPanel(direction)
      }
      onMoveRequested: function(dx, dy) {
        if (dataDeleteConfirm.opened && dx !== 0)
          dataDeleteConfirm.selectedIndex = dataDeleteConfirm.selectedIndex === 0 ? 1 : 0
      }
      onActivateRequested: {
        if (!dataDeleteConfirm.opened) return
        if (dataDeleteConfirm.selectedIndex === 0) root.cancelDataDeletion()
        else root.confirmDataDeletion()
      }

      Flickable {
        id: panelScroll
        anchors.fill: parent
        contentWidth: width
        contentHeight: content.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: content
          width: parent.width
          spacing: Style.space(14)

          Row {
            width: parent.width
            spacing: Style.space(10)

            OmaDigest.OmaDigestMark {
              width: Style.space(34)
              height: width
              size: width
              accent: Color.accent
              active: OmaDigest.OmaDigestStore.digestState === "working" || OmaDigest.OmaDigestStore.draftState === "working"
            }

            Column {
              width: parent.width - headerActions.width - Style.space(54)
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(1)

              Text {
                textFormat: Text.PlainText
                text: root.page === "settings" ? "OMADIGEST SETTINGS"
                  : root.page === "detail" ? "DIGEST"
                  : root.page === "timeline" ? "ATTENTION TIMELINE" : "OMADIGEST"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.subtitle
                font.bold: true
                font.letterSpacing: 1
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: root.page === "list"
                  ? (root.attentionBusy
                    ? String(OmaDigest.OmaDigestStore.attentionActivity.message || "Reviewing attention…")
                    : root.attentionSummaryText())
                  : root.page === "settings" ? "Sources, privacy, connections, and retained data"
                  : root.page === "timeline" ? String(OmaDigest.OmaDigestStore.attentionTimelineThreadLabel || "All attention") : ""
                visible: text !== ""
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }
            }

            Row {
              id: headerActions
              spacing: Style.space(2)
              anchors.verticalCenter: parent.verticalCenter

              PanelActionButton {
                visible: root.page === "detail" || root.page === "settings" || root.page === "timeline"
                iconText: "󰅁"
                tooltipText: root.page === "settings" && root.settingsPage === "integrations" && root.sourcesView !== "list"
                  ? "Back to sources" : "Back to digests"
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: {
                  if (root.page === "settings" && root.settingsPage === "integrations" && root.sourcesView !== "list")
                    root.showSourceList()
                  else {
                    root.timelineThreadsOpen = false
                    root.page = "list"
                  }
                }
              }

              PanelActionButton {
                visible: root.page === "list"
                iconText: "󰋚"
                tooltipText: "Open attention timeline"
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: root.openAttentionTimeline("", "All attention")
              }

              PanelActionButton {
                visible: root.page === "list"
                iconText: root.attentionBusy ? "…" : "+"
                tooltipText: root.attentionAvailableCount > 0 ? "Review attention and build a digest"
                  : "Check enabled sources and build a digest"
                foreground: root.foreground
                fontFamily: root.fontFamily
                enabled: OmaDigest.OmaDigestStore.ready && !root.attentionBusy
                opacity: enabled || root.attentionBusy ? 1 : 0.35
                onClicked: root.generateDigest("manual", 0)
              }

              PanelActionButton {
                visible: root.page === "list" && root.attentionAvailableCount > 0
                iconText: "✓"
                tooltipText: "Mark all attention items seen"
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: OmaDigest.OmaDigestStore.acknowledgeAllAttention()
              }

              Item {
                visible: root.page === "list"
                width: settingsAction.implicitWidth
                height: settingsAction.implicitHeight

                PanelActionButton {
                  id: settingsAction
                  anchors.fill: parent
                  iconText: "󰒓"
                  tooltipText: root.updateAvailable ? "Settings · update available" : "Settings"
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: root.page = "settings"
                }

                Rectangle {
                  visible: root.updateAvailable
                  width: Style.space(8)
                  height: width
                  radius: width / 2
                  color: Color.accent
                  border.width: Style.spacing.hairline
                  border.color: Color.background
                  anchors.right: parent.right
                  anchors.top: parent.top
                  anchors.rightMargin: -Style.space(1)
                  anchors.topMargin: -Style.space(1)
                }
              }
            }
          }

          Rectangle {
            visible: root.page === "list" && OmaDigest.OmaDigestStore.errorMessage !== ""
            width: parent.width
            height: visible ? errorContent.implicitHeight + Style.space(20) : 0
            radius: Style.cornerRadius
            color: Style.normalFillFor(root.foreground, Color.urgent)
            border.width: Style.spacing.hairline
            border.color: Color.urgent

            Column {
              id: errorContent
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.margins: Style.space(10)
              spacing: Style.space(5)

              Row {
                width: parent.width
                Text {
                  textFormat: Text.PlainText
                  width: parent.width - dismissError.width
                  text: OmaDigest.OmaDigestStore.errorCode === "model_not_connected"
                    ? "Connect an AI model" : "OmaDigest couldn't complete that action"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  font.bold: true
                  wrapMode: Text.WordWrap
                }
                Text {
                  textFormat: Text.PlainText
                  id: dismissError
                  text: "×"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  MouseArea {
                    anchors.fill: parent
                    anchors.margins: -Style.space(6)
                    cursorShape: Qt.PointingHandCursor
                    onClicked: OmaDigest.OmaDigestStore.clearError()
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: OmaDigest.OmaDigestStore.errorCode === "model_not_connected"
                  ? "Digest generation needs an authenticated Pi model. Open Connections for the current status."
                  : OmaDigest.OmaDigestStore.errorMessage
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              Text {
                textFormat: Text.PlainText
                visible: OmaDigest.OmaDigestStore.errorCode === "model_not_connected"
                text: "Open Connections →"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                MouseArea {
                  anchors.fill: parent
                  anchors.margins: -Style.space(5)
                  cursorShape: Qt.PointingHandCursor
                  onClicked: {
                    root.settingsPage = "connections"
                    root.page = "settings"
                  }
                }
              }
            }
          }

          // Main screen: unread and read digest lists.
          Column {
            width: parent.width
            visible: root.page === "list"
            spacing: Style.space(8)

            Rectangle {
              id: attentionActivityCard
              width: parent.width
              height: attentionActivityContent.implicitHeight + Style.space(18)
              radius: Style.cornerRadius
              visible: ["checking", "deliberating", "holding", "generating", "notifying", "error"]
                .indexOf(String(OmaDigest.OmaDigestStore.attentionActivity.state || "")) >= 0
                || root.visibleAttentionWatches().length > 0
              color: Util.alpha(Color.accent, 0.08)
              border.width: Style.spacing.hairline
              border.color: Util.alpha(Color.accent, 0.42)

              Column {
                id: attentionActivityContent
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.margins: Style.space(9)
                spacing: Style.space(7)

                Row {
                  id: activityRow
                  width: parent.width
                  spacing: Style.space(9)

                  Rectangle {
                    id: activityPulse
                    anchors.verticalCenter: parent.verticalCenter
                    width: Style.space(8)
                    height: width
                    radius: width / 2
                    color: Color.accent

                    SequentialAnimation on opacity {
                      running: attentionActivityCard.visible && root.attentionBusy
                      loops: Animation.Infinite
                      NumberAnimation { to: 0.28; duration: 650; easing.type: Easing.InOutCubic }
                      NumberAnimation { to: 1; duration: 650; easing.type: Easing.InOutCubic }
                    }
                  }

                  Column {
                    width: parent.width - activityPulse.width - Style.space(9)
                    spacing: Style.space(2)

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: String(OmaDigest.OmaDigestStore.attentionActivity.message || "Watching enabled sources")
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.weight: Font.DemiBold
                      elide: Text.ElideRight
                    }

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      visible: text !== ""
                      text: root.attentionNextCheckText()
                      color: Qt.darker(root.foreground, 1.35)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      font.features: { "tnum": 1 }
                      elide: Text.ElideRight
                    }
                  }
                }

                Repeater {
                  model: root.visibleAttentionWatches().slice(0, 3)

                  Row {
                    required property var modelData
                    width: parent.width
                    height: Math.max(watchCopy.implicitHeight, dismissWatch.implicitHeight)
                    spacing: Style.space(7)

                    Column {
                      id: watchCopy
                      anchors.verticalCenter: parent.verticalCenter
                      width: parent.width - dismissWatch.width - Style.space(7)
                      spacing: Style.space(1)

                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        text: String(modelData.subject || modelData.reason || "Attention watch")
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.weight: Font.DemiBold
                        elide: Text.ElideRight
                      }

                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        text: root.watchDetailText(modelData)
                        color: Qt.darker(root.foreground, 1.35)
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        elide: Text.ElideRight
                      }
                    }

                    PanelActionButton {
                      id: dismissWatch
                      anchors.verticalCenter: parent.verticalCenter
                      iconText: "×"
                      tooltipText: "Hide from main"
                      foreground: root.foreground
                      fontFamily: root.fontFamily
                      onClicked: OmaDigest.OmaDigestStore.dismissAttentionWatch(String(modelData.id || ""))
                    }
                  }
                }
              }
            }

            Row {
              width: parent.width
              spacing: Style.space(6)

              Repeater {
                model: [
                  { id: "unread", label: "Unread" },
                  { id: "read", label: "Read" }
                ]

                Button {
                  required property var modelData
                  width: (content.width - Style.space(6)) / 2
                  height: Math.max(Style.space(40), implicitHeight)
                  text: String(modelData.label) + "  " + root.digestsForTab(modelData.id).length
                  selected: root.digestTab === modelData.id
                  foreground: root.foreground
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  fontSize: Style.font.bodySmall
                  focusable: true
                  onClicked: root.digestTab = String(modelData.id)
                }
              }
            }

            Text {
              textFormat: Text.PlainText
              visible: root.digestsForTab(root.digestTab).length === 0
              width: parent.width
              horizontalAlignment: Text.AlignHCenter
              text: root.digestTab === "unread" && OmaDigest.OmaDigestStore.digestState === "working"
                ? "Building your first digest…"
                : root.digestTab === "read"
                  ? "Digests you open stay here."
                  : "Nothing needs your attention."
              color: Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
              topPadding: Style.space(34)
              bottomPadding: Style.space(34)
            }

            Repeater {
              model: root.digestsForTab(root.digestTab)

              Rectangle {
                required property var modelData
                width: parent.width
                height: digestRow.implicitHeight + Style.space(22)
                radius: Style.cornerRadius
                color: digestMouse.containsMouse
                  ? Style.hoverFillFor(root.foreground, Color.accent)
                  : Style.normalFillFor(root.foreground, Color.accent)
                border.width: Style.spacing.hairline
                border.color: Style.normalBorderFor(root.foreground, Color.accent)

                Row {
                  id: digestRow
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.margins: Style.space(11)
                  spacing: Style.space(10)

                  Column {
                    width: parent.width - digestChevron.width - Style.space(12)
                    spacing: Style.space(2)
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: String(modelData.title)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                      font.bold: true
                      elide: Text.ElideRight
                    }
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: new Date(modelData.generatedAt).toLocaleString(Qt.locale(), "MMM d · hh:mm")
                        + " · " + String(modelData.templateId)
                      color: Qt.darker(root.foreground, 1.4)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }
                  }

                  Text {
                    textFormat: Text.PlainText
                    id: digestChevron
                    anchors.verticalCenter: parent.verticalCenter
                    text: "󰅂"
                    color: Color.accent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                  }
                }

                MouseArea {
                  id: digestMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: OmaDigest.OmaDigestStore.openDigestFromHistory(modelData)
                }
              }
            }
          }

          // One bounded projection of observable attention events and compressed memory.
          Column {
            width: parent.width
            visible: root.page === "timeline"
            spacing: Style.space(10)

            Row {
              width: parent.width
              height: Style.space(40)
              spacing: Style.space(6)

              Repeater {
                model: [
                  { id: "events", label: "Events" },
                  { id: "memory", label: "Memory" }
                ]

                Button {
                  required property var modelData
                  anchors.verticalCenter: parent.verticalCenter
                  width: (content.width - Style.space(6)) / 2
                  height: parent.height
                  text: String(modelData.label)
                  selected: OmaDigest.OmaDigestStore.attentionTimelineMode === modelData.id
                  foreground: root.foreground
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  fontSize: Style.font.bodySmall
                  onClicked: {
                    root.timelineThreadsOpen = false
                    OmaDigest.OmaDigestStore.setAttentionTimelineMode(String(modelData.id))
                  }
                }
              }
            }

            Rectangle {
              width: parent.width
              height: Style.space(42)
              radius: Style.cornerRadius
              color: timelineSubjectMouse.containsMouse
                ? Style.hoverFillFor(root.foreground, Color.accent)
                : Style.normalFillFor(root.foreground, Color.accent)
              border.width: Style.spacing.hairline
              border.color: Style.normalBorderFor(root.foreground, Color.accent)

              Row {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.margins: Style.space(10)
                spacing: Style.space(8)

                Text {
                  textFormat: Text.PlainText
                  width: parent.width - timelineSubjectChevron.width - Style.space(8)
                  text: String(OmaDigest.OmaDigestStore.attentionTimelineThreadLabel || "All attention")
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.weight: Font.DemiBold
                  elide: Text.ElideRight
                }

                Text {
                  textFormat: Text.PlainText
                  id: timelineSubjectChevron
                  anchors.verticalCenter: parent.verticalCenter
                  text: root.timelineThreadsOpen ? "⌃" : "⌄"
                  color: Color.accent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                }
              }

              MouseArea {
                id: timelineSubjectMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.timelineThreadsOpen = !root.timelineThreadsOpen
              }
            }

            Column {
              width: parent.width
              visible: root.timelineThreadsOpen
              spacing: Style.space(3)

              Repeater {
                model: [{ id: "", label: "All attention", episodeCount: Number(OmaDigest.OmaDigestStore.attentionMemory.episodeCount || 0) }]
                  .concat(OmaDigest.OmaDigestStore.attentionTimelineThreads || [])

                Rectangle {
                  required property var modelData
                  width: parent.width
                  height: Style.space(40)
                  radius: Style.cornerRadius
                  color: String(modelData.id || "") === OmaDigest.OmaDigestStore.attentionTimelineThreadId
                    ? Style.selectedFillFor(root.foreground, Color.accent)
                    : (timelineThreadMouse.containsMouse ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent")

                  Row {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.margins: Style.space(9)
                    spacing: Style.space(8)

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width - timelineThreadCount.width - Style.space(8)
                      text: String(modelData.label || "Subject")
                      color: String(modelData.id || "") === OmaDigest.OmaDigestStore.attentionTimelineThreadId
                        ? Color.accent : root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.weight: Font.DemiBold
                      elide: Text.ElideRight
                    }
                    Text {
                      textFormat: Text.PlainText
                      id: timelineThreadCount
                      anchors.verticalCenter: parent.verticalCenter
                      text: String(Number(modelData.episodeCount || 0))
                      color: Qt.darker(root.foreground, 1.35)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      font.features: { "tnum": 1 }
                    }
                  }

                  MouseArea {
                    id: timelineThreadMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      root.timelineThreadsOpen = false
                      OmaDigest.OmaDigestStore.selectAttentionTimelineThread(modelData)
                    }
                  }
                }
              }
            }

            Text {
              textFormat: Text.PlainText
              visible: OmaDigest.OmaDigestStore.attentionTimelineMode === "memory"
                && OmaDigest.OmaDigestStore.attentionTimelineZoomDepth === 0
              width: parent.width
              text: "Recent moments stay distinct. Older history folds into spans you can open."
              color: Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              wrapMode: Text.WordWrap
            }

            Button {
              visible: OmaDigest.OmaDigestStore.attentionTimelineMode === "memory"
                && OmaDigest.OmaDigestStore.attentionTimelineZoomDepth > 0
              width: parent.width
              height: visible ? Style.space(40) : 0
              text: "←  Back to memory overview"
              foreground: root.foreground
              accent: Color.accent
              fontFamily: root.fontFamily
              fontSize: Style.font.caption
              bordered: true
              onClicked: OmaDigest.OmaDigestStore.resetAttentionTimelineZoom()
            }

            Text {
              textFormat: Text.PlainText
              visible: !OmaDigest.OmaDigestStore.attentionTimelineLoading
                && (OmaDigest.OmaDigestStore.attentionTimelineItems || []).length === 0
              width: parent.width
              horizontalAlignment: Text.AlignHCenter
              topPadding: Style.space(30)
              bottomPadding: Style.space(30)
              text: "No attention history yet."
              color: Qt.darker(root.foreground, 1.35)
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }

            Row {
              visible: OmaDigest.OmaDigestStore.attentionTimelineLoading
                && (OmaDigest.OmaDigestStore.attentionTimelineItems || []).length === 0
              width: parent.width
              height: visible ? Style.space(64) : 0
              spacing: Style.space(9)

              Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(8)
                height: width
                radius: width / 2
                color: Color.accent
                SequentialAnimation on opacity {
                  running: parent.visible
                  loops: Animation.Infinite
                  NumberAnimation { to: 0.25; duration: 500; easing.type: Easing.InOutCubic }
                  NumberAnimation { to: 1; duration: 500; easing.type: Easing.InOutCubic }
                }
              }
              Text {
                textFormat: Text.PlainText
                anchors.verticalCenter: parent.verticalCenter
                text: "Loading attention history…"
                color: Qt.darker(root.foreground, 1.25)
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }
            }

            Repeater {
              model: OmaDigest.OmaDigestStore.attentionTimelineItems || []

              Row {
                id: timelineEntry
                required property var modelData
                width: parent.width
                height: timelineCard.height
                spacing: Style.space(8)

                Item {
                  id: timelineRail
                  width: Style.space(28)
                  height: parent.height

                  Rectangle {
                    anchors.horizontalCenter: parent.horizontalCenter
                    anchors.top: parent.top
                    anchors.bottom: parent.bottom
                    width: Style.spacing.hairline
                    color: Util.alpha(Color.accent, 0.38)
                  }

                  Rectangle {
                    anchors.horizontalCenter: parent.horizontalCenter
                    anchors.top: parent.top
                    anchors.topMargin: Style.space(14)
                    width: Math.min(Style.space(18), Style.space(9) + Math.log(Number(modelData.episodeCount || 1)) / Math.LN2)
                    height: width
                    radius: width / 2
                    color: String(modelData.kind || "") === "summary" ? Color.background : Color.accent
                    border.width: String(modelData.kind || "") === "summary" ? Style.space(2) : 0
                    border.color: Color.accent
                  }
                }

                Rectangle {
                  id: timelineCard
                  width: parent.width - timelineRail.width - parent.spacing
                  height: timelineCardContent.implicitHeight + Style.space(18)
                  radius: Style.cornerRadius
                  color: timelineCardMouse.containsMouse && modelData.expandable === true
                    ? Style.hoverFillFor(root.foreground, Color.accent)
                    : Style.normalFillFor(root.foreground, Color.accent)
                  border.width: Style.spacing.hairline
                  border.color: modelData.expandable === true
                    ? Util.alpha(Color.accent, 0.58) : Style.normalBorderFor(root.foreground, Color.accent)

                  Column {
                    id: timelineCardContent
                    anchors.fill: parent
                    anchors.margins: Style.space(9)
                    spacing: Style.space(4)

                    Row {
                      width: parent.width
                      spacing: Style.space(8)
                      Text {
                        textFormat: Text.PlainText
                        width: parent.width - timelineWhen.width - Style.space(8)
                        text: root.timelineKindLabel(modelData)
                        color: Color.accent
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.bold: true
                        font.letterSpacing: 0.8
                        elide: Text.ElideRight
                      }
                      Text {
                        textFormat: Text.PlainText
                        id: timelineWhen
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.timelineWhen(modelData)
                        color: Qt.darker(root.foreground, 1.4)
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.features: { "tnum": 1 }
                      }
                    }

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: String(modelData.subject || "Attention moment")
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.weight: Font.DemiBold
                      elide: Text.ElideRight
                    }

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: String(modelData.summary || "")
                      color: Qt.darker(root.foreground, 1.22)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      wrapMode: Text.WordWrap
                      maximumLineCount: 3
                      elide: Text.ElideRight
                    }

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: Number(modelData.episodeCount || 1) > 1
                        ? String(modelData.episodeCount) + " moments · open to inspect"
                        : (modelData.applications || []).join(" · ")
                      visible: text !== ""
                      color: Qt.darker(root.foreground, 1.4)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }
                  }

                  MouseArea {
                    id: timelineCardMouse
                    anchors.fill: parent
                    enabled: modelData.expandable === true
                    hoverEnabled: enabled
                    cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onClicked: OmaDigest.OmaDigestStore.zoomAttentionTimeline(String(modelData.memoryNodeId || ""))
                  }
                }
              }
            }

            Button {
              visible: OmaDigest.OmaDigestStore.attentionTimelineMode === "events"
                && OmaDigest.OmaDigestStore.attentionTimelineHasMore
              width: parent.width
              height: visible ? Style.space(40) : 0
              text: OmaDigest.OmaDigestStore.attentionTimelineLoading ? "Loading…" : "Load older events"
              foreground: root.foreground
              accent: Color.accent
              fontFamily: root.fontFamily
              fontSize: Style.font.caption
              bordered: true
              enabled: !OmaDigest.OmaDigestStore.attentionTimelineLoading
              onClicked: OmaDigest.OmaDigestStore.loadOlderAttentionTimeline()
            }
          }

          // Clicking a list item opens this focused reader.
          Column {
            width: parent.width
            visible: root.page === "detail" && OmaDigest.OmaDigestStore.digest !== null
            spacing: Style.space(12)

            Row {
              width: parent.width
              spacing: Style.space(8)

              Column {
                width: parent.width - detailActions.width - Style.space(8)
                spacing: Style.space(2)
                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  text: OmaDigest.OmaDigestStore.digest ? String(OmaDigest.OmaDigestStore.digest.title) : ""
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.display
                  font.bold: true
                  wrapMode: Text.WordWrap
                }
                Text {
                  textFormat: Text.PlainText
                  text: OmaDigest.OmaDigestStore.digest
                    ? new Date(OmaDigest.OmaDigestStore.digest.generatedAt).toLocaleString(Qt.locale(), "MMM d · hh:mm") : ""
                  color: Qt.darker(root.foreground, 1.4)
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
              }

              Row {
                id: detailActions
                spacing: Style.space(2)
                anchors.verticalCenter: parent.verticalCenter
                PanelActionButton {
                  visible: OmaDigest.OmaDigestStore.tts.configured
                  iconText: OmaDigest.OmaDigestStore.tts.state === "playing" ? "󰏤" : "󰋋"
                  tooltipText: "Read digest"
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  enabled: OmaDigest.OmaDigestStore.tts.configured
                  onClicked: {
                    if (OmaDigest.OmaDigestStore.tts.state === "playing" || OmaDigest.OmaDigestStore.tts.state === "paused")
                      OmaDigest.OmaDigestStore.pauseReadMode()
                    else OmaDigest.OmaDigestStore.readDigest()
                  }
                }
                PanelActionButton {
                  visible: OmaDigest.OmaDigestStore.tts.state !== "idle"
                  iconText: "󰓛"
                  tooltipText: "Stop reading"
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: OmaDigest.OmaDigestStore.stopReadMode()
                }
              }
            }

            Repeater {
              model: OmaDigest.OmaDigestStore.digest ? OmaDigest.OmaDigestStore.digest.sections : []

              Column {
                id: sectionDelegate
                required property var modelData
                required property int index
                width: parent.width
                spacing: Style.space(6)

                Text {
                  textFormat: Text.PlainText
                  text: String(modelData.title).toUpperCase()
                  color: Color.accent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: true
                  font.letterSpacing: 1
                }

                Repeater {
                  model: modelData.entries || []
                  Rectangle {
                    required property var modelData
                    required property int index
                    width: parent.width
                    height: entryContent.implicitHeight + Style.space(18)
                    radius: Style.cornerRadius
                    color: Style.normalFillFor(root.foreground, Color.accent)

                    Column {
                      id: entryContent
                      anchors.fill: parent
                      anchors.margins: Style.space(9)
                      spacing: Style.space(7)

                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        text: String(modelData.headline) + "\n" + String(modelData.explanation)
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        wrapMode: Text.WordWrap
                      }

                      Row {
                        x: parent.width - width
                        width: Style.space(280)
                        height: Style.space(30)
                        spacing: Style.space(6)

                        Rectangle {
                          width: (parent.width - parent.spacing) * 0.38
                          height: parent.height
                          radius: Style.cornerRadius
                          color: explainMouse.containsMouse
                            ? Style.hoverFillFor(root.foreground, Color.accent)
                            : Style.normalFillFor(root.foreground, Color.accent)
                          Text {
                            textFormat: Text.PlainText
                            anchors.centerIn: parent
                            text: "Why this?"
                            color: Color.accent
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                          }
                          MouseArea {
                            id: explainMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: OmaDigest.OmaDigestStore.explainDigestEntry(
                              OmaDigest.OmaDigestStore.digest.id, sectionDelegate.index, index)
                          }
                        }

                        Rectangle {
                          width: parent.width - parent.spacing - (parent.width - parent.spacing) * 0.38
                          height: parent.height
                          radius: Style.cornerRadius
                          color: agentMouse.containsMouse
                            ? Style.hoverFillFor(root.foreground, Color.accent)
                            : Style.normalFillFor(root.foreground, Color.accent)
                          Text {
                            textFormat: Text.PlainText
                            anchors.centerIn: parent
                            text: "Send to agent  →"
                            color: Color.accent
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                          }
                          MouseArea {
                            id: agentMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: OmaDigest.OmaDigestStore.handoffDigestEntry(
                              OmaDigest.OmaDigestStore.digest.id, sectionDelegate.index, index)
                          }
                        }
                      }

                      Rectangle {
                        visible: OmaDigest.OmaDigestStore.attentionExplanation !== null
                          && String(OmaDigest.OmaDigestStore.attentionExplanation.title || "") === String(modelData.headline || "")
                        width: parent.width
                        height: visible ? explanationContent.implicitHeight + Style.space(16) : 0
                        radius: Style.cornerRadius
                        color: Style.selectedFillFor(root.foreground, Color.accent)
                        border.width: Style.spacing.hairline
                        border.color: Color.accent
                        Column {
                          id: explanationContent
                          anchors.fill: parent
                          anchors.margins: Style.space(8)
                          spacing: Style.space(4)
                          Text {
                            textFormat: Text.PlainText
                            width: parent.width
                            text: "WHY THIS SURFACED"
                            color: Color.accent
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                            font.letterSpacing: 1
                          }
                          Text {
                            textFormat: Text.PlainText
                            width: parent.width
                            text: OmaDigest.OmaDigestStore.attentionExplanation
                              ? String(OmaDigest.OmaDigestStore.attentionExplanation.summary || "") : ""
                            color: root.foreground
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            wrapMode: Text.WordWrap
                          }
                          Text {
                            textFormat: Text.PlainText
                            width: parent.width
                            text: OmaDigest.OmaDigestStore.attentionExplanation
                              ? (OmaDigest.OmaDigestStore.attentionExplanation.applications || []).join(" · ") : ""
                            color: Qt.darker(root.foreground, 1.35)
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            elide: Text.ElideRight
                          }
                          Text {
                            textFormat: Text.PlainText
                            visible: OmaDigest.OmaDigestStore.attentionExplanation !== null
                              && OmaDigest.OmaDigestStore.attentionExplanation.thread !== undefined
                            text: "View subject timeline  →"
                            color: Color.accent
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                            topPadding: Style.space(3)
                            MouseArea {
                              anchors.fill: parent
                              anchors.margins: -Style.space(6)
                              cursorShape: Qt.PointingHandCursor
                              onClicked: {
                                var explanation = OmaDigest.OmaDigestStore.attentionExplanation
                                root.openAttentionTimeline(
                                  explanation && explanation.thread ? String(explanation.thread.id || "") : "",
                                  explanation && explanation.thread ? String(explanation.thread.label || "Subject") : "Subject")
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

            Row {
              width: parent.width
              height: Style.space(32)
              spacing: Style.space(8)
              Text {
                textFormat: Text.PlainText
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - usefulDigest.width - notUsefulDigest.width - parent.spacing * 2
                text: "Was this useful?"
                color: Qt.darker(root.foreground, 1.25)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }
              Button {
                id: usefulDigest
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(72)
                height: parent.height
                text: OmaDigest.OmaDigestStore.digest && OmaDigest.OmaDigestStore.digest.feedback === "useful" ? "✓ Yes" : "Yes"
                selected: OmaDigest.OmaDigestStore.digest && OmaDigest.OmaDigestStore.digest.feedback === "useful"
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                onClicked: OmaDigest.OmaDigestStore.setDigestFeedback(OmaDigest.OmaDigestStore.digest.id, "useful")
              }
              Button {
                id: notUsefulDigest
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(96)
                height: parent.height
                text: OmaDigest.OmaDigestStore.digest && OmaDigest.OmaDigestStore.digest.feedback === "not-useful" ? "✓ Not really" : "Not really"
                selected: OmaDigest.OmaDigestStore.digest && OmaDigest.OmaDigestStore.digest.feedback === "not-useful"
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                onClicked: OmaDigest.OmaDigestStore.setDigestFeedback(OmaDigest.OmaDigestStore.digest.id, "not-useful")
              }
            }
          }

          // Management lives behind one corner icon.
          Column {
            width: parent.width
            visible: root.page === "settings"
            spacing: Style.space(12)

            Row {
              width: parent.width
              spacing: Style.space(6)

              Repeater {
                model: [
                  { id: "integrations", label: "Sources" },
                  { id: "templates", label: "Templates" },
                  { id: "attention", label: "Attention" },
                  { id: "privacy", label: "Privacy" },
                  { id: "connections", label: "Connections" },
                  { id: "data", label: "Data" }
                ]
                Rectangle {
                  required property var modelData
                  width: (content.width - Style.space(30)) / 6
                  height: Style.space(34)
                  radius: Style.cornerRadius
                  color: root.settingsPage === modelData.id
                    ? Style.selectedFillFor(root.foreground, Color.accent)
                    : (settingsTabMouse.containsMouse ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent")
                  Text {
                    textFormat: Text.PlainText
                    anchors.centerIn: parent
                    text: String(modelData.label)
                    color: root.settingsPage === modelData.id ? Color.accent : root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: root.settingsPage === modelData.id
                  }
                  MouseArea {
                    id: settingsTabMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      root.settingsPage = String(modelData.id)
                      if (root.settingsPage === "templates") root.selectedTemplate = null
                      if (root.settingsPage === "connections") root.connectionView = "overview"
                      if (root.settingsPage === "integrations") root.showSourceList()
                    }
                  }
                }
              }
            }

            Rectangle {
              visible: root.updateAvailable
              width: parent.width
              height: visible ? releaseUpdateContent.implicitHeight + Style.space(20) : 0
              radius: Style.cornerRadius
              color: Style.selectedFillFor(root.foreground, Color.accent)
              border.width: Style.spacing.hairline
              border.color: Color.accent

              Column {
                id: releaseUpdateContent
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.margins: Style.space(10)
                spacing: Style.space(7)

                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  text: "OMADIGEST " + String(root.releaseUpdate.latestVersion || "") + " IS AVAILABLE"
                  color: Color.accent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: true
                  font.letterSpacing: 1
                  elide: Text.ElideRight
                }

                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  text: "You’re on " + String(root.releaseUpdate.currentVersion || "this version")
                    + ". Review the release, then update with Omarchy when you’re ready."
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: Text.WordWrap
                }

                Row {
                  width: parent.width
                  height: Style.space(34)
                  spacing: Style.space(8)

                  Button {
                    width: (parent.width - parent.spacing) * 0.62
                    height: parent.height
                    text: "View release"
                    foreground: root.foreground
                    accent: Color.accent
                    fontFamily: root.fontFamily
                    fontSize: Style.font.bodySmall
                    bordered: true
                    focusable: true
                    onClicked: OmaDigest.OmaDigestStore.openUpdate()
                  }

                  Button {
                    width: parent.width - parent.spacing - (parent.width - parent.spacing) * 0.62
                    height: parent.height
                    text: "Dismiss"
                    foreground: root.foreground
                    accent: Color.accent
                    fontFamily: root.fontFamily
                    fontSize: Style.font.bodySmall
                    focusable: true
                    onClicked: OmaDigest.OmaDigestStore.dismissUpdate()
                  }
                }
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "integrations" && root.sourcesView === "list"
              spacing: Style.space(8)

              Rectangle {
                width: parent.width
                height: Style.space(58)
                radius: Style.cornerRadius
                color: researchSourceMouse.containsMouse || activeFocus
                  ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent"
                border.width: researchSourceMouse.containsMouse || activeFocus ? Style.spacing.hairline : 0
                border.color: activeFocus ? Color.accent : Style.normalBorderFor(root.foreground, Color.accent)
                activeFocusOnTab: true
                Keys.onReturnPressed: root.sourcesView = "research"
                Keys.onEnterPressed: root.sourcesView = "research"
                Keys.onSpacePressed: root.sourcesView = "research"

                Row {
                  anchors.fill: parent
                  anchors.leftMargin: Style.space(10)
                  anchors.rightMargin: Style.space(8)
                  spacing: Style.space(9)
                  Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    width: Style.space(8)
                    height: width
                    radius: width / 2
                    color: String(OmaDigest.OmaDigestStore.researchActivity.state || "") === "error"
                      ? Color.urgent : root.activeResearchCount() > 0 ? "#62b879" : "#d6a84b"
                  }
                  Column {
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - Style.space(17) - researchChevron.width - parent.spacing * 2
                    spacing: Style.space(1)
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: "Research watches"
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.bold: true
                      elide: Text.ElideRight
                    }
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: root.activeResearchCount() + " active · cited briefs when the answer changes"
                      color: Qt.darker(root.foreground, 1.4)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }
                  }
                  Text {
                    textFormat: Text.PlainText
                    id: researchChevron
                    width: Style.space(16)
                    anchors.verticalCenter: parent.verticalCenter
                    horizontalAlignment: Text.AlignHCenter
                    text: "󰅂"
                    color: Qt.darker(root.foreground, 1.25)
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                  }
                }
                MouseArea {
                  id: researchSourceMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.sourcesView = "research"
                }
              }

              Text {
                textFormat: Text.PlainText
                text: "OMARCHY"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Repeater {
                model: root.omarchySources()
                OmaDigest.IntegrationCard {
                  required property var modelData
                  integration: modelData
                  width: parent.width
                  foreground: root.foreground
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  onOpenRequested: function(source) { root.openSource(source) }
                }
              }

              Text {
                textFormat: Text.PlainText
                topPadding: Style.space(5)
                text: "CONNECTED SERVICES"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Text {
                textFormat: Text.PlainText
                visible: root.connectedServiceSources().length === 0
                width: parent.width
                text: "No connected services yet."
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
              }

              Repeater {
                model: root.connectedServiceSources()
                OmaDigest.IntegrationCard {
                  required property var modelData
                  integration: modelData
                  width: parent.width
                  foreground: root.foreground
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  onOpenRequested: function(source) { root.openSource(source) }
                }
              }

              Button {
                width: parent.width
                height: Style.space(40)
                text: "Add source"
                iconText: "+"
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                leftAlign: true
                bordered: true
                focusable: true
                onClicked: root.openSourceAuthoring()
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "integrations" && root.sourcesView === "research"
              spacing: Style.space(10)

              Button {
                width: parent.width
                height: Style.space(40)
                text: "Back to sources"
                iconText: "󰅁"
                leftAlign: true
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                focusable: true
                onClicked: root.showSourceList()
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "RESEARCH WATCHES"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "Keep a question warm. OmaDigest builds a cited baseline, then briefs you when the answer meaningfully changes."
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              Rectangle {
                id: researchActivityBanner
                readonly property bool working: ["searching", "reading", "synthesizing"].indexOf(
                  String(OmaDigest.OmaDigestStore.researchActivity.state || "")) >= 0
                visible: working || String(OmaDigest.OmaDigestStore.researchActivity.state || "") === "error"
                width: parent.width
                height: visible ? researchActivityText.implicitHeight + Style.space(20) : 0
                radius: Style.cornerRadius
                color: Style.selectedFillFor(root.foreground, Color.accent)
                border.width: Style.spacing.hairline
                border.color: String(OmaDigest.OmaDigestStore.researchActivity.state || "") === "error" ? Color.urgent : Color.accent
                SequentialAnimation on opacity {
                  running: researchActivityBanner.working
                  loops: Animation.Infinite
                  NumberAnimation { from: 0.78; to: 1; duration: 650; easing.type: Easing.InOutSine }
                  NumberAnimation { from: 1; to: 0.78; duration: 650; easing.type: Easing.InOutSine }
                }
                Text {
                  textFormat: Text.PlainText
                  id: researchActivityText
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.margins: Style.space(10)
                  text: String(OmaDigest.OmaDigestStore.researchActivity.message || "Researching public sources")
                  color: parent.border.color
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: true
                  wrapMode: Text.WordWrap
                }
              }

              Button {
                width: parent.width
                height: Style.space(40)
                text: root.researchCreateOpen ? "Close new watch" : "New research watch"
                iconText: root.researchCreateOpen ? "󰅖" : "+"
                leftAlign: true
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                bordered: root.researchCreateOpen
                focusable: true
                onClicked: root.researchCreateOpen = !root.researchCreateOpen
              }

              Column {
                width: parent.width
                visible: root.researchCreateOpen
                spacing: Style.space(10)

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "NEW WATCH"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              QQC.TextField {
                id: researchName
                width: parent.width
                height: Style.space(40)
                placeholderText: "Competition watch"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }

              QQC.TextArea {
                textFormat: TextEdit.PlainText
                id: researchQuestion
                width: parent.width
                height: Style.space(86)
                placeholderText: "What has changed in the Omarchy plugin competition, deadlines, rules, or judging?"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: TextEdit.Wrap
                background: Rectangle {
                  radius: Style.cornerRadius
                  color: Style.normalFillFor(root.foreground, Color.accent)
                  border.width: Style.spacing.hairline
                  border.color: Style.normalBorderFor(root.foreground, Color.accent)
                }
              }

              Row {
                width: parent.width
                height: Style.space(40)
                spacing: Style.space(6)
                Repeater {
                  model: [
                    { id: "hourly", label: "Hourly" }, { id: "six-hourly", label: "6 hours" },
                    { id: "daily", label: "Daily" }, { id: "weekly", label: "Weekly" }
                  ]
                  Button {
                    required property var modelData
                    width: (parent.width - parent.spacing * 3) / 4
                    height: parent.height
                    text: String(modelData.label)
                    selected: root.researchCadence === String(modelData.id)
                    foreground: root.foreground
                    accent: Color.accent
                    fontFamily: root.fontFamily
                    fontSize: Style.font.caption
                    bordered: root.researchCadence === String(modelData.id)
                    focusable: true
                    onClicked: root.researchCadence = String(modelData.id)
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "RESEARCH DEPTH"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Row {
                width: parent.width
                height: Style.space(40)
                spacing: Style.space(6)
                Repeater {
                  model: [
                    { id: "focused", label: "Focused" },
                    { id: "broad", label: "Broad" },
                    { id: "deep", label: "Deep" }
                  ]
                  Button {
                    required property var modelData
                    width: (parent.width - parent.spacing * 2) / 3
                    height: parent.height
                    text: String(modelData.label)
                    selected: root.researchDepth === String(modelData.id)
                    foreground: root.foreground
                    accent: Color.accent
                    fontFamily: root.fontFamily
                    fontSize: Style.font.caption
                    bordered: selected
                    focusable: true
                    onClicked: root.researchDepth = String(modelData.id)
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: root.researchDepth === "focused" ? "Up to 4 searches and 12 pages per run."
                  : root.researchDepth === "deep" ? "Up to 20 searches and 60 pages per run."
                    : "Up to 10 searches and 30 pages per run."
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                wrapMode: Text.WordWrap
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "CHANGE WINDOW"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Row {
                width: parent.width
                height: Style.space(40)
                spacing: Style.space(6)
                Repeater {
                  model: [
                    { id: "day", label: "24h" }, { id: "week", label: "7d" },
                    { id: "month", label: "30d" }, { id: "anytime", label: "Any time" }
                  ]
                  Button {
                    required property var modelData
                    width: (parent.width - parent.spacing * 3) / 4
                    height: parent.height
                    text: String(modelData.label)
                    selected: root.researchRecency === String(modelData.id)
                    foreground: root.foreground
                    accent: Color.accent
                    fontFamily: root.fontFamily
                    fontSize: Style.font.caption
                    bordered: selected
                    focusable: true
                    onClicked: root.researchRecency = String(modelData.id)
                  }
                }
              }

              QQC.TextArea {
                textFormat: TextEdit.PlainText
                id: researchSources
                width: parent.width
                height: Style.space(66)
                placeholderText: "Preferred HTTPS sources, one per line (optional)"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                wrapMode: TextEdit.WrapAnywhere
                background: Rectangle {
                  radius: Style.cornerRadius
                  color: Style.normalFillFor(root.foreground, Color.accent)
                  border.width: Style.spacing.hairline
                  border.color: Style.normalBorderFor(root.foreground, Color.accent)
                }
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "Your question, search terms, and public pages leave this computer. Sources are treated as untrusted evidence."
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                wrapMode: Text.WordWrap
              }

              Button {
                width: parent.width
                height: Style.space(40)
                text: "Create watch and build baseline"
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                bordered: true
                focusable: true
                enabled: researchName.text.trim() !== "" && researchQuestion.text.trim().length >= 3
                  && ["searching", "reading", "synthesizing"].indexOf(String(OmaDigest.OmaDigestStore.researchActivity.state || "")) < 0
                opacity: enabled ? 1 : 0.5
                onClicked: {
                  OmaDigest.OmaDigestStore.createResearchWatch(
                    researchName.text, researchQuestion.text, root.researchCadence, root.researchDepth,
                    root.researchRecency, researchSources.text.split(/\r?\n/))
                  researchName.text = ""
                  researchQuestion.text = ""
                  researchSources.text = ""
                  root.researchCreateOpen = false
                }
              }

              }

              Text {
                textFormat: Text.PlainText
                visible: (OmaDigest.OmaDigestStore.researchWatches || []).length > 0
                width: parent.width
                topPadding: Style.space(5)
                text: "YOUR WATCHES"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Repeater {
                model: OmaDigest.OmaDigestStore.researchWatches || []
                OmaDigest.ResearchWatchCard {
                  required property var modelData
                  watch: modelData
                  latestRun: root.latestResearchRun(String(modelData.id || ""))
                  activity: OmaDigest.OmaDigestStore.researchActivity
                  width: parent.width
                  foreground: root.foreground
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  onRunRequested: function(watchId) { OmaDigest.OmaDigestStore.runResearchWatch(watchId) }
                  onWatchEnabledRequested: function(watchId, enabled) { OmaDigest.OmaDigestStore.setResearchWatchEnabled(watchId, enabled) }
                  onConfigurationRequested: function(watchId, depth, recency) {
                    OmaDigest.OmaDigestStore.updateResearchWatch(watchId, depth, recency)
                  }
                  onRebaselineRequested: function(watchId) { OmaDigest.OmaDigestStore.rebuildResearchBaseline(watchId) }
                  onDeleteRequested: function(watchId) { OmaDigest.OmaDigestStore.deleteResearchWatch(watchId) }
                }
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "integrations" && root.sourcesView === "detail"
              spacing: Style.space(10)

              Button {
                width: parent.width
                height: Style.space(32)
                text: "Back to sources"
                iconText: "󰅁"
                leftAlign: true
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                focusable: true
                onClicked: root.showSourceList()
              }

              Column {
                width: parent.width
                spacing: Style.space(2)
                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  text: root.selectedSource ? String(root.selectedSource.name || "Source") : "Source"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.subtitle
                  font.bold: true
                  elide: Text.ElideRight
                }
                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  text: root.selectedSource ? String(root.selectedSource.description || "") : ""
                  color: Qt.darker(root.foreground, 1.35)
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  wrapMode: Text.WordWrap
                }
              }

              OmaDigest.IntegrationCard {
                visible: root.selectedSource !== null
                integration: root.selectedSource || ({ id: "", name: "", kind: "core" })
                detail: true
                width: parent.width
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "integrations" && root.sourcesView === "authoring"
              spacing: Style.space(10)

              Button {
                width: parent.width
                height: Style.space(32)
                text: "Back to sources"
                iconText: "󰅁"
                leftAlign: true
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                focusable: true
                onClicked: root.showSourceList()
              }
              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "ADD SOURCE"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.subtitle
                font.bold: true
                font.letterSpacing: 1
                elide: Text.ElideRight
              }
              OmaDigest.DraftEditor {
                id: integrationDraftEditor
                kind: "integration"
                width: parent.width
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "templates" && root.selectedTemplate === null
              spacing: Style.space(10)

              Repeater {
                model: (OmaDigest.OmaDigestStore.templateSuggestions || []).slice(0, 1)
                Rectangle {
                  required property var modelData
                  width: parent.width
                  height: suggestionContent.implicitHeight + Style.space(20)
                  radius: Style.cornerRadius
                  color: Style.selectedFillFor(root.foreground, Color.accent)
                  border.width: Style.spacing.hairline
                  border.color: Color.accent

                  Column {
                    id: suggestionContent
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.margins: Style.space(10)
                    spacing: Style.space(6)

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: "SUGGESTED FOR YOU · " + Number(modelData.itemCount || 0) + " RECENT"
                      color: Color.accent
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      font.bold: true
                      font.letterSpacing: 1
                      elide: Text.ElideRight
                    }
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: String(modelData.title || "Suggested template")
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.subtitle
                      font.bold: true
                      wrapMode: Text.WordWrap
                    }
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: String(modelData.description || "")
                      color: Qt.darker(root.foreground, 1.3)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      wrapMode: Text.WordWrap
                    }
                    Text {
                      textFormat: Text.PlainText
                      visible: String(modelData.example || "") !== ""
                      width: parent.width
                      text: String(modelData.example || "")
                      color: Qt.darker(root.foreground, 1.4)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      wrapMode: Text.WordWrap
                    }
                    Row {
                      width: parent.width
                      height: Style.space(34)
                      spacing: Style.space(8)
                      Button {
                        width: parent.width * 0.62
                        height: parent.height
                        text: "Draft template"
                        foreground: root.foreground
                        accent: Color.accent
                        fontFamily: root.fontFamily
                        fontSize: Style.font.bodySmall
                        bordered: true
                        focusable: true
                        onClicked: root.draftTemplateSuggestion(modelData)
                      }
                      Button {
                        width: parent.width - parent.spacing - parent.width * 0.62
                        height: parent.height
                        text: "Not now"
                        foreground: root.foreground
                        accent: Color.accent
                        fontFamily: root.fontFamily
                        fontSize: Style.font.bodySmall
                        focusable: true
                        onClicked: OmaDigest.OmaDigestStore.dismissTemplateSuggestion(String(modelData.id || ""))
                      }
                    }
                  }
                }
              }

              Repeater {
                model: OmaDigest.OmaDigestStore.templates
                Rectangle {
                  required property var modelData
                  property bool confirmingDelete: false
                  width: parent.width
                  height: templateRow.implicitHeight + Style.space(18)
                  radius: Style.cornerRadius
                  color: confirmingDelete
                    ? Util.alpha(Color.urgent, 0.09)
                    : templateMouse.containsMouse
                    ? Style.hoverFillFor(root.foreground, Color.accent)
                    : Style.normalFillFor(root.foreground, Color.accent)
                  border.width: confirmingDelete ? Style.spacing.hairline : 0
                  border.color: Util.alpha(Color.urgent, 0.52)

                  Row {
                    id: templateRow
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.margins: Style.space(9)
                    spacing: Style.space(8)

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width - templateChevron.width - templateDelete.width - parent.spacing * 2
                      text: String(modelData.name) + "\n" + String(modelData.description)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      wrapMode: Text.WordWrap
                    }
                    Text {
                      textFormat: Text.PlainText
                      id: templateChevron
                      width: visible ? Style.space(16) : 0
                      visible: !confirmingDelete
                      anchors.verticalCenter: parent.verticalCenter
                      horizontalAlignment: Text.AlignHCenter
                      text: "󰅂"
                      color: Color.accent
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                    }
                    OmaDigest.InlineDeleteControl {
                      id: templateDelete
                      anchors.verticalCenter: parent.verticalCenter
                      width: implicitWidth
                      confirming: confirmingDelete
                      foreground: root.foreground
                      accent: Color.urgent
                      fontFamily: root.fontFamily
                      onConfirmationRequested: confirmingDelete = true
                      onCancelled: confirmingDelete = false
                      onConfirmed: {
                        confirmingDelete = false
                        OmaDigest.OmaDigestStore.deleteTemplate(String(modelData.id || ""))
                      }
                    }
                  }

                  MouseArea {
                    id: templateMouse
                    anchors.left: parent.left
                    anchors.top: parent.top
                    anchors.bottom: parent.bottom
                    anchors.right: parent.right
                    anchors.rightMargin: templateDelete.width + Style.space(18)
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.selectedTemplate = modelData
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                text: "CREATE A TEMPLATE"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }
              OmaDigest.DraftEditor {
                id: templateDraftEditor
                kind: "template"
                width: parent.width
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "templates" && root.selectedTemplate !== null
              spacing: Style.space(12)

              Text {
                textFormat: Text.PlainText
                text: "‹ All templates"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                MouseArea {
                  anchors.fill: parent
                  anchors.margins: -Style.space(6)
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.selectedTemplate = null
                }
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: root.selectedTemplate ? String(root.selectedTemplate.name) : ""
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.display
                font.bold: true
                wrapMode: Text.WordWrap
              }
              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: root.selectedTemplate ? String(root.selectedTemplate.description) : ""
                color: Qt.darker(root.foreground, 1.25)
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                wrapMode: Text.WordWrap
              }

              Row {
                visible: root.templateEditMode === "view"
                width: parent.width
                height: visible ? Style.space(36) : 0
                spacing: Style.space(8)

                Repeater {
                  model: [
                    { label: "Edit manually", mode: "manual" },
                    { label: "Revise with agent", mode: "agent" }
                  ]
                  Rectangle {
                    required property var modelData
                    width: (parent.width - parent.spacing) / 2
                    height: parent.height
                    radius: Style.cornerRadius
                    color: templateEditMouse.containsMouse
                      ? Style.hoverFillFor(root.foreground, Color.accent)
                      : Style.normalFillFor(root.foreground, Color.accent)
                    border.width: Style.spacing.hairline
                    border.color: Style.normalBorderFor(root.foreground, Color.accent)

                    Text {
                      textFormat: Text.PlainText
                      anchors.centerIn: parent
                      text: String(modelData.label)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.bold: true
                    }
                    MouseArea {
                      id: templateEditMouse
                      anchors.fill: parent
                      hoverEnabled: true
                      cursorShape: Qt.PointingHandCursor
                      onClicked: {
                        if (String(modelData.mode) === "manual") root.beginManualTemplateEdit()
                        else root.templateEditMode = "agent"
                      }
                    }
                  }
                }
              }

              Rectangle {
                visible: root.templateEditMode === "view"
                width: parent.width
                height: visible ? templateDetails.implicitHeight + Style.space(20) : 0
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)

                Column {
                  id: templateDetails
                  anchors.fill: parent
                  anchors.margins: Style.space(10)
                  spacing: Style.space(8)

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: root.selectedTemplate
                      ? "SECTIONS\n" + (root.selectedTemplate.output.sections || []).join("  ·  ") : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: root.selectedTemplate
                      ? "SOURCES\n" + (root.selectedTemplate.context.connectors || []).join("  ·  ") : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: {
                      if (!root.selectedTemplate) return ""
                      var match = root.selectedTemplate.match || {}
                      var pieces = []
                      if ((match.triggers || []).length) pieces.push("triggers: " + match.triggers.join(", "))
                      if (match.minimumItems !== undefined) pieces.push("at least " + match.minimumItems + " items")
                      if (match.minimumFocusMinutes !== undefined) pieces.push("after " + match.minimumFocusMinutes + "+ focus minutes")
                      if ((match.intents || []).length) pieces.push("intents: " + match.intents.join(", "))
                      if ((match.urgencies || []).length) pieces.push("urgency: " + match.urgencies.join(", "))
                      return "MATCHING\n" + (pieces.length ? pieces.join("  ·  ") : "Manual or fallback")
                    }
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: root.selectedTemplate
                      ? "LIMITS\n" + root.selectedTemplate.output.maximumEntries + " entries  ·  "
                        + root.selectedTemplate.context.maximumItems + " context items" : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                visible: root.templateEditMode === "view"
                text: "INSTRUCTIONS"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }
              Text {
                textFormat: Text.PlainText
                visible: root.templateEditMode === "view"
                width: parent.width
                text: root.selectedTemplate ? String(root.selectedTemplate.instructions) : ""
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              Column {
                visible: root.templateEditMode === "manual"
                width: parent.width
                spacing: Style.space(8)

                Text {
                  textFormat: Text.PlainText
                  text: "INSTRUCTIONS"
                  color: Color.accent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: true
                  font.letterSpacing: 1
                }
                QQC.TextArea {
                  textFormat: TextEdit.PlainText
                  id: templateInstructionsEdit
                  width: parent.width
                  height: Style.space(180)
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: TextEdit.Wrap
                  background: Rectangle {
                    radius: Style.cornerRadius
                    color: Style.normalFillFor(root.foreground, Color.accent)
                    border.width: Style.spacing.hairline
                    border.color: Style.normalBorderFor(root.foreground, Color.accent)
                  }
                }

                Text {
                  textFormat: Text.PlainText
                  text: "ROUTING POLICY · JSON"
                  color: Color.accent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: true
                  font.letterSpacing: 1
                }
                QQC.TextArea {
                  textFormat: TextEdit.PlainText
                  id: templatePolicyEdit
                  width: parent.width
                  height: Style.space(250)
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  wrapMode: TextEdit.NoWrap
                  background: Rectangle {
                    radius: Style.cornerRadius
                    color: Style.normalFillFor(root.foreground, Color.accent)
                    border.width: Style.spacing.hairline
                    border.color: Style.normalBorderFor(root.foreground, Color.accent)
                  }
                }

                Row {
                  width: parent.width
                  height: Style.space(36)
                  spacing: Style.space(8)

                  Repeater {
                    model: [{ label: "Save changes", save: true }, { label: "Cancel", save: false }]
                    Rectangle {
                      required property var modelData
                      width: (parent.width - parent.spacing) / 2
                      height: parent.height
                      radius: Style.cornerRadius
                      color: modelData.save ? Color.accent : Style.normalFillFor(root.foreground, Color.accent)
                      opacity: modelData.save && OmaDigest.OmaDigestStore.templateEditState === "saving" ? 0.55 : 1
                      Text {
                        textFormat: Text.PlainText
                        anchors.centerIn: parent
                        text: modelData.save && OmaDigest.OmaDigestStore.templateEditState === "saving" ? "Validating…" : String(modelData.label)
                        color: modelData.save ? Color.background : root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: modelData.save
                      }
                      MouseArea {
                        anchors.fill: parent
                        enabled: !modelData.save || OmaDigest.OmaDigestStore.templateEditState !== "saving"
                        cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: modelData.save ? root.saveManualTemplateEdit() : root.templateEditMode = "view"
                      }
                    }
                  }
                }

                Text {
                  textFormat: Text.PlainText
                  visible: OmaDigest.OmaDigestStore.templateEditMessage !== ""
                  width: parent.width
                  text: OmaDigest.OmaDigestStore.templateEditMessage
                  color: OmaDigest.OmaDigestStore.templateEditState === "error" ? Color.urgent : Color.accent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  wrapMode: Text.WordWrap
                }
              }

              Column {
                visible: root.templateEditMode === "agent"
                width: parent.width
                spacing: Style.space(8)

                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  text: "Describe the change. The constrained template agent receives the current template, shows its plan here, and returns a complete validated revision for review."
                  color: Qt.darker(root.foreground, 1.25)
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: Text.WordWrap
                }
                OmaDigest.DraftEditor {
                  id: templateRevisionEditor
                  kind: "template"
                  revisionTemplateId: root.selectedTemplate ? String(root.selectedTemplate.id) : ""
                  width: parent.width
                  foreground: root.foreground
                  accent: Color.accent
                  fontFamily: root.fontFamily
                }
                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  horizontalAlignment: Text.AlignHCenter
                  text: "Cancel revision"
                  color: Color.accent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: true
                  MouseArea {
                    anchors.fill: parent
                    anchors.margins: -Style.space(6)
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.templateEditMode = "view"
                  }
                }
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "attention"
              spacing: Style.space(10)

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "ATTENTION AGENT"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: Number(OmaDigest.OmaDigestStore.attentionMemory.episodeCount || 0) + " remembered moments · "
                  + Number(OmaDigest.OmaDigestStore.attentionPolicies.length || 0) + " standing policies · "
                  + Number(OmaDigest.OmaDigestStore.attentionActivity.dailyDeliberations || 0) + "/"
                  + Number(OmaDigest.OmaDigestStore.attentionActivity.dailyLimit || 0) + " reviews today"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                topPadding: Style.space(4)
                text: "NEXT REVIEWS"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Text {
                textFormat: Text.PlainText
                visible: (OmaDigest.OmaDigestStore.attentionWatches || []).length === 0
                width: parent.width
                text: "No reviews are scheduled."
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }

              Repeater {
                model: OmaDigest.OmaDigestStore.attentionWatches || []

                Rectangle {
                  required property var modelData
                  property bool confirmingCancel: false
                  width: parent.width
                  height: scheduledReviewContent.implicitHeight + Style.space(18)
                  radius: Style.cornerRadius
                  color: Style.normalFillFor(root.foreground, Color.accent)
                  border.width: Style.spacing.hairline
                  border.color: Style.normalBorderFor(root.foreground, Color.accent)

                  Column {
                    id: scheduledReviewContent
                    anchors.fill: parent
                    anchors.margins: Style.space(9)
                    spacing: Style.space(7)

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: String(modelData.subject || modelData.reason || "Scheduled review")
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.bold: true
                      elide: Text.ElideRight
                    }

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: root.watchDetailText(modelData)
                      color: Qt.darker(root.foreground, 1.35)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }

                    Row {
                      width: parent.width
                      height: Style.space(34)
                      spacing: Style.space(8)

                      Text {
                        textFormat: Text.PlainText
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - reviewActions.implicitWidth - parent.spacing
                        text: String(modelData.hiddenAt || "") !== "" ? "Hidden from main" : "Shown on main"
                        color: String(modelData.hiddenAt || "") !== "" ? Qt.darker(root.foreground, 1.35) : Color.accent
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        elide: Text.ElideRight
                      }

                      Row {
                        id: reviewActions
                        anchors.verticalCenter: parent.verticalCenter
                        height: parent.height
                        spacing: Style.space(6)

                        Button {
                          visible: String(modelData.hiddenAt || "") !== ""
                          width: visible ? Style.space(94) : 0
                          height: parent.height
                          text: "Show on main"
                          foreground: root.foreground
                          accent: Color.accent
                          fontFamily: root.fontFamily
                          fontSize: Style.font.caption
                          bordered: true
                          onClicked: OmaDigest.OmaDigestStore.showAttentionWatch(String(modelData.id || ""))
                        }

                        Button {
                          width: confirmingCancel ? Style.space(106) : Style.space(70)
                          height: parent.height
                          text: confirmingCancel ? "Cancel review?" : "Cancel"
                          foreground: confirmingCancel ? Color.urgent : root.foreground
                          accent: Color.urgent
                          fontFamily: root.fontFamily
                          fontSize: Style.font.caption
                          bordered: true
                          onClicked: {
                            if (confirmingCancel) {
                              confirmingCancel = false
                              OmaDigest.OmaDigestStore.cancelAttentionWatch(String(modelData.id || ""))
                            } else confirmingCancel = true
                          }
                        }
                      }
                    }
                  }
                }
              }

              Rectangle {
                readonly property var calibration: OmaDigest.OmaDigestStore.attentionCalibration || ({})
                visible: Number(calibration.outcomeCount || 0) > 0
                width: parent.width
                height: visible ? calibrationContent.implicitHeight + Style.space(18) : 0
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)
                border.width: Style.spacing.hairline
                border.color: Style.normalBorderFor(root.foreground, Color.accent)

                Column {
                  id: calibrationContent
                  anchors.fill: parent
                  anchors.margins: Style.space(9)
                  spacing: Style.space(6)

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: "CALIBRATION · " + Number(parent.parent.calibration.outcomeCount || 0) + " OBSERVED OUTCOMES"
                    color: Color.accent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    font.letterSpacing: 0.8
                    elide: Text.ElideRight
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: Number(parent.parent.calibration.readCount || 0) + " read · "
                      + Number(parent.parent.calibration.handoffCount || 0) + " sent to agent · "
                      + Number(parent.parent.calibration.usefulCount || 0) + " useful · "
                      + Number(parent.parent.calibration.notUsefulCount || 0) + " not useful"
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                  }

                  Repeater {
                    model: (parent.parent.calibration.subjects || []).slice(0, 3)
                    Row {
                      required property var modelData
                      width: parent.width
                      height: Style.space(24)
                      spacing: Style.space(8)
                      Text {
                        textFormat: Text.PlainText
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - calibrationSignal.width - Style.space(8)
                        text: String(modelData.label || "Attention subject")
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        elide: Text.ElideRight
                      }
                      Text {
                        textFormat: Text.PlainText
                        id: calibrationSignal
                        anchors.verticalCenter: parent.verticalCenter
                        text: String(modelData.signal || "neutral") === "surface" ? "SURFACE"
                          : String(modelData.signal || "neutral") === "defer" ? "DEFER" : "LEARNING"
                        color: String(modelData.signal || "neutral") === "neutral"
                          ? Qt.darker(root.foreground, 1.35) : Color.accent
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.bold: true
                      }
                    }
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: "Open the full timeline  →"
                    color: Color.accent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    MouseArea {
                      anchors.fill: parent
                      anchors.margins: -Style.space(5)
                      cursorShape: Qt.PointingHandCursor
                      onClicked: root.openAttentionTimeline("", "All attention")
                    }
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "ADD A STANDING POLICY"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              QQC.TextArea {
                textFormat: TextEdit.PlainText
                id: attentionPolicyInput
                width: parent.width
                height: Style.space(82)
                placeholderText: "Interrupt me for production failures, but bundle dependency updates."
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: TextEdit.Wrap
                background: Rectangle {
                  radius: Style.cornerRadius
                  color: Style.normalFillFor(root.foreground, Color.accent)
                  border.width: Style.spacing.hairline
                  border.color: OmaDigest.OmaDigestStore.attentionPolicyState === "working"
                    ? Color.accent : Style.normalBorderFor(root.foreground, Color.accent)
                }
              }

              Button {
                width: parent.width
                height: Style.space(38)
                text: OmaDigest.OmaDigestStore.attentionPolicyState === "working" ? "Building policy…" : "Add policy"
                foreground: root.foreground
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                bordered: true
                enabled: attentionPolicyInput.text.trim() !== "" && OmaDigest.OmaDigestStore.attentionPolicyState !== "working"
                opacity: enabled ? 1 : 0.5
                onClicked: {
                  OmaDigest.OmaDigestStore.createAttentionPolicy(attentionPolicyInput.text)
                  attentionPolicyInput.text = ""
                }
              }

              Text {
                textFormat: Text.PlainText
                visible: OmaDigest.OmaDigestStore.attentionPolicyMessage !== ""
                width: parent.width
                text: OmaDigest.OmaDigestStore.attentionPolicyMessage
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                wrapMode: Text.WordWrap
              }

              Rectangle {
                readonly property var preview: OmaDigest.OmaDigestStore.attentionPolicyPreview
                visible: preview !== null
                width: parent.width
                height: visible ? policyPreviewContent.implicitHeight + Style.space(20) : 0
                radius: Style.cornerRadius
                color: Style.selectedFillFor(root.foreground, Color.accent)
                border.width: Style.spacing.hairline
                border.color: Color.accent

                Column {
                  id: policyPreviewContent
                  anchors.fill: parent
                  anchors.margins: Style.space(10)
                  spacing: Style.space(7)

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: "POLICY PREVIEW"
                    color: Color.accent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    font.letterSpacing: 1
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: parent.parent.preview ? String(parent.parent.preview.draft.name || "Standing policy") : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    elide: Text.ElideRight
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: parent.parent.preview
                      ? String(parent.parent.preview.draft.action || "hold").toUpperCase() + " · "
                        + String(parent.parent.preview.draft.description || "") : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: parent.parent.preview
                      ? "Matches " + Number(parent.parent.preview.matchedCount || 0) + " current attention item"
                        + (Number(parent.parent.preview.matchedCount || 0) === 1 ? "" : "s") : ""
                    color: Qt.darker(root.foreground, 1.3)
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                  }

                  Repeater {
                    model: parent.parent.preview ? (parent.parent.preview.examples || []).slice(0, 3) : []
                    Text {
                      textFormat: Text.PlainText
                      required property var modelData
                      width: parent.width
                      text: "• " + String(modelData.app || "Source") + " · " + String(modelData.title || "Attention item")
                      color: Qt.darker(root.foreground, 1.25)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }
                  }

                  Text {
                    textFormat: Text.PlainText
                    visible: parent.parent.preview && (parent.parent.preview.conflicts || []).length > 0
                    width: parent.width
                    text: "OVERLAPS"
                    color: Color.urgent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    font.letterSpacing: 0.8
                  }

                  Repeater {
                    model: parent.parent.preview ? (parent.parent.preview.conflicts || []).slice(0, 4) : []
                    Text {
                      textFormat: Text.PlainText
                      required property var modelData
                      width: parent.width
                      text: String(modelData.name || "Existing policy") + " · "
                        + (String(modelData.winner || "existing") === "draft"
                          ? "new policy wins by priority"
                          : String(modelData.action || "hold").toUpperCase() + " wins by priority")
                      color: Color.urgent
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }
                  }

                  Row {
                    width: parent.width
                    height: Style.space(40)
                    spacing: Style.space(8)
                    Button {
                      anchors.verticalCenter: parent.verticalCenter
                      width: (parent.width - parent.spacing) * 0.38
                      height: parent.height
                      text: "Discard"
                      foreground: root.foreground
                      accent: Color.accent
                      fontFamily: root.fontFamily
                      fontSize: Style.font.caption
                      bordered: true
                      onClicked: OmaDigest.OmaDigestStore.rejectAttentionPolicyPreview()
                    }
                    Button {
                      anchors.verticalCenter: parent.verticalCenter
                      width: parent.width - parent.spacing - (parent.width - parent.spacing) * 0.38
                      height: parent.height
                      text: "Add policy"
                      foreground: root.foreground
                      accent: Color.accent
                      fontFamily: root.fontFamily
                      fontSize: Style.font.caption
                      selected: true
                      onClicked: OmaDigest.OmaDigestStore.acceptAttentionPolicyPreview()
                    }
                  }
                }
              }

              Repeater {
                model: OmaDigest.OmaDigestStore.attentionPolicies || []
                Rectangle {
                  required property var modelData
                  property bool confirmingDelete: false
                  width: parent.width
                  height: policyContent.implicitHeight + Style.space(18)
                  radius: Style.cornerRadius
                  color: Style.normalFillFor(root.foreground, Color.accent)
                  opacity: modelData.enabled === true ? 1 : 0.58

                  Column {
                    id: policyContent
                    anchors.fill: parent
                    anchors.margins: Style.space(9)
                    spacing: Style.space(6)
                    Row {
                      width: parent.width
                      height: Style.space(30)
                      spacing: Style.space(8)
                      Text {
                        textFormat: Text.PlainText
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - policyToggle.width - policyDelete.width - parent.spacing * 2
                        text: String(modelData.name || "Standing policy")
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                        elide: Text.ElideRight
                      }
                      Button {
                        id: policyToggle
                        anchors.verticalCenter: parent.verticalCenter
                        width: Style.space(62)
                        height: parent.height
                        text: modelData.enabled === true ? "On" : "Off"
                        selected: modelData.enabled === true
                        foreground: root.foreground
                        accent: Color.accent
                        fontFamily: root.fontFamily
                        fontSize: Style.font.caption
                        onClicked: OmaDigest.OmaDigestStore.setAttentionPolicyEnabled(String(modelData.id || ""), modelData.enabled !== true)
                      }
                      OmaDigest.InlineDeleteControl {
                        id: policyDelete
                        anchors.verticalCenter: parent.verticalCenter
                        confirming: confirmingDelete
                        foreground: root.foreground
                        accent: Color.urgent
                        fontFamily: root.fontFamily
                        onConfirmationRequested: confirmingDelete = true
                        onCancelled: confirmingDelete = false
                        onConfirmed: {
                          confirmingDelete = false
                          OmaDigest.OmaDigestStore.deleteAttentionPolicy(String(modelData.id || ""))
                        }
                      }
                    }
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: String(modelData.action || "hold").toUpperCase() + " · " + String(modelData.description || "")
                      color: Qt.darker(root.foreground, 1.3)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      wrapMode: Text.WordWrap
                    }
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                topPadding: Style.space(4)
                text: "SEARCH ATTENTION HISTORY"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Row {
                width: parent.width
                height: Style.space(38)
                spacing: Style.space(8)
                QQC.TextField {
                  id: attentionMemorySearch
                  anchors.verticalCenter: parent.verticalCenter
                  width: parent.width - searchMemoryButton.width - parent.spacing
                  height: parent.height
                  placeholderText: "PR #184, meeting, project…"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  onAccepted: OmaDigest.OmaDigestStore.searchAttentionMemory(text)
                }
                Button {
                  id: searchMemoryButton
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(86)
                  height: parent.height
                  text: "Search"
                  foreground: root.foreground
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  fontSize: Style.font.caption
                  bordered: true
                  enabled: attentionMemorySearch.text.trim() !== ""
                  onClicked: OmaDigest.OmaDigestStore.searchAttentionMemory(attentionMemorySearch.text)
                }
              }

              Repeater {
                model: OmaDigest.OmaDigestStore.attentionMemoryResults || []
                Rectangle {
                  required property var modelData
                  width: parent.width
                  height: memoryResult.implicitHeight + Style.space(16)
                  radius: Style.cornerRadius
                  color: Style.normalFillFor(root.foreground, Color.accent)
                  Column {
                    id: memoryResult
                    anchors.fill: parent
                    anchors.margins: Style.space(8)
                    spacing: Style.space(3)
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: String(modelData.subject || "Remembered attention")
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.bold: true
                      elide: Text.ElideRight
                    }
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: String(modelData.summary || "")
                      color: Qt.darker(root.foreground, 1.3)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      wrapMode: Text.WordWrap
                    }
                  }
                }
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "privacy"
              spacing: Style.space(12)

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "PRIVACY"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }
              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "Choose what OmaDigest keeps from native notifications."
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              Rectangle {
                width: parent.width
                height: defaultPrivacyContent.implicitHeight + Style.space(20)
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)
                Column {
                  id: defaultPrivacyContent
                  anchors.fill: parent
                  anchors.margins: Style.space(10)
                  spacing: Style.space(7)
                  Text {
                    textFormat: Text.PlainText
                    text: "DEFAULT"
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                  }
                  Dropdown {
                    width: parent.width
                    showLabel: false
                    options: root.privacyOptions
                    value: String(OmaDigest.OmaDigestStore.privacy.defaultMode || "count-only")
                    foreground: root.foreground
                    background: Color.background
                    onChanged: function(value) { OmaDigest.OmaDigestStore.setPrivacyDefault(value) }
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                text: "APP RULES"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Repeater {
                model: OmaDigest.OmaDigestStore.privacy.rules || []
                Rectangle {
                  required property var modelData
                  property bool confirmingDelete: false
                  width: parent.width
                  height: Style.space(48)
                  radius: Style.cornerRadius
                  color: confirmingDelete
                    ? Util.alpha(Color.urgent, 0.09)
                    : Style.normalFillFor(root.foreground, Color.accent)
                  border.width: confirmingDelete ? Style.spacing.hairline : 0
                  border.color: Util.alpha(Color.urgent, 0.52)

                  Row {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.margins: Style.space(9)
                    spacing: Style.space(10)
                    Text {
                      textFormat: Text.PlainText
                      anchors.verticalCenter: parent.verticalCenter
                      width: parent.width - privacyRulePicker.width - privacyRuleDelete.width - parent.spacing * 2
                      text: String(modelData.app)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.bold: true
                      elide: Text.ElideRight
                    }
                    Dropdown {
                      id: privacyRulePicker
                      anchors.verticalCenter: parent.verticalCenter
                      width: Style.space(170)
                      showLabel: false
                      options: root.privacyOptions
                      value: String(modelData.mode)
                      foreground: root.foreground
                      background: Color.background
                      onChanged: function(value) { OmaDigest.OmaDigestStore.setPrivacyRule(modelData.app, value) }
                    }
                    OmaDigest.InlineDeleteControl {
                      id: privacyRuleDelete
                      visible: String(modelData.source || "") === "user"
                      anchors.verticalCenter: parent.verticalCenter
                      width: visible ? implicitWidth : 0
                      confirming: confirmingDelete
                      foreground: root.foreground
                      accent: Color.urgent
                      fontFamily: root.fontFamily
                      onConfirmationRequested: confirmingDelete = true
                      onCancelled: confirmingDelete = false
                      onConfirmed: {
                        confirmingDelete = false
                        OmaDigest.OmaDigestStore.deletePrivacyRule(String(modelData.app || ""))
                      }
                    }
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                text: "ADD APP RULE"
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }
              QQC.TextField {
                id: privacyAppInput
                width: parent.width
                placeholderText: "App name"
                color: root.foreground
                font.family: root.fontFamily
              }
              Row {
                width: parent.width
                spacing: Style.space(10)
                Dropdown {
                  id: newPrivacyMode
                  anchors.verticalCenter: parent.verticalCenter
                  width: parent.width - savePrivacyRule.width - parent.spacing
                  showLabel: false
                  options: root.privacyOptions
                  value: root.privacyRuleMode
                  foreground: root.foreground
                  background: Color.background
                  onChanged: function(value) { root.privacyRuleMode = String(value) }
                }
                Rectangle {
                  id: savePrivacyRule
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(120)
                  height: Style.space(36)
                  radius: Style.cornerRadius
                  color: Color.accent
                  opacity: privacyAppInput.text.trim() ? 1 : 0.5
                  Text {
                    textFormat: Text.PlainText
                    anchors.centerIn: parent
                    text: "Save rule"
                    color: Color.background
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.bold: true
                  }
                  MouseArea {
                    anchors.fill: parent
                    enabled: privacyAppInput.text.trim() !== ""
                    cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onClicked: {
                      OmaDigest.OmaDigestStore.setPrivacyRule(privacyAppInput.text, newPrivacyMode.value)
                      privacyAppInput.text = ""
                    }
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "Count only erases content. Digest may send it to your model. Digest + agent also allows explicit handoff."
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                wrapMode: Text.WordWrap
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "data"
              spacing: Style.space(12)

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "DELETE OMADIGEST DATA"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "These controls affect only data retained by OmaDigest. Omarchy's own notification history is never deleted."
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              Repeater {
                model: [
                  { id: "digest-history", title: "Delete digest history", description: "Remove all saved read and unread digests." },
                  { id: "notification-history", title: "Delete notification history", description: "Remove notification evidence retained by OmaDigest and prevent older Omarchy notifications from being re-imported." },
                  { id: "research", title: "Delete research watches", description: "Remove scheduled questions and their retained claim history. Saved digest briefs remain until separately deleted." },
                  { id: "integrations", title: "Delete integrations", description: "Remove custom integrations and reset all integration setup, enablement, and known secrets." },
                  { id: "templates", title: "Delete templates", description: "Remove custom templates and restore packaged defaults." }
                ]

                Rectangle {
                  required property var modelData
                  width: parent.width
                  height: Math.max(dataDeleteCopy.implicitHeight + Style.space(20), Style.space(60))
                  radius: Style.cornerRadius
                  color: Style.normalFillFor(root.foreground, Color.accent)

                  Row {
                    anchors.fill: parent
                    anchors.margins: Style.space(10)
                    spacing: Style.space(10)

                    Column {
                      id: dataDeleteCopy
                      anchors.verticalCenter: parent.verticalCenter
                      width: parent.width - dataDeleteButton.width - Style.space(10)
                      spacing: Style.space(2)
                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        text: String(modelData.title)
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                      }
                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        text: String(modelData.description)
                        color: Qt.darker(root.foreground, 1.4)
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        wrapMode: Text.WordWrap
                      }
                    }

                    Button {
                      id: dataDeleteButton
                      anchors.verticalCenter: parent.verticalCenter
                      width: Style.space(84)
                      height: Style.space(40)
                      text: "Delete"
                      bordered: true
                      focusable: true
                      foreground: Color.urgent
                      fontFamily: root.fontFamily
                      fontSize: Style.font.caption
                      enabled: OmaDigest.OmaDigestStore.dataDeleteState !== "working"
                      onClicked: root.requestDataDeletion(String(modelData.id))
                    }
                  }
                }
              }

              Rectangle {
                width: parent.width
                height: deleteAllRow.implicitHeight + Style.space(24)
                radius: Style.cornerRadius
                color: Util.alpha(Color.urgent, 0.09)
                border.width: Style.spacing.hairline
                border.color: Util.alpha(Color.urgent, 0.52)

                Row {
                  id: deleteAllRow
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.margins: Style.space(12)
                  spacing: Style.space(10)

                  Column {
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - deleteAllButton.width - Style.space(10)
                    spacing: Style.space(2)
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: "Delete all"
                      color: Color.urgent
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.bold: true
                    }
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: "Delete every category above. Model connections and the privacy policy remain."
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      wrapMode: Text.WordWrap
                    }
                  }

                  Button {
                    id: deleteAllButton
                    anchors.verticalCenter: parent.verticalCenter
                    width: Style.space(96)
                    height: Style.space(40)
                    text: "Delete all"
                    bordered: true
                    focusable: true
                    foreground: Color.urgent
                    fontFamily: root.fontFamily
                    fontSize: Style.font.caption
                    enabled: OmaDigest.OmaDigestStore.dataDeleteState !== "working"
                    onClicked: root.requestDataDeletion("all")
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                visible: OmaDigest.OmaDigestStore.dataDeleteMessage !== ""
                width: parent.width
                text: OmaDigest.OmaDigestStore.dataDeleteMessage
                color: OmaDigest.OmaDigestStore.dataDeleteState === "error" ? Color.urgent : Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                wrapMode: Text.WordWrap
              }
            }

            Column {
              width: parent.width
              visible: root.settingsPage === "connections"
              spacing: Style.space(10)

              Rectangle {
                visible: root.connectionView === "overview"
                width: parent.width
                height: visible ? connectContent.implicitHeight + Style.space(24) : 0
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)
                border.width: Style.spacing.hairline
                border.color: OmaDigest.OmaDigestStore.agentConnection.connected
                  ? Color.accent : Style.normalBorderFor(root.foreground, Color.accent)

                Column {
                  id: connectContent
                  anchors.fill: parent
                  anchors.margins: Style.space(12)
                  spacing: Style.space(9)

                  Row {
                    width: parent.width
                    spacing: Style.space(8)
                    Column {
                      width: parent.width - connectionState.width - Style.space(10)
                      spacing: Style.space(2)
                      Text {
                        textFormat: Text.PlainText
                        text: "CONNECT OMADIGEST"
                        color: Color.accent
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.bold: true
                        font.letterSpacing: 1
                      }
                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        text: "Choose the account OmaDigest should use to build and draft briefings."
                        color: Qt.darker(root.foreground, 1.35)
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        wrapMode: Text.WordWrap
                      }
                    }
                    Text {
                      textFormat: Text.PlainText
                      id: connectionState
                      text: OmaDigest.OmaDigestStore.agentConnection.connected ? "● Connected" : "Not connected"
                      color: OmaDigest.OmaDigestStore.agentConnection.connected ? Color.accent : Qt.darker(root.foreground, 1.35)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                    }
                  }

                  Dropdown {
                    id: authMethodPicker
                    width: parent.width
                    showLabel: false
                    options: root.authOptions
                    value: root.selectedAuthMethod || (options.length > 0 ? String(options[0].value) : "")
                    enabled: options.length > 0 && ["starting", "browser", "device_code", "prompt", "info"].indexOf(OmaDigest.OmaDigestStore.auth.phase) < 0
                    foreground: root.foreground
                    background: Color.background
                    onChanged: function(value) { root.selectedAuthMethod = String(value) }
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: {
                      var selected = root.authOptions.find(function(option) { return option.value === authMethodPicker.value })
                      return selected ? String(selected.description || "") : "No supported providers are available."
                    }
                    color: Qt.darker(root.foreground, 1.4)
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    wrapMode: Text.WordWrap
                  }

                  Rectangle {
                    width: Style.space(150)
                    height: Style.space(36)
                    radius: Style.cornerRadius
                    color: Color.accent
                    opacity: authMethodPicker.value !== "" && authMethodPicker.enabled ? 1 : 0.5
                    Text {
                      textFormat: Text.PlainText
                      anchors.centerIn: parent
                      text: OmaDigest.OmaDigestStore.agentConnection.connected ? "Connect another" : "Connect"
                      color: Color.background
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.bold: true
                    }
                    MouseArea {
                      anchors.fill: parent
                      enabled: authMethodPicker.value !== "" && authMethodPicker.enabled
                      cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                      onClicked: {
                        root.authPromptValue = ""
                        OmaDigest.OmaDigestStore.beginAuth(authMethodPicker.value)
                      }
                    }
                  }

                  Text {
                    textFormat: Text.PlainText
                    visible: OmaDigest.OmaDigestStore.agentConnection.connected
                    width: parent.width
                    text: visible ? OmaDigest.OmaDigestStore.agentConnection.provider + " · "
                      + OmaDigest.OmaDigestStore.agentConnection.model : ""
                    color: Qt.darker(root.foreground, 1.35)
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                  }
                }
              }

              Rectangle {
                visible: root.connectionView === "overview" && OmaDigest.OmaDigestStore.auth.phase !== "idle"
                width: parent.width
                height: visible ? authFlowContent.implicitHeight + Style.space(20) : 0
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground,
                  OmaDigest.OmaDigestStore.auth.phase === "error" ? Color.urgent : Color.accent)
                border.width: Style.spacing.hairline
                border.color: OmaDigest.OmaDigestStore.auth.phase === "error" ? Color.urgent : Color.accent

                Column {
                  id: authFlowContent
                  anchors.fill: parent
                  anchors.margins: Style.space(10)
                  spacing: Style.space(8)

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: OmaDigest.OmaDigestStore.auth.phase === "complete" ? "Connected"
                      : OmaDigest.OmaDigestStore.auth.phase === "error" ? "Sign-in failed" : "Sign-in in progress"
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    wrapMode: Text.WordWrap
                  }
                  Text {
                    textFormat: Text.PlainText
                    visible: text !== ""
                    width: parent.width
                    text: String(OmaDigest.OmaDigestStore.auth.message || "")
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                  }
                  Text {
                    textFormat: Text.PlainText
                    visible: OmaDigest.OmaDigestStore.auth.userCode !== ""
                    text: visible ? "Code: " + OmaDigest.OmaDigestStore.auth.userCode : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.subtitle
                    font.bold: true
                  }

                  Rectangle {
                    visible: OmaDigest.OmaDigestStore.auth.url !== "" || OmaDigest.OmaDigestStore.auth.verificationUri !== ""
                    width: Style.space(190)
                    height: visible ? Style.space(34) : 0
                    radius: Style.cornerRadius
                    color: Color.accent
                    Text {
                      textFormat: Text.PlainText
                      anchors.centerIn: parent
                      text: "Open sign-in page"
                      color: Color.background
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.bold: true
                    }
                    MouseArea {
                      anchors.fill: parent
                      cursorShape: Qt.PointingHandCursor
                      onClicked: OmaDigest.OmaDigestStore.openAuthUrl()
                    }
                  }

                  Repeater {
                    model: OmaDigest.OmaDigestStore.auth.prompt
                      && OmaDigest.OmaDigestStore.auth.prompt.kind === "select"
                      ? (OmaDigest.OmaDigestStore.auth.prompt.options || []) : []
                    Rectangle {
                      required property var modelData
                      width: parent.width
                      height: Style.space(34)
                      radius: Style.cornerRadius
                      color: root.authPromptValue === modelData.id
                        ? Style.selectedFillFor(root.foreground, Color.accent)
                        : Style.normalFillFor(root.foreground, Color.accent)
                      Text {
                        textFormat: Text.PlainText
                        anchors.centerIn: parent
                        text: String(modelData.label)
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                      }
                      MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.authPromptValue = String(modelData.id)
                      }
                    }
                  }

                  QQC.TextField {
                    id: authPromptInput
                    visible: OmaDigest.OmaDigestStore.auth.prompt
                      && OmaDigest.OmaDigestStore.auth.prompt.kind !== "select"
                    width: parent.width
                    placeholderText: visible ? String(OmaDigest.OmaDigestStore.auth.prompt.placeholder
                      || OmaDigest.OmaDigestStore.auth.prompt.message || "") : ""
                    echoMode: visible && OmaDigest.OmaDigestStore.auth.prompt.kind === "secret"
                      ? TextInput.Password : TextInput.Normal
                    color: root.foreground
                    font.family: root.fontFamily
                    onVisibleChanged: if (visible) text = ""
                  }

                  Row {
                    visible: OmaDigest.OmaDigestStore.auth.prompt !== null
                      || ["starting", "browser", "device_code", "info"].indexOf(OmaDigest.OmaDigestStore.auth.phase) >= 0
                    height: visible ? Style.space(34) : 0
                    spacing: Style.space(8)

                    Rectangle {
                      visible: OmaDigest.OmaDigestStore.auth.prompt !== null
                      width: Style.space(120)
                      height: parent.height
                      radius: Style.cornerRadius
                      color: Color.accent
                      Text {
                        textFormat: Text.PlainText
                        anchors.centerIn: parent
                        text: "Continue"
                        color: Color.background
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                      }
                      MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: OmaDigest.OmaDigestStore.respondAuth(
                          OmaDigest.OmaDigestStore.auth.prompt.kind === "select" ? root.authPromptValue : authPromptInput.text)
                      }
                    }
                    Rectangle {
                      width: Style.space(100)
                      height: parent.height
                      radius: Style.cornerRadius
                      color: Style.normalFillFor(root.foreground, Color.accent)
                      Text {
                        textFormat: Text.PlainText
                        anchors.centerIn: parent
                        text: "Cancel"
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                      }
                      MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: OmaDigest.OmaDigestStore.cancelAuth()
                      }
                    }
                  }
                }
              }

              Rectangle {
                visible: root.connectionView === "overview"
                width: parent.width
                height: visible ? voiceConnection.implicitHeight + Style.space(24) : 0
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.foreground, Color.accent)

                Column {
                  id: voiceConnection
                  anchors.fill: parent
                  anchors.margins: Style.space(12)
                  spacing: Style.space(10)

                  Text {
                    textFormat: Text.PlainText
                    text: "VOICE"
                    color: Color.accent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    font.letterSpacing: 1
                  }

                  Row {
                    width: parent.width
                    height: Math.max(voiceInputCopy.implicitHeight, voiceInputPicker.implicitHeight)
                    spacing: Style.space(10)
                    Column {
                      id: voiceInputCopy
                      anchors.verticalCenter: parent.verticalCenter
                      width: parent.width - voiceInputPicker.width - Style.space(10)
                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        text: "Voice input"
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                      }
                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        text: "Used by the microphone control while drafting."
                        color: Qt.darker(root.foreground, 1.4)
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        wrapMode: Text.WordWrap
                      }
                    }
                    Dropdown {
                      id: voiceInputPicker
                      anchors.verticalCenter: parent.verticalCenter
                      width: Style.space(150)
                      showLabel: false
                      options: [{ value: "voxtype", label: OmaDigest.OmaDigestStore.dictationAvailable ? "Voxtype" : "Unavailable" }]
                      value: "voxtype"
                      enabled: false
                      foreground: root.foreground
                      background: Color.background
                    }
                  }

                  Row {
                    width: parent.width
                    height: Math.max(readModeCopy.implicitHeight, Style.space(36))
                    spacing: Style.space(8)
                    Column {
                      id: readModeCopy
                      anchors.verticalCenter: parent.verticalCenter
                      width: parent.width - readModePicker.width - configureReadMode.width - Style.space(16)
                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        text: "Read aloud"
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                      }
                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        text: OmaDigest.OmaDigestStore.tts.configured ? "Ready" : "Not configured"
                        color: Qt.darker(root.foreground, 1.4)
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                      }
                    }
                    Dropdown {
                      id: readModePicker
                      anchors.verticalCenter: parent.verticalCenter
                      width: Style.space(150)
                      height: Style.space(36)
                      showLabel: false
                      options: [
                        { value: "openai-compatible", label: "OpenAI-compatible" },
                        { value: "elevenlabs", label: "ElevenLabs" }
                      ]
                      value: root.ttsProvider
                      foreground: root.foreground
                      background: Color.background
                      onChanged: function(value) { root.ttsProvider = String(value) }
                    }
                    Rectangle {
                      id: configureReadMode
                      anchors.verticalCenter: parent.verticalCenter
                      width: Style.space(88)
                      height: Style.space(36)
                      radius: Style.cornerRadius
                      color: Style.normalFillFor(root.foreground, Color.accent)
                      Text {
                        textFormat: Text.PlainText
                        anchors.centerIn: parent
                        text: "Configure"
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                      }
                      MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.connectionView = "read-mode"
                      }
                    }
                  }
                }
              }

              Text {
                textFormat: Text.PlainText
                visible: root.connectionView === "read-mode"
                text: "‹ Connections"
                color: Color.accent
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                MouseArea {
                  anchors.fill: parent
                  anchors.margins: -Style.space(6)
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.connectionView = "overview"
                }
              }
              Text {
                textFormat: Text.PlainText
                visible: root.connectionView === "read-mode"
                width: parent.width
                text: "Configure read aloud"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.display
                font.bold: true
              }
              Text {
                textFormat: Text.PlainText
                visible: root.connectionView === "read-mode"
                width: parent.width
                text: root.ttsProvider === "elevenlabs"
                  ? "Connect ElevenLabs for digest playback."
                  : "Connect an endpoint that implements the OpenAI speech API."
                color: Qt.darker(root.foreground, 1.35)
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              QQC.TextField {
                id: ttsEndpoint
                visible: root.connectionView === "read-mode"
                width: parent.width
                placeholderText: root.ttsProvider === "elevenlabs" ? "https://api.elevenlabs.io" : "https://api.openai.com/v1"
                color: root.foreground
                font.family: root.fontFamily
              }
              QQC.TextField {
                id: ttsModel
                visible: root.connectionView === "read-mode"
                width: parent.width
                placeholderText: root.ttsProvider === "elevenlabs" ? "eleven_multilingual_v2" : "gpt-4o-mini-tts"
                color: root.foreground
                font.family: root.fontFamily
              }
              QQC.TextField {
                id: ttsVoice
                visible: root.connectionView === "read-mode"
                width: parent.width
                placeholderText: root.ttsProvider === "elevenlabs" ? "Voice ID" : "alloy"
                color: root.foreground
                font.family: root.fontFamily
              }
              QQC.TextField {
                id: ttsApiKey
                visible: root.connectionView === "read-mode"
                width: parent.width
                placeholderText: "API key"
                echoMode: TextInput.Password
                color: root.foreground
                font.family: root.fontFamily
              }

              Rectangle {
                visible: root.connectionView === "read-mode"
                width: Style.space(150)
                height: visible ? Style.space(36) : 0
                radius: Style.cornerRadius
                color: Color.accent
                opacity: ttsEndpoint.text.trim() && ttsModel.text.trim() && ttsVoice.text.trim() && ttsApiKey.text.trim() ? 1 : 0.5
                Text {
                  textFormat: Text.PlainText
                  anchors.centerIn: parent
                  text: "Save read mode"
                  color: Color.background
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: true
                }
                MouseArea {
                  anchors.fill: parent
                  enabled: ttsEndpoint.text.trim() && ttsModel.text.trim() && ttsVoice.text.trim() && ttsApiKey.text.trim()
                  cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                  onClicked: {
                    OmaDigest.OmaDigestStore.configureTts(root.ttsProvider, ttsEndpoint.text, ttsModel.text, ttsVoice.text, 1, ttsApiKey.text)
                    ttsApiKey.text = ""
                  }
                }
              }
            }
          }
        }
      }

      ConfirmDialog {
        id: dataDeleteConfirm
        anchors.fill: parent
        z: 100
        opened: false
        confirmText: "Delete"
        cancelText: "Cancel"
        background: Color.background
        foreground: root.foreground
        fontFamily: root.fontFamily
        onCanceled: root.cancelDataDeletion()
        onConfirmed: root.confirmDataDeletion()
      }
    }
  }
}

pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

Scope {
  id: root

  readonly property int protocolVersion: 1
  readonly property string brokerPath: {
    var url = String(Qt.resolvedUrl("../runtime/dist/omadigest-broker.mjs"))
    if (url.indexOf("file://") === 0) {
      try { return decodeURIComponent(url.slice(7)) }
      catch (error) { return url.slice(7) }
    }
    return url
  }

  property bool ready: false
  property string state: "starting"
  property string status: "Starting OmaDigest…"
  property var templates: []
  property var templateSuggestions: []
  property var integrations: []
  property var integrationStatus: ({})
  property var privacy: ({ defaultMode: "count-only", rules: [] })
  property var integrationSetup: ({})
  property var selection: null
  property var draft: null
  property string draftId: ""
  property string draftKind: "template"
  property string draftState: "idle"
  property var draftProgress: []
  property var draftPlan: []
  property int draftPlanStep: 0
  property string draftPlanStatus: "idle"
  property string authoringState: "idle"
  property string authoringMessage: ""
  property string authoringSkillState: "idle"
  property string authoringSkillMessage: ""
  property string templateEditState: "idle"
  property string templateEditMessage: ""
  property var digest: null
  property var digestHistory: []
  property string digestState: "idle"
  property int attentionCount: 0
  property var acknowledgedAttention: ({})
  property var agentConnection: ({ connected: false, provider: "", model: "" })
  property var authMethods: []
  property var auth: ({ phase: "idle", flowId: "", methodId: "", message: "", url: "", verificationUri: "", userCode: "", prompt: null })
  property bool dictationAvailable: false
  property string dictationState: "idle"
  property string transcript: ""
  property var tts: ({ configured: false, state: "idle", config: null })
  property string errorCode: ""
  property string errorMessage: ""
  property string dataDeleteState: "idle"
  property string dataDeleteTarget: ""
  property string dataDeleteMessage: ""
  property int dataDeleteRevision: 0
  property int nextId: 1

  function clearError() {
    errorCode = ""
    errorMessage = ""
  }

  function send(command) {
    if (!broker.running) return
    broker.write(JSON.stringify(command) + "\n")
  }

  function startDraft(kind, request) {
    var text = String(request || "").trim()
    clearError()
    if (!text) return
    draftKind = kind === "integration" ? "integration" : "template"
    draftState = "working"
    draftProgress = []
    draftPlan = []
    draftPlanStep = 0
    draftPlanStatus = "working"
    draft = null
    send({ type: "draft_start", id: "draft-" + nextId++, kind: draftKind, request: text })
  }

  function startTemplateRevision(templateId, request) {
    var text = String(request || "").trim()
    var target = String(templateId || "").trim()
    clearError()
    if (!text || !target) return
    draftKind = "template"
    draftState = "working"
    draftProgress = []
    draftPlan = []
    draftPlanStep = 0
    draftPlanStatus = "working"
    draft = null
    send({ type: "template_revise", id: "draft-" + nextId++, templateId: target, request: text.slice(0, 5000) })
  }

  function startIntegrationAuthoring(request) {
    var text = String(request || "").trim()
    clearError()
    if (!text || authoringState === "launching") return
    authoringState = "launching"
    authoringMessage = "Opening your default coding agent…"
    send({ type: "authoring_handoff", id: "authoring-" + nextId++, kind: "integration", request: text })
  }

  function installAuthoringSkill() {
    clearError()
    authoringSkillState = "installing"
    authoringSkillMessage = "Installing for supported default agents…"
    send({ type: "authoring_skill_install", id: "authoring-skill-" + nextId++ })
  }

  function acceptDraft() {
    if (!draftId) return
    send({ type: "draft_accept", id: "accept-" + nextId++, draftId: draftId })
  }

  function rejectDraft() {
    if (!draftId) return
    send({ type: "draft_reject", id: "reject-" + nextId++, draftId: draftId })
    draft = null
    draftId = ""
    draftState = "idle"
  }

  function updateTemplate(templateId, instructions, compiledJson) {
    clearError()
    templateEditState = "saving"
    templateEditMessage = "Validating template…"
    send({
      type: "template_update", id: "template-edit-" + nextId++, templateId: String(templateId),
      instructions: String(instructions || ""), compiledJson: String(compiledJson || "")
    })
  }

  function handoffDefaultAgent(prompt) {
    send({ type: "handoff_default_agent", id: "handoff-" + nextId++, prompt: String(prompt || "") })
  }

  function handoffHerdr(kind, request, currentDraft) {
    send({
      type: "handoff_herdr", id: "handoff-" + nextId++, kind: String(kind),
      request: String(request || ""), draftJson: JSON.stringify(currentDraft || null).slice(0, 120000)
    })
  }

  function handoffDigestEntry(digestId, sectionIndex, entryIndex) {
    clearError()
    send({
      type: "digest_handoff", id: "handoff-" + nextId++, digestId: String(digestId),
      sectionIndex: Number(sectionIndex), entryIndex: Number(entryIndex)
    })
  }

  function requestAgentStatus() { send({ type: "agent_status", id: "agent-" + nextId++ }) }
  function setPrivacyDefault(mode) {
    send({ type: "privacy_set_default", id: "privacy-" + nextId++, mode: String(mode) })
  }
  function setPrivacyRule(app, mode) {
    send({ type: "privacy_set_rule", id: "privacy-" + nextId++, app: String(app || "").trim(), mode: String(mode) })
  }
  function beginAuth(methodId) {
    clearError()
    send({ type: "auth_begin", id: "auth-" + nextId++, methodId: String(methodId) })
  }
  function respondAuth(value) {
    if (!auth.flowId || !auth.prompt) return
    send({ type: "auth_response", id: "auth-" + nextId++, flowId: auth.flowId, promptId: auth.prompt.id, value: String(value || "") })
  }
  function cancelAuth() {
    if (!auth.flowId) return
    send({ type: "auth_cancel", id: "auth-" + nextId++, flowId: auth.flowId })
  }
  function openAuthUrl() {
    var url = String(auth.url || auth.verificationUri || "")
    if (url) send({ type: "auth_open_url", id: "auth-" + nextId++, url: url })
  }

  function requestDictationStatus() {
    send({ type: "dictation_status", id: "dictation-" + nextId++ })
  }

  function toggleDictation() {
    var type = dictationState === "recording" ? "dictation_stop" : "dictation_start"
    if (type === "dictation_start") transcript = ""
    send({ type: type, id: "dictation-" + nextId++ })
  }

  function cancelDictation() {
    send({ type: "dictation_cancel", id: "dictation-" + nextId++ })
  }

  function ingest(items) {
    send({ type: "attention_ingest", id: "attention-" + nextId++, items: items || [] })
  }

  function acknowledgeAttention(items) {
    var ids = (items || []).map(function(item) { return String(item.id || "") }).filter(function(id) { return id !== "" })
    if (ids.length) send({ type: "attention_acknowledge", id: "attention-" + nextId++, itemIds: ids.slice(0, 200) })
  }

  function requestDigestHistory() { send({ type: "digest_history", id: "history-" + nextId++ }) }
  function markDigestRead(digestId) { send({ type: "digest_mark_read", id: "history-" + nextId++, digestId: String(digestId) }) }
  function deleteDigest(digestId) { send({ type: "digest_delete", id: "history-" + nextId++, digestId: String(digestId) }) }
  function clearDigests() { send({ type: "digest_clear", id: "history-" + nextId++ }) }
  function dismissTemplateSuggestion(suggestionId) {
    send({ type: "template_suggestion_dismiss", id: "suggestion-" + nextId++, suggestionId: String(suggestionId) })
  }
  function deleteData(target) {
    clearError()
    dataDeleteState = "working"
    dataDeleteTarget = String(target)
    dataDeleteMessage = "Deleting OmaDigest data…"
    send({ type: "data_delete", id: "data-delete-" + nextId++, target: dataDeleteTarget })
  }

  function openDigestFromHistory(saved) {
    if (!saved) return
    digest = saved
    digestState = "ready"
  }

  function generateDigest(context, templateId) {
    clearError()
    digestState = "working"
    digest = null
    var command = { type: "digest_generate", id: "digest-" + nextId++, context: context }
    if (templateId) command.templateId = String(templateId)
    send(command)
  }

  function configureTts(provider, endpoint, model, voice, speed, apiKey) {
    clearError()
    send({
      type: "tts_configure",
      id: "tts-" + nextId++,
      config: {
        provider: String(provider), endpoint: String(endpoint), model: String(model),
        voice: String(voice), speed: Number(speed) || 1
      },
      apiKey: String(apiKey)
    })
  }

  function readDigest() {
    if (!digest) return
    var text = String(digest.title || "")
    var sections = digest.sections || []
    for (var i = 0; i < sections.length; i++) {
      text += ". " + String(sections[i].title || "")
      var entries = sections[i].entries || []
      for (var j = 0; j < entries.length; j++)
        text += ". " + String(entries[j].headline || "") + ". " + String(entries[j].explanation || "")
    }
    send({ type: "tts_speak", id: "tts-" + nextId++, text: text })
  }

  function pauseReadMode() { send({ type: "tts_pause", id: "tts-" + nextId++ }) }
  function stopReadMode() { send({ type: "tts_stop", id: "tts-" + nextId++ }) }
  function requestTtsStatus() { send({ type: "tts_status", id: "tts-" + nextId++ }) }

  function setupIntegration(integrationId, values) {
    send({
      type: "integration_setup",
      id: "setup-" + nextId++,
      integrationId: String(integrationId),
      values: values || {}
    })
  }

  function checkIntegrationStatus(integrationId) {
    var target = String(integrationId || "")
    if (!target) return
    var next = Object.assign({}, integrationStatus)
    next[target] = { checking: true, ready: false, message: "Checking…" }
    integrationStatus = next
    send({ type: "integration_status", id: "integration-status-" + nextId++, integrationId: target })
  }

  function setIntegrationEnabled(integrationId, enabled) {
    var id = "integration-" + nextId++
    send({
      type: "integration_set_enabled",
      id: id,
      integrationId: String(integrationId),
      enabled: enabled === true
    })
  }

  function setIntegrationCategoryEnabled(integrationId, categoryId, enabled) {
    var target = String(integrationId || "")
    var category = String(categoryId || "")
    if (!target || !category) return
    send({
      type: "integration_set_category_enabled",
      id: "integration-category-" + nextId++,
      integrationId: target,
      categoryId: category,
      enabled: enabled === true
    })
  }

  function selectTemplate(trigger, itemCount, focusMinutes, appCounts, connectors) {
    var id = "route-" + nextId++
    state = "routing"
    status = "Selecting a digest template…"
    send({
      type: "select_template",
      id: id,
      context: {
        trigger: trigger,
        itemCount: Math.max(0, Number(itemCount) || 0),
        focusMinutes: Math.max(0, Number(focusMinutes) || 0),
        appCounts: appCounts || {},
        availableConnectors: connectors || ["notifications"],
        now: new Date().toISOString()
      }
    })
  }

  function applyEvent(event) {
    if (event.type === "ready") {
      ready = true
      state = "ready"
      status = "Ready to build a briefing"
      templates = event.templates || []
      templateSuggestions = event.templateSuggestions || []
      integrations = event.integrations || []
      privacy = event.privacy || ({ defaultMode: "count-only", rules: [] })
      authMethods = event.authMethods || []
      root.requestAgentStatus()
      root.requestDictationStatus()
      root.requestTtsStatus()
      root.requestDigestHistory()
      return
    }
    if (event.type === "templates") {
      templates = event.templates || []
      return
    }
    if (event.type === "template_suggestions") {
      templateSuggestions = (event.suggestions || []).slice(0, 3)
      return
    }
    if (event.type === "draft_state") {
      draftState = "working"
      status = "Drafting " + draftKind + "…"
      return
    }
    if (event.type === "draft_progress") {
      var nextProgress = draftProgress.slice(-3)
      nextProgress.push({ phase: String(event.phase || "working"), message: String(event.message || "Drafting…").slice(0, 160) })
      draftProgress = nextProgress
      status = String(event.message || status)
      return
    }
    if (event.type === "draft_plan") {
      draftPlan = (event.steps || []).slice(0, 5).map(function(step) { return String(step || "").slice(0, 100) })
      draftPlanStep = Math.max(0, Math.min(draftPlan.length - 1, Number(event.currentStep) || 0))
      draftPlanStatus = String(event.status || "working") === "complete" ? "complete" : "working"
      status = draftPlan.length > 0 ? draftPlan[draftPlanStep] : status
      return
    }
    if (event.type === "draft") {
      draft = event.draft || null
      draftId = String(event.id || "")
      draftState = "ready"
      status = draft && draft.kind === "out-of-scope" ? "This belongs in the default agent"
        : draft && draft.kind === "clarification" ? "The drafting agent needs one detail"
        : "Draft ready for review"
      return
    }
    if (event.type === "draft_saved") {
      draft = null
      draftId = ""
      draftState = "saved"
      draftProgress = []
      draftPlan = []
      draftPlanStatus = "idle"
      status = event.kind === "integration" ? "Integration installed disabled" : "Template saved"
      return
    }
    if (event.type === "template_saved") {
      templateEditState = "saved"
      templateEditMessage = "Template saved"
      status = "Template saved"
      return
    }
    if (event.type === "privacy") {
      privacy = event.policy || privacy
      return
    }
    if (event.type === "agent_status") {
      agentConnection = {
        connected: event.connected === true,
        provider: String(event.provider || ""),
        model: String(event.model || "")
      }
      return
    }
    if (event.type === "auth_methods") {
      authMethods = event.methods || []
      return
    }
    if (event.type === "auth") {
      auth = {
        phase: String(event.phase || "idle"), flowId: String(event.flowId || ""),
        methodId: String(event.methodId || ""), message: String(event.message || ""),
        url: String(event.url || ""), verificationUri: String(event.verificationUri || ""),
        userCode: String(event.userCode || ""), prompt: event.prompt || null
      }
      if (auth.phase === "complete") clearError()
      return
    }
    if (event.type === "dictation") {
      dictationAvailable = event.available === true
      dictationState = String(event.state || "idle")
      if (dictationState === "recording") status = "Listening…"
      else if (dictationState === "transcribing") status = "Transcribing…"
      else if (event.transcript) status = "Dictation ready"
      if (event.transcript) transcript = String(event.transcript)
      return
    }
    if (event.type === "attention") {
      attentionCount = Number(event.count || 0)
      var nextAcknowledged = {}
      var ids = event.acknowledgedIds || []
      for (var index = 0; index < ids.length; index++) nextAcknowledged[String(ids[index])] = true
      acknowledgedAttention = nextAcknowledged
      return
    }
    if (event.type === "digest_state") {
      digestState = "working"
      status = "Building your digest…"
      return
    }
    if (event.type === "digest_skipped") {
      digestState = "idle"
      status = String(event.reason || "No digest was needed")
      return
    }
    if (event.type === "digest") {
      digest = event.digest || null
      digestState = "ready"
      root.requestDigestHistory()
      status = "Digest ready"
      return
    }
    if (event.type === "digest_history") {
      digestHistory = event.digests || []
      return
    }
    if (event.type === "data_deleted") {
      dataDeleteState = "complete"
      dataDeleteTarget = String(event.target || "")
      dataDeleteMessage = dataDeleteTarget === "digest-history" ? "Digest history deleted"
        : dataDeleteTarget === "notification-history" ? "OmaDigest notification history deleted"
        : dataDeleteTarget === "integrations" ? "Integration data deleted"
        : dataDeleteTarget === "templates" ? "Custom templates deleted"
        : "OmaDigest history, integrations, and templates deleted"
      if (dataDeleteTarget === "digest-history" || dataDeleteTarget === "all") {
        digest = null
        digestState = "idle"
        digestHistory = []
      }
      if (dataDeleteTarget === "notification-history" || dataDeleteTarget === "all") {
        attentionCount = 0
        acknowledgedAttention = ({})
      }
      if (dataDeleteTarget === "integrations" || dataDeleteTarget === "all") integrationSetup = ({})
      dataDeleteRevision += 1
      status = dataDeleteMessage
      return
    }
    if (event.type === "tts") {
      tts = { configured: event.configured === true, state: String(event.state || "idle"), config: event.config || null }
      if (tts.state === "playing") status = "Reading digest…"
      else if (tts.state === "paused") status = "Read mode paused"
      return
    }
    if (event.type === "handoff") {
      if (event.target === "authoring-agent") {
        authoringState = "launched"
        authoringMessage = "Authoring session opened. Return here after the agent installs the validated integration."
      }
      status = event.target === "herdr" ? "Continued in Herdr" : "Opened in the default agent"
      return
    }
    if (event.type === "authoring_skill") {
      authoringSkillState = "installed"
      authoringSkillMessage = "Authoring skill linked for the default agent"
      status = "Authoring skill installed"
      return
    }
    if (event.type === "integration_setup") {
      var setupStatus = event.status || ({})
      var nextSetup = Object.assign({}, integrationSetup)
      nextSetup[String(event.integrationId)] = {
        ready: event.ready === true,
        state: String(setupStatus.state || (event.ready === true ? "ready" : "error")),
        message: String(setupStatus.message || event.message || ""),
        checkedAt: String(setupStatus.checkedAt || ""),
        action: setupStatus.action || null
      }
      integrationSetup = nextSetup
      status = String(event.message || (event.ready ? "Integration ready" : "Integration setup failed"))
      return
    }
    if (event.type === "integrations") {
      integrations = event.integrations || []
      status = "Integration settings saved"
      return
    }
    if (event.type === "integration_status") {
      var sourceStatus = event.status || ({})
      var statuses = Object.assign({}, integrationStatus)
      statuses[String(event.integrationId)] = {
        checking: String(sourceStatus.state || "") === "checking",
        ready: event.ready === true,
        state: String(sourceStatus.state || (event.ready === true ? "ready" : "error")),
        message: String(sourceStatus.message || event.message || ""),
        checkedAt: String(sourceStatus.checkedAt || new Date().toISOString()),
        action: sourceStatus.action || null
      }
      integrationStatus = statuses
      status = event.ready === true ? "Integration ready" : "Integration needs attention"
      return
    }
    if (event.type === "template_selected") {
      selection = event.selection || null
      state = "ready"
      status = selection ? "Selected " + selection.name : "Template selected"
      return
    }
    if (event.type === "error") {
      state = String(event.code || "") === "protocol_mismatch" ? "error" : "ready"
      if (String(event.id || "").indexOf("draft-") === 0) draftState = "error"
      if (String(event.id || "").indexOf("authoring-") === 0
        && String(event.id || "").indexOf("authoring-skill-") !== 0) {
        authoringState = "error"
        authoringMessage = String(event.message || "The authoring session could not open.")
      }
      if (String(event.id || "").indexOf("authoring-skill-") === 0) {
        authoringSkillState = "error"
        authoringSkillMessage = String(event.message || "The authoring skill could not be installed.")
      }
      if (String(event.id || "").indexOf("digest-") === 0) digestState = "error"
      if (String(event.id || "").indexOf("data-delete-") === 0) {
        dataDeleteState = "error"
        dataDeleteMessage = String(event.message || "OmaDigest data could not be deleted.")
      }
      errorCode = String(event.code || "unknown")
      errorMessage = String(event.message || "OmaDigest encountered an error.")
      if (String(event.id || "").indexOf("template-edit-") === 0) {
        templateEditState = "error"
        templateEditMessage = errorMessage
      }
      status = "Ready"
    }
  }

  Timer {
    interval: 1000
    running: root.tts.state === "playing" || root.tts.state === "paused"
    repeat: true
    onTriggered: root.requestTtsStatus()
  }

  Process {
    id: broker
    command: [root.brokerPath]
    stdinEnabled: true
    running: true

    onStarted: root.send({ type: "initialize", protocolVersion: root.protocolVersion })
    onExited: function(exitCode, exitStatus) {
      root.ready = false
      root.state = "error"
      root.status = "OmaDigest broker stopped"
    }

    stdout: SplitParser {
      onRead: function(line) {
        try { root.applyEvent(JSON.parse(line)) }
        catch (error) { console.warn("omadigest: invalid broker event") }
      }
    }

    stderr: SplitParser {
      onRead: function(line) {
        var message = String(line || "").trim()
        if (message) console.warn("omadigest: " + message)
      }
    }
  }
}
